import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WecomLinkCache, LeadCase, LeadIdentity, CaseActivity,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';

export function wecomMode(): 'mock' | 'real' {
  const v = (process.env.WECOM_MODE || 'mock').toLowerCase();
  return v === 'real' ? 'real' : 'mock';
}

export function wecomConfigured(): boolean {
  return !!(process.env.WECOM_CORP_ID && process.env.WECOM_AGENT_ID && process.env.WECOM_SECRET);
}

@Injectable()
export class WecomService {
  constructor(
    @InjectRepository(WecomLinkCache) private readonly cache: Repository<WecomLinkCache>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    @InjectRepository(LeadIdentity) private readonly identities: Repository<LeadIdentity>,
    @InjectRepository(CaseActivity) private readonly activities: Repository<CaseActivity>,
    private readonly events: EventsService,
  ) {}

  status() {
    const mode = wecomMode();
    const configured = wecomConfigured();
    return {
      mode,
      configured,
      corp_id_set: !!process.env.WECOM_CORP_ID,
      agent_id_set: !!process.env.WECOM_AGENT_ID,
      secret_set: !!process.env.WECOM_SECRET,
      honest_label: mode === 'mock' || !configured
        ? 'MOCK 演示模式（无企微官方密钥；不调用企微 API）'
        : 'REAL（需官方自建应用 corpId/agentId/secret）',
      setup_hint: configured
        ? null
        : '配置 WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_SECRET 并设 WECOM_MODE=real 后启用官方侧边栏；当前可 MOCK 演示写跟进。',
    };
  }

  async resolveContext(user: AuthUser, query: {
    external_userid?: string; phone?: string; case_id?: string; mock?: string;
  }) {
    const st = this.status();
    if (st.mode === 'real' && !st.configured) {
      return {
        ...st,
        case: null,
        identity: null,
        error: 'REAL 模式缺少企微密钥，已失败关闭。请改 WECOM_MODE=mock 或补全官方应用配置。',
      };
    }

    let caseRow: LeadCase | null = null;
    let identity: LeadIdentity | null = null;

    if (query.case_id) {
      caseRow = await this.cases.findOne({ where: { id: query.case_id, tenant_id: user.tenant_id } });
    }

    if (!caseRow && query.phone) {
      identity = await this.identities.findOne({
        where: { tenant_id: user.tenant_id, phone: query.phone },
      });
      if (identity) {
        caseRow = await this.cases.findOne({
          where: { tenant_id: user.tenant_id, identity_id: identity.id },
          order: { updated_at: 'DESC' },
        });
      }
    }

    if (!caseRow && query.external_userid) {
      let link = await this.cache.findOne({
        where: { tenant_id: user.tenant_id, external_userid: query.external_userid },
      });
      if (link?.case_id) {
        caseRow = await this.cases.findOne({ where: { id: link.case_id, tenant_id: user.tenant_id } });
      }
      if (!caseRow && (st.mode === 'mock' || query.mock === '1')) {
        // MOCK: pick most recent private case for demo, or any case
        caseRow = await this.cases.findOne({
          where: { tenant_id: user.tenant_id },
          order: { updated_at: 'DESC' },
        });
        if (caseRow) {
          if (!link) {
            link = this.cache.create({
              tenant_id: user.tenant_id,
              external_userid: query.external_userid,
              case_id: caseRow.id,
              phone: null,
              raw: { mock: true },
            });
          } else {
            link.case_id = caseRow.id;
            link.raw = { ...(link.raw || {}), mock: true };
          }
          await this.cache.save(link);
        }
      }
    }

    if (caseRow && !identity) {
      identity = await this.identities.findOne({ where: { id: caseRow.identity_id } });
    }

    return {
      ...st,
      case: caseRow ? {
        id: caseRow.id,
        stage: caseRow.stage,
        product_code: caseRow.product_code,
        next_follow_at: caseRow.next_follow_at,
        sea_status: caseRow.sea_status,
      } : null,
      identity: identity ? {
        name: identity.name,
        phone: identity.phone,
        company_name: identity.company_name,
      } : null,
      tags: (caseRow?.flags?.tags as string[]) || [],
    };
  }

  async followUp(user: AuthUser, body: {
    case_id: string; body: string; next_follow_at: string; tags?: string[]; result?: string;
  }) {
    if (!body.case_id) throw new BadRequestException('case_id 必填');
    if (!body.body?.trim()) throw new BadRequestException('跟进内容不能为空');
    if (!body.next_follow_at) throw new BadRequestException('下次跟进时间必填（next_follow_at）');
    const next = new Date(body.next_follow_at);
    if (Number.isNaN(next.getTime())) throw new BadRequestException('next_follow_at 无效');

    const c = await this.cases.findOne({ where: { id: body.case_id, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');

    const activity = await this.activities.save(this.activities.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      actor_user_id: user.sub,
      kind: 'wecom_followup',
      body: body.body.trim(),
      meta: {
        source: 'wecom_sidepanel',
        mode: wecomMode(),
        result: body.result || null,
        next_follow_at: next.toISOString(),
        tags: body.tags || [],
      },
    }));

    c.next_follow_at = next;
    c.follow_up_status = 'open';
    c.last_touch_at = new Date();
    if (Array.isArray(body.tags) && body.tags.length) {
      c.flags = { ...(c.flags || {}), tags: body.tags.map(String) };
    }
    await this.cases.save(c);

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'wecom.followup_added',
      actor: user.sub,
      payload: { activity_id: activity.id, mode: wecomMode() },
    });

    return {
      activity,
      case: { id: c.id, next_follow_at: c.next_follow_at, flags: c.flags },
      mode: wecomMode(),
    };
  }

  async tag(user: AuthUser, body: { case_id: string; tags: string[] }) {
    const c = await this.cases.findOne({ where: { id: body.case_id, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');
    if (!Array.isArray(body.tags)) throw new BadRequestException('tags 须为数组');
    c.flags = { ...(c.flags || {}), tags: body.tags.map(String) };
    c.last_touch_at = new Date();
    await this.cases.save(c);
    return { case_id: c.id, tags: c.flags.tags };
  }
}
