import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesScript, LeadCase } from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';

@Injectable()
export class ScriptsService {
  constructor(
    @InjectRepository(SalesScript) private readonly scripts: Repository<SalesScript>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    private readonly events: EventsService,
  ) {}

  async list(user: AuthUser, scene?: string) {
    const qb = this.scripts.createQueryBuilder('s')
      .where('s.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('s.enabled = true');
    if (scene) qb.andWhere('s.scene = :scene', { scene });
    return qb.orderBy('s.updated_at', 'DESC').getMany();
  }

  async listAll(user: AuthUser) {
    return this.scripts.find({
      where: { tenant_id: user.tenant_id },
      order: { updated_at: 'DESC' },
    });
  }

  async create(user: AuthUser, body: {
    scene: string; title: string; body: string; tags?: string[];
  }) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    if (!body.scene?.trim() || !body.title?.trim() || !body.body?.trim()) {
      throw new BadRequestException('场景、标题、正文均必填');
    }
    const row = await this.scripts.save(this.scripts.create({
      tenant_id: user.tenant_id,
      scene: body.scene.trim(),
      title: body.title.trim(),
      body: body.body.trim(),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      enabled: true,
      created_by: user.sub,
    }));
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'script.create',
      resource_type: 'SalesScript', resource_id: row.id, detail: { scene: row.scene, title: row.title },
    });
    return row;
  }

  async update(user: AuthUser, id: string, body: Partial<{
    scene: string; title: string; body: string; tags: string[]; enabled: boolean;
  }>) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    const row = await this.scripts.findOne({ where: { id, tenant_id: user.tenant_id } });
    if (!row) throw new NotFoundException('话术不存在');
    if (body.scene != null) row.scene = body.scene.trim();
    if (body.title != null) row.title = body.title.trim();
    if (body.body != null) row.body = body.body.trim();
    if (body.tags != null) row.tags = body.tags.map(String);
    if (body.enabled != null) row.enabled = !!body.enabled;
    await this.scripts.save(row);
    return row;
  }

  async remove(user: AuthUser, id: string) {
    if (!(user.role === 'admin' || user.role === 'supervisor')) {
      throw new ForbiddenException('仅经理可删除话术');
    }
    const row = await this.scripts.findOne({ where: { id, tenant_id: user.tenant_id } });
    if (!row) throw new NotFoundException('话术不存在');
    row.enabled = false;
    await this.scripts.save(row);
    return { ok: true, id };
  }

  /** Recommend scripts for a case by stage/product heuristics. */
  async recommend(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');
    const sceneHints: string[] = [];
    if (c.stage === 'NEW' || c.stage === 'QUALIFIED') sceneHints.push('开场', '初筛');
    else if (c.stage === 'REACHING' || c.stage === 'ASSIGNED') sceneHints.push('触达', '开场');
    else if (c.stage === 'IN_DIALOG' || c.stage === 'APPOINTMENT_PENDING') sceneHints.push('邀约', '异议');
    else if (c.stage === 'APPOINTED') sceneHints.push('确认', '异议');
    else if (c.stage === 'WON') sceneHints.push('回款', '转介绍');
    else sceneHints.push('培育');

    const all = await this.scripts.find({
      where: { tenant_id: user.tenant_id, enabled: true },
      order: { updated_at: 'DESC' },
      take: 50,
    });
    const scored = all.map((s) => {
      let score = 0;
      if (sceneHints.includes(s.scene)) score += 3;
      if (c.product_code && (s.tags || []).includes(c.product_code)) score += 2;
      if ((s.tags || []).some((t) => sceneHints.includes(t))) score += 1;
      return { script: s, score };
    }).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    const items = (scored.length ? scored : all.slice(0, 5).map((s) => ({ script: s, score: 0 })))
      .slice(0, 5)
      .map((x) => x.script);
    return {
      case_id: caseId,
      stage: c.stage,
      scene_hints: sceneHints,
      items,
      empty: items.length === 0,
      empty_hint: items.length === 0 ? '话术库为空，请先在「话术库」创建场景话术' : null,
    };
  }
}
