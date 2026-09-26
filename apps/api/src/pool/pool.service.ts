import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  LeadCase, Ownership, PoolItem, PoolRule, PoolAuditLog, AgentSeat, LeadIdentity,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';

const DEFAULT_RULES = {
  max_private_cases: 50,
  protect_hours: 48,
  idle_days_to_recycle: 7,
  enabled: true,
};

@Injectable()
export class PoolService {
  constructor(
    @InjectRepository(PoolRule) private readonly rules: Repository<PoolRule>,
    @InjectRepository(PoolAuditLog) private readonly audits: Repository<PoolAuditLog>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    @InjectRepository(Ownership) private readonly ownerships: Repository<Ownership>,
    @InjectRepository(PoolItem) private readonly poolItems: Repository<PoolItem>,
    @InjectRepository(AgentSeat) private readonly seats: Repository<AgentSeat>,
    @InjectRepository(LeadIdentity) private readonly identities: Repository<LeadIdentity>,
    private readonly events: EventsService,
    private readonly dataSource: DataSource,
  ) {}

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
  }

  async getOrCreateRules(tenantId: string): Promise<PoolRule> {
    let r = await this.rules.findOne({ where: { tenant_id: tenantId } });
    if (!r) {
      r = await this.rules.save(this.rules.create({ tenant_id: tenantId, ...DEFAULT_RULES }));
    }
    return r;
  }

  async getRules(user: AuthUser) {
    return this.getOrCreateRules(user.tenant_id);
  }

  async putRules(user: AuthUser, body: Partial<{
    max_private_cases: number; protect_hours: number; idle_days_to_recycle: number; enabled: boolean;
  }>) {
    if (!this.isAdmin(user)) throw new ForbiddenException('仅经理/管理员可改公海规则');
    const r = await this.getOrCreateRules(user.tenant_id);
    const before = {
      max_private_cases: r.max_private_cases,
      protect_hours: r.protect_hours,
      idle_days_to_recycle: r.idle_days_to_recycle,
      enabled: r.enabled,
    };
    if (body.max_private_cases != null) {
      const n = Number(body.max_private_cases);
      if (!Number.isFinite(n) || n < 1 || n > 5000) throw new BadRequestException('max_private_cases 无效');
      r.max_private_cases = Math.floor(n);
    }
    if (body.protect_hours != null) {
      const n = Number(body.protect_hours);
      if (!Number.isFinite(n) || n < 0 || n > 720) throw new BadRequestException('protect_hours 无效');
      r.protect_hours = Math.floor(n);
    }
    if (body.idle_days_to_recycle != null) {
      const n = Number(body.idle_days_to_recycle);
      if (!Number.isFinite(n) || n < 1 || n > 365) throw new BadRequestException('idle_days_to_recycle 无效');
      r.idle_days_to_recycle = Math.floor(n);
    }
    if (body.enabled != null) r.enabled = !!body.enabled;
    await this.rules.save(r);
    await this.audits.save(this.audits.create({
      tenant_id: user.tenant_id,
      actor_user_id: user.sub,
      case_id: null,
      action: 'pool.rules_updated',
      detail: { before, after: {
        max_private_cases: r.max_private_cases,
        protect_hours: r.protect_hours,
        idle_days_to_recycle: r.idle_days_to_recycle,
        enabled: r.enabled,
      } },
    }));
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'pool.rules_updated',
      resource_type: 'PoolRule', resource_id: r.id,
      detail: { after: { max_private_cases: r.max_private_cases, protect_hours: r.protect_hours, idle_days_to_recycle: r.idle_days_to_recycle, enabled: r.enabled } },
    });
    return r;
  }

  async listPublic(user: AuthUser, limit = 50) {
    const rows = await this.cases.createQueryBuilder('c')
      .where('c.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('c.sea_status = :sea', { sea: 'public' })
      .orderBy('c.updated_at', 'DESC')
      .take(Math.min(200, Math.max(1, limit)))
      .getMany();
    const out = [];
    for (const c of rows) {
      const idn = await this.identities.findOne({ where: { id: c.identity_id } });
      out.push({
        case_id: c.id,
        stage: c.stage,
        product_code: c.product_code,
        last_touch_at: c.last_touch_at,
        updated_at: c.updated_at,
        company_name: idn?.company_name || null,
        name: idn?.name || null,
        phone_masked: idn?.phone ? `${idn.phone.slice(0, 3)}****${idn.phone.slice(-4)}` : null,
      });
    }
    return { rules: await this.getOrCreateRules(user.tenant_id), items: out };
  }

  async listAudits(user: AuthUser, limit = 50) {
    if (!this.isAdmin(user)) throw new ForbiddenException('仅经理可查看公海审计');
    return this.audits.find({
      where: { tenant_id: user.tenant_id },
      order: { created_at: 'DESC' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  private async countPrivate(tenantId: string, seatId: string): Promise<number> {
    return this.cases.count({
      where: { tenant_id: tenantId, owner_agent_id: seatId, sea_status: 'private' },
    });
  }

  /**
   * Concurrent-safe claim: transaction + SELECT FOR UPDATE on lead_cases row.
   * Only one seat wins when multiple claim the same public case.
   */
  async claim(user: AuthUser, caseId: string) {
    if (!user.agent_seat_id && !this.isAdmin(user)) {
      throw new ForbiddenException('无坐席身份，无法领取');
    }
    const seatId = user.agent_seat_id;
    if (!seatId) throw new BadRequestException('缺少 agent_seat_id');

    const rules = await this.getOrCreateRules(user.tenant_id);
    if (!rules.enabled) throw new BadRequestException('公海规则已停用，暂不可领取');

    const privateCount = await this.countPrivate(user.tenant_id, seatId);
    if (privateCount >= rules.max_private_cases) {
      throw new BadRequestException(`已达私海上限 ${rules.max_private_cases}，请先释放或跟进`);
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .createQueryBuilder(LeadCase, 'c')
        .setLock('pessimistic_write')
        .where('c.id = :id AND c.tenant_id = :tid', { id: caseId, tid: user.tenant_id })
        .getOne();
      if (!locked) throw new NotFoundException('案件不存在');
      if (locked.sea_status !== 'public') {
        throw new BadRequestException('案件不在公海或已被领取');
      }
      if (locked.protected_until && new Date(locked.protected_until) > new Date()) {
        throw new BadRequestException('案件仍在保护期内，不可领取');
      }

      const existing = await manager.findOne(Ownership, {
        where: { case_id: locked.id, status: 'active' },
      });
      if (existing) {
        existing.status = 'released';
        await manager.save(existing);
      }

      const protectUntil = new Date(Date.now() + rules.protect_hours * 3600 * 1000);
      const ownership = await manager.save(manager.create(Ownership, {
        tenant_id: user.tenant_id,
        case_id: locked.id,
        agent_id: seatId,
        reason: 'pool_claim',
        protect_until: protectUntil,
        status: 'active',
      }));

      locked.owner_agent_id = seatId;
      locked.sea_status = 'private';
      locked.protected_until = protectUntil;
      locked.last_touch_at = new Date();
      if (locked.stage === 'NEW' || locked.stage === 'QUALIFIED') locked.stage = 'ASSIGNED';
      await manager.save(locked);

      let poolItem = await manager.findOne(PoolItem, { where: { case_id: locked.id } });
      if (poolItem) {
        poolItem.status = 'claimed';
        poolItem.last_owner_id = seatId;
        await manager.save(poolItem);
      } else {
        await manager.save(manager.create(PoolItem, {
          tenant_id: user.tenant_id,
          case_id: locked.id,
          reason: 'claimed_from_public',
          status: 'claimed',
          last_owner_id: seatId,
        }));
      }

      const seat = await manager.findOne(AgentSeat, { where: { id: seatId } });
      if (seat) {
        seat.current_load = (seat.current_load || 0) + 1;
        await manager.save(seat);
      }

      await manager.save(manager.create(PoolAuditLog, {
        tenant_id: user.tenant_id,
        actor_user_id: user.sub,
        case_id: locked.id,
        action: 'pool.claim',
        detail: { seat_id: seatId, protect_until: protectUntil.toISOString() },
      }));

      return { case: locked, ownership, protect_until: protectUntil };
    });

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: caseId, type: 'pool.claimed',
      actor: user.sub, payload: { seat_id: seatId },
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'pool.claim',
      resource_type: 'LeadCase', resource_id: caseId, detail: { seat_id: seatId },
    });
    return result;
  }

  async release(user: AuthUser, caseId: string, reason = 'manual_release') {
    const c = await this.cases.findOne({ where: { id: caseId, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');
    if (!this.isAdmin(user) && c.owner_agent_id !== user.agent_seat_id) {
      throw new ForbiddenException('只能释放自己私海的案件');
    }
    const prevOwner = c.owner_agent_id;
    const existing = await this.ownerships.findOne({ where: { case_id: c.id, status: 'active' } });
    if (existing) {
      existing.status = 'released';
      await this.ownerships.save(existing);
    }
    c.owner_agent_id = null;
    c.sea_status = 'public';
    c.protected_until = null;
    await this.cases.save(c);

    let poolItem = await this.poolItems.findOne({ where: { case_id: c.id } });
    if (poolItem) {
      poolItem.status = 'open';
      poolItem.reason = reason;
      poolItem.last_owner_id = prevOwner;
      poolItem.claimable_from = new Date();
      await this.poolItems.save(poolItem);
    } else {
      await this.poolItems.save(this.poolItems.create({
        tenant_id: user.tenant_id,
        case_id: c.id,
        reason,
        status: 'open',
        last_owner_id: prevOwner,
      }));
    }

    if (prevOwner) {
      const seat = await this.seats.findOne({ where: { id: prevOwner } });
      if (seat && seat.current_load > 0) {
        seat.current_load -= 1;
        await this.seats.save(seat);
      }
    }

    await this.audits.save(this.audits.create({
      tenant_id: user.tenant_id,
      actor_user_id: user.sub,
      case_id: c.id,
      action: 'pool.release',
      detail: { reason, prev_owner: prevOwner },
    }));
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: caseId, type: 'pool.released',
      actor: user.sub, payload: { reason, prev_owner: prevOwner },
    });
    return { case: c };
  }

  /** Idle recycle: private cases with last_touch older than idle_days → public. */
  async recycleIdle(tenantId?: string): Promise<{ recycled: number; items: string[] }> {
    const tenants = tenantId
      ? [await this.getOrCreateRules(tenantId)]
      : await this.rules.find();
    let recycled = 0;
    const items: string[] = [];
    for (const rule of tenants) {
      if (!rule.enabled) continue;
      const cutoff = new Date(Date.now() - rule.idle_days_to_recycle * 24 * 3600 * 1000);
      const stale = await this.cases.createQueryBuilder('c')
        .where('c.tenant_id = :tid', { tid: rule.tenant_id })
        .andWhere('c.sea_status = :sea', { sea: 'private' })
        .andWhere('(c.last_touch_at IS NULL OR c.last_touch_at < :cut)', { cut: cutoff })
        .andWhere('(c.protected_until IS NULL OR c.protected_until < now())')
        .getMany();
      for (const c of stale) {
        const prevOwner = c.owner_agent_id;
        const own = await this.ownerships.findOne({ where: { case_id: c.id, status: 'active' } });
        if (own) {
          own.status = 'released';
          await this.ownerships.save(own);
        }
        c.owner_agent_id = null;
        c.sea_status = 'public';
        c.protected_until = null;
        await this.cases.save(c);
        let poolItem = await this.poolItems.findOne({ where: { case_id: c.id } });
        if (poolItem) {
          poolItem.status = 'open';
          poolItem.reason = 'idle_recycle';
          poolItem.last_owner_id = prevOwner;
          poolItem.claimable_from = new Date();
          await this.poolItems.save(poolItem);
        } else {
          await this.poolItems.save(this.poolItems.create({
            tenant_id: rule.tenant_id,
            case_id: c.id,
            reason: 'idle_recycle',
            status: 'open',
            last_owner_id: prevOwner,
          }));
        }
        if (prevOwner) {
          const seat = await this.seats.findOne({ where: { id: prevOwner } });
          if (seat && seat.current_load > 0) {
            seat.current_load -= 1;
            await this.seats.save(seat);
          }
        }
        await this.audits.save(this.audits.create({
          tenant_id: rule.tenant_id,
          actor_user_id: null,
          case_id: c.id,
          action: 'pool.idle_recycle',
          detail: { prev_owner: prevOwner, idle_days: rule.idle_days_to_recycle },
        }));
        recycled += 1;
        items.push(c.id);
      }
    }
    return { recycled, items };
  }
}
