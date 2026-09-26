import * as crypto from 'crypto';
import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  fetchPublicSource,
  normalizeCompanyUrl,
  publicCompanyMergeKey,
  retainSourceHistory,
  buildVerificationExplanation,
  type PublicFetchStatus,
  type SourceHistoryEntry,
} from '../common/public-fetch';
import {
  LeadIdentity, LeadSource, LeadCase, ConsentGrant, Ownership, PoolItem,
  ReachPlan, ReachAttempt, ReachReceipt, Appointment, AgentSeat, SkillGroup,
  CaseActivity, Tenant, User, Order, CONSENT_TEXT_V1, CONSENT_VERSION,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';
import { getProduct } from '../common/products';

export type IntakeBody = {
  phone?: string; name?: string; email?: string; company_name?: string;
  source_type?: string; source_channel?: string; campaign?: string; path?: string;
  consent_channels?: string[]; raw?: Record<string, unknown>;
  product_code?: string;
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string; invite_code?: string;
  landing_url?: string; form_id?: string;
  consent_accepted?: boolean;
  consent_text?: string; consent_version?: string;
};

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(LeadIdentity) private readonly identities: Repository<LeadIdentity>,
    @InjectRepository(LeadSource) private readonly sources: Repository<LeadSource>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    @InjectRepository(ConsentGrant) private readonly consents: Repository<ConsentGrant>,
    @InjectRepository(Ownership) private readonly ownerships: Repository<Ownership>,
    @InjectRepository(PoolItem) private readonly pool: Repository<PoolItem>,
    @InjectRepository(ReachPlan) private readonly plans: Repository<ReachPlan>,
    @InjectRepository(ReachAttempt) private readonly attempts: Repository<ReachAttempt>,
    @InjectRepository(ReachReceipt) private readonly receipts: Repository<ReachReceipt>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(AgentSeat) private readonly seats: Repository<AgentSeat>,
    @InjectRepository(SkillGroup) private readonly groups: Repository<SkillGroup>,
    @InjectRepository(CaseActivity) private readonly activities: Repository<CaseActivity>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly events: EventsService,
    private readonly dataSource: DataSource,
  ) {}

  private assertTenant(rowTenant: string, user: AuthUser) {
    if (rowTenant !== user.tenant_id) throw new ForbiddenException('跨租户访问被拒绝');
  }

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
  }

  /** 销售仅可访问未分配或本人名下案件；管理员/经理/只读访客可看全量。 */
  private assertCaseAccess(user: AuthUser, c: LeadCase, mode: 'read' | 'write' = 'read') {
    if (this.isAdmin(user)) return;
    if (user.role === 'viewer') {
      if (mode === 'write') throw new ForbiddenException('只读访客禁止写操作');
      return;
    }
    // agent / 其他业务角色：归属校验
    const seat = user.agent_seat_id;
    if (!seat) throw new ForbiddenException('无坐席身份，禁止访问案件');
    if (c.owner_agent_id && c.owner_agent_id !== seat) {
      throw new ForbiddenException('无权访问其他销售的客户');
    }
  }

  async resolveDemoTenant(): Promise<Tenant> {
    const slug = process.env.DEMO_TENANT_SLUG || 'demo';
    let t = await this.tenants.findOne({ where: { slug } });
    if (!t) t = await this.tenants.findOne({ where: { name: '演示销售公司' } });
    if (!t) throw new NotFoundException('演示租户未初始化，请先启动 seed');
    return t;
  }

  async publicIntake(body: IntakeBody & {
    ip?: string; user_agent?: string;
  }) {
    if (!body.consent_accepted) {
      throw new BadRequestException('须勾选明确同意后才能提交');
    }
    const tenant = await this.resolveDemoTenant();
    const fakeUser: AuthUser = {
      sub: 'public-landing',
      tenant_id: tenant.id,
      email: 'public@landing.local',
      role: 'system',
    };
    return this.intake(fakeUser, body, {
      ip: body.ip,
      user_agent: body.user_agent,
      requireExplicitConsent: true,
    });
  }

  async intake(
    user: AuthUser,
    body: IntakeBody,
    meta?: { ip?: string; user_agent?: string; requireExplicitConsent?: boolean },
  ) {
    if (meta?.requireExplicitConsent && !body.consent_accepted) {
      throw new BadRequestException('须勾选明确同意后才能提交');
    }
    const phone = (body.phone || '').replace(/\D/g, '');
    if (!phone && !body.email) throw new BadRequestException('需要手机号或邮箱');
    const mergeKey = phone ? `phone:${phone}` : `email:${(body.email || '').toLowerCase()}`;
    const product = getProduct(body.product_code);

    let identity = await this.identities.findOne({ where: { tenant_id: user.tenant_id, merge_key: mergeKey } });
    let merged = false;
    if (!identity) {
      identity = await this.identities.save(this.identities.create({
        tenant_id: user.tenant_id,
        phone: phone || null,
        email: body.email || null,
        name: body.name || null,
        company_name: body.company_name || null,
        merge_key: mergeKey,
      }));
    } else {
      merged = true;
      if (body.name && !identity.name) identity.name = body.name;
      if (body.email && !identity.email) identity.email = body.email;
      if (body.company_name && !identity.company_name) identity.company_name = body.company_name;
      await this.identities.save(identity);
    }

    const source = await this.sources.save(this.sources.create({
      tenant_id: user.tenant_id,
      type: body.source_type || 'landing_form',
      campaign: body.utm_campaign || body.campaign || product.code,
      landing_url: body.landing_url || null,
      form_id: body.form_id || `landing:${product.code}`,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || body.campaign || null,
      utm_content: body.utm_content || null,
      utm_term: body.utm_term || null,
      invite_code: body.invite_code || null,
      product_code: product.code,
      raw_payload: body.raw || {
        product_code: product.code,
        invite_code: body.invite_code,
        utm: {
          source: body.utm_source,
          medium: body.utm_medium,
          campaign: body.utm_campaign,
          content: body.utm_content,
          term: body.utm_term,
        },
      },
    }));

    const leadCase = await this.cases.save(this.cases.create({
      tenant_id: user.tenant_id,
      identity_id: identity.id,
      source_id: source.id,
      path: body.path || 'STANDARD',
      stage: 'NEW',
      scene_id: `landing:${product.code}`,
      product_code: product.code,
      sea_status: 'public',
      last_touch_at: new Date(),
    }));

    const consentText = body.consent_text || CONSENT_TEXT_V1;
    const consentVersion = body.consent_version || CONSENT_VERSION;
    const consentHash = crypto.createHash('sha256').update(consentText).digest('hex');
    const channels = body.consent_channels?.length ? body.consent_channels : ['call', 'sms', 'email'];
    const grantedAt = new Date();
    const sourceChannel = body.source_channel || body.utm_source || body.source_type || 'landing_form';
    for (const ch of channels) {
      await this.consents.save(this.consents.create({
        tenant_id: user.tenant_id,
        identity_id: identity.id,
        case_id: leadCase.id,
        channel: ch,
        status: 'granted',
        evidence_ref: `consent:${consentVersion}:${consentHash.slice(0, 12)}`,
        consent_text: consentText,
        consent_text_hash: consentHash,
        consent_version: consentVersion,
        source_channel: sourceChannel,
        consent_accepted_at: grantedAt,
        ip: meta?.ip || null,
        user_agent: meta?.user_agent || null,
        granted_at: grantedAt,
      }));
    }

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: leadCase.id, type: 'lead.captured',
      actor: user.sub,
      payload: {
        identity_id: identity.id, source_id: source.id, merge_key: mergeKey,
        merged, product_code: product.code, invite_code: body.invite_code || null,
      },
      aggregate_id: leadCase.id,
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub === 'public-landing' ? null : user.sub,
      action: 'lead.intake',
      resource_type: 'LeadCase', resource_id: leadCase.id,
      detail: {
        phone: phone ? phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
        product_code: product.code,
        merged,
        consent_version: consentVersion,
        consent_text_hash: consentHash,
        source_channel: sourceChannel,
        utm_source: body.utm_source || null,
        invite_code: body.invite_code || null,
        ip: meta?.ip || null,
      },
    });

    return {
      case: leadCase,
      identity: {
        id: identity.id,
        name: identity.name,
        phone: identity.phone ? identity.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
        email: identity.email,
        merge_key: identity.merge_key,
      },
      source,
      merged,
      product: { code: product.code, name_zh: product.name_zh },
    };
  }

  async qualify(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');
    if (c.stage !== 'NEW' && c.stage !== 'REJECTED') return { case: c };

    const callConsent = await this.consents.findOne({
      where: { tenant_id: user.tenant_id, identity_id: c.identity_id, channel: 'call', status: 'granted' },
    });
    if (!callConsent) {
      c.stage = 'REJECTED';
      c.flags = { ...c.flags, reject_reason: 'no_consent' };
      await this.cases.save(c);
      await this.events.emit({
        tenant_id: user.tenant_id, case_id: c.id, type: 'lead.rejected',
        actor: 'system', payload: { reason: 'no_consent' },
      });
      throw new BadRequestException('无外呼同意，已拒绝（INV-01）');
    }

    c.stage = 'QUALIFIED';
    await this.cases.save(c);

    const product = getProduct(c.product_code);
    const plan = await this.plans.save(this.plans.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      sequence: [{ channel: 'mock_call', max_attempts: 1, template_ref: `demo-script-${product.code}` }],
      status: 'active',
      version: 1,
    }));

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'lead.qualified',
      actor: 'system', payload: { path: c.path },
    });
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'lead.path_assigned',
      actor: 'system', payload: { path: c.path },
    });
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'reach.plan_created',
      actor: 'system', payload: { plan_id: plan.id },
      aggregate_type: 'ReachPlan', aggregate_id: plan.id,
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'lead.qualify',
      resource_type: 'LeadCase', resource_id: c.id, detail: { stage: c.stage },
    });

    return { case: c, plan };
  }

  async assign(user: AuthUser, caseId: string, agentSeatId?: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');
    if (c.stage === 'NEW') throw new BadRequestException('请先核验合格');

    let seat: AgentSeat | null = null;
    if (agentSeatId) {
      if (!this.isAdmin(user) && agentSeatId !== user.agent_seat_id) {
        throw new ForbiddenException('仅管理员可分配给其他坐席');
      }
      seat = await this.seats.findOne({ where: { id: agentSeatId, tenant_id: user.tenant_id } });
    } else if (user.agent_seat_id) {
      seat = await this.seats.findOne({ where: { id: user.agent_seat_id, tenant_id: user.tenant_id } });
    } else {
      const product = getProduct(c.product_code);
      const group = await this.groups
        .createQueryBuilder('g')
        .where('g.tenant_id = :tid', { tid: user.tenant_id })
        .andWhere(':skill = ANY(g.skills)', { skill: product.skill })
        .getOne();
      const qb = this.seats.createQueryBuilder('s')
        .where('s.tenant_id = :tid', { tid: user.tenant_id })
        .andWhere('s.online = true')
        .orderBy('s.current_load', 'ASC');
      if (group) qb.andWhere('s.skill_group_id = :gid', { gid: group.id });
      seat = await qb.getOne();
    }
    if (!seat) throw new BadRequestException('无可用坐席');

    const existing = await this.ownerships.findOne({ where: { case_id: c.id, status: 'active' } });
    if (existing) {
      existing.status = 'released';
      await this.ownerships.save(existing);
    }

    const protectUntil = new Date(Date.now() + 48 * 3600 * 1000);
    const ownership = await this.ownerships.save(this.ownerships.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      agent_id: seat.id,
      reason: this.isAdmin(user) && agentSeatId ? 'admin_assign' : 'manual_assign',
      protect_until: protectUntil,
      status: 'active',
    }));

    const poolItem = await this.pool.findOne({ where: { case_id: c.id } });
    if (poolItem) {
      poolItem.status = 'claimed';
      await this.pool.save(poolItem);
    }

    c.owner_agent_id = seat.id;
    c.skill_group_id = seat.skill_group_id;
    c.sea_status = 'private';
    c.protected_until = protectUntil;
    c.last_touch_at = new Date();
    if (c.stage === 'QUALIFIED') c.stage = 'ASSIGNED';
    await this.cases.save(c);

    seat.current_load += 1;
    await this.seats.save(seat);

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'case.assigned',
      actor: user.sub, payload: { agent_id: seat.id },
    });
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'ownership.bound',
      actor: user.sub,
      payload: { ownership_id: ownership.id, protect_until: protectUntil.toISOString() },
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'case.assign',
      resource_type: 'LeadCase', resource_id: c.id, detail: { agent_id: seat.id },
    });

    return { case: c, ownership, agent: seat };
  }

  async listAgents(user: AuthUser) {
    const seats = await this.seats.find({ where: { tenant_id: user.tenant_id }, order: { current_load: 'ASC' } });
    const result = [];
    for (const s of seats) {
      const u = await this.users.findOne({ where: { id: s.user_id } });
      result.push({
        seat_id: s.id,
        user_id: s.user_id,
        display_name: u?.display_name,
        email: u?.email,
        role: u?.role,
        online: s.online,
        current_load: s.current_load,
        skill_group_id: s.skill_group_id,
      });
    }
    return result;
  }

  async createReachAttempt(user: AuthUser, caseId: string, channel = 'mock_call') {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');

    const emailChannel = channel === 'email' || channel === 'mock_email';
    const realEnabled =
      (channel === 'sms' && process.env.REAL_SMS_ENABLED === 'true' && !!process.env.SMS_PROVIDER_API_KEY) ||
      (['human_call', 'robot_call'].includes(channel) && process.env.REAL_CALL_ENABLED === 'true' && !!process.env.CALL_PROVIDER_API_KEY) ||
      (emailChannel && process.env.REAL_EMAIL_ENABLED === 'true' && !!process.env.SMTP_HOST);
    // Email without SMTP: explicitly undelivered (not a successful MOCK)
    const emailUndelivered = emailChannel && !realEnabled;
    const isMock = !realEnabled;
    const effectiveChannel = isMock
      ? (channel.startsWith('mock_') ? channel : `mock_${channel}`)
      : channel;

    const mapped = ['mock_call', 'human_call', 'robot_call', 'mock_human_call'].includes(effectiveChannel)
      ? 'call' : effectiveChannel.includes('sms') ? 'sms' : effectiveChannel.replace(/^mock_/, '');
    const consent = await this.consents.findOne({
      where: { tenant_id: user.tenant_id, identity_id: c.identity_id, channel: mapped, status: 'granted' },
    });
    if (!consent) throw new ForbiddenException('通道无同意，禁止创建触达尝试（INV-01）');
    if (c.flags?.blocked || c.flags?.refused) {
      throw new ForbiddenException('案件已冻结/拒绝，禁止营销触达（INV-05）');
    }

    let plan = await this.plans.findOne({ where: { case_id: c.id, status: 'active' } });
    if (!plan) {
      plan = await this.plans.save(this.plans.create({
        tenant_id: user.tenant_id,
        case_id: c.id,
        sequence: [{ channel: effectiveChannel, max_attempts: 1 }],
        status: 'active',
      }));
    }

    const attempt = await this.attempts.save(this.attempts.create({
      tenant_id: user.tenant_id,
      plan_id: plan.id,
      case_id: c.id,
      channel: effectiveChannel,
      executor_ref: user.agent_seat_id || user.sub,
      template_ref: emailUndelivered ? 'email-undelivered-no-smtp' : 'demo-script',
      status: emailUndelivered ? 'undelivered' : 'running',
      provider_msg_id: emailUndelivered
        ? `UNDELIVERED-NO-SMTP-${Date.now()}`
        : (isMock ? `MOCK-${Date.now()}` : `provider-${Date.now()}`),
      is_mock: isMock,
      started_at: new Date(),
      ended_at: emailUndelivered ? new Date() : null,
    }));
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'reach.attempt_create',
      resource_type: 'ReachAttempt', resource_id: attempt.id,
      detail: { channel: effectiveChannel, mock: isMock, email_undelivered: emailUndelivered },
    });

    if (['QUALIFIED', 'ASSIGNED', 'REACHING'].includes(c.stage)) {
      c.stage = 'REACHING';
      await this.cases.save(c);
    }

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'reach.attempt_started',
      actor: user.sub,
      payload: { attempt_id: attempt.id, channel: effectiveChannel, mock: isMock },
      aggregate_type: 'ReachAttempt', aggregate_id: attempt.id,
    });

    const label = emailUndelivered ? 'UNDELIVERED_NO_SMTP' : (isMock ? 'MOCK' : 'LIVE');
    return { ...attempt, mock: isMock, email_undelivered: emailUndelivered, label };
  }

  async mockReceipt(user: AuthUser, attemptId: string, resultCode = 'connected_intent') {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('触达尝试不存在');
    this.assertTenant(attempt.tenant_id, user);

    const existing = await this.receipts.findOne({ where: { attempt_id: attemptId } });
    if (existing) {
      return { receipt: { ...existing, mock: true, label: 'MOCK' }, attempt, idempotent: true };
    }

    const receipt = await this.receipts.save(this.receipts.create({
      tenant_id: user.tenant_id,
      attempt_id: attemptId,
      raw_status: `MOCK:${resultCode}`,
      result_code: resultCode,
      talk_seconds: resultCode.startsWith('connected') ? 90 : 0,
      is_mock: true,
      received_at: new Date(),
    }));

    attempt.status = 'succeeded';
    attempt.ended_at = new Date();
    await this.attempts.save(attempt);

    const c = await this.cases.findOne({ where: { id: attempt.case_id } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertCaseAccess(user, c, 'write');

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'reach.receipt_mapped',
      actor: 'system',
      payload: { attempt_id: attemptId, result_code: resultCode, receipt_id: receipt.id, mock: true },
    });
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'reach.attempt_finished',
      actor: 'system', payload: { attempt_id: attemptId, status: 'succeeded', mock: true },
    });

    let appointment: Appointment | null = null;

    if (resultCode === 'connected_intent' || resultCode === 'converted') {
      c.stage = 'IN_DIALOG';
      c.intent_level = 'strong';
      c.intent_qualified = true;
      await this.cases.save(c);

      await this.events.emit({
        tenant_id: user.tenant_id, case_id: c.id, type: 'touch.effective',
        actor: 'system', payload: { attempt_id: attemptId, talk_seconds: receipt.talk_seconds, mock: true },
      });
      await this.events.emit({
        tenant_id: user.tenant_id, case_id: c.id, type: 'intent.qualified',
        actor: 'system', payload: { level: 'strong', from: resultCode },
      });

      appointment = await this.draftAppointment(user, c.id);
    } else if (resultCode === 'refused_contact') {
      c.stage = 'BLOCKED';
      c.flags = { ...c.flags, refused: true };
      await this.cases.save(c);
    } else if (resultCode === 'connected_no_intent') {
      c.stage = 'NURTURE';
      c.intent_level = 'weak';
      await this.cases.save(c);
    } else if (resultCode === 'no_answer' || resultCode === 'busy') {
      c.stage = 'REACHING';
      await this.cases.save(c);
    }

    return {
      receipt: { ...receipt, mock: true, label: 'MOCK' },
      attempt: { ...attempt, mock: true, label: 'MOCK' },
      case: c,
      appointment,
      mock: true,
      label: 'MOCK',
    };
  }

  async draftAppointment(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');

    const existing = await this.appointments.findOne({ where: { case_id: caseId, status: 'draft' } });
    if (existing) return existing;

    const product = getProduct(c.product_code);
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const appt = await this.appointments.save(this.appointments.create({
      tenant_id: user.tenant_id,
      case_id: caseId,
      slot_start: start,
      slot_end: end,
      location_or_link: '线上会议 https://meet.demo.local/room',
      product_or_program: `${product.name_zh} 咨询（60分钟）`,
      owner_agent_id: c.owner_agent_id,
      status: 'draft',
      valid: false,
      amount_hint: product.amount_hint,
      cancel_policy: product.cancel_policy,
      commitment_boundary: product.commitment_boundary,
    }));

    c.stage = 'APPOINTMENT_PENDING';
    await this.cases.save(c);

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'appointment.drafted',
      actor: user.sub, payload: { appointment_id: appt.id },
      aggregate_type: 'Appointment', aggregate_id: appt.id,
    });

    return appt;
  }

  async confirmAppointment(user: AuthUser, appointmentId: string) {
    const appt = await this.appointments.findOne({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('预约不存在');
    this.assertTenant(appt.tenant_id, user);

    // 案件存在性、租户、归属/写权限必须在任何幂等返回、状态修改、持久化与事件之前完成
    const c = await this.cases.findOne({ where: { id: appt.case_id } });
    if (!c) throw new NotFoundException('预约关联案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');

    if (appt.status === 'confirmed' && appt.valid) {
      return { appointment: appt, idempotent: true, event: 'conversion.appointment_valid' };
    }
    if (appt.status !== 'draft' && appt.status !== 'confirmed') {
      throw new BadRequestException(`当前状态不可确认: ${appt.status}`);
    }

    const confirmedAt = new Date();
    const protectUntil = appt.slot_end
      ? new Date(appt.slot_end.getTime() + 24 * 3600 * 1000)
      : null;

    await this.appointments.manager.transaction(async (em) => {
      appt.status = 'confirmed';
      appt.valid = true;
      appt.confirmed_at = confirmedAt;
      await em.save(Appointment, appt);

      c.stage = 'APPOINTED';
      await em.save(LeadCase, c);

      const own = await em.findOne(Ownership, { where: { case_id: c.id, status: 'active' } });
      if (own && protectUntil) {
        own.protect_until = protectUntil;
        await em.save(Ownership, own);
      }
    });

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: appt.case_id, type: 'appointment.confirmed',
      actor: user.sub, payload: { appointment_id: appt.id },
      aggregate_type: 'Appointment', aggregate_id: appt.id,
    });
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: appt.case_id, type: 'conversion.appointment_valid',
      actor: user.sub,
      payload: {
        appointment_id: appt.id,
        slot_start: appt.slot_start,
        product_or_program: appt.product_or_program,
        valid: true,
      },
      aggregate_type: 'Appointment', aggregate_id: appt.id,
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'appointment.confirm',
      resource_type: 'Appointment', resource_id: appt.id,
      detail: {
        amount_hint: appt.amount_hint,
        cancel_policy: appt.cancel_policy,
        commitment_boundary: appt.commitment_boundary,
      },
    });

    return { appointment: appt, event: 'conversion.appointment_valid' };
  }

  async addActivity(user: AuthUser, caseId: string, body: {
    kind?: string; body: string; meta?: Record<string, unknown>; next_follow_at?: string | null;
  }) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');
    if (!body.body?.trim()) throw new BadRequestException('跟进内容不能为空');

    const kind = body.kind || 'note';
    const followKinds = new Set(['note', 'followup', 'follow_up', 'call', 'wecom_followup']);
    const meta = { ...(body.meta || {}) };
    const rawNext = body.next_follow_at !== undefined
      ? body.next_follow_at
      : (meta.next_follow_at as string | null | undefined);

    // P0-2: 极简跟进强制下次时间 — 跟进类活动缺 next_follow_at → 400
    if (followKinds.has(kind)) {
      if (rawNext === undefined || rawNext === null || rawNext === '') {
        throw new BadRequestException('下次跟进时间必填（next_follow_at）');
      }
    }

    let parsedNext: Date | null | undefined;
    if (rawNext === null || rawNext === '') {
      parsedNext = null;
    } else if (typeof rawNext === 'string') {
      const d = new Date(rawNext);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('next_follow_at 无效');
      parsedNext = d;
      meta.next_follow_at = d.toISOString();
    }

    const activity = await this.activities.save(this.activities.create({
      tenant_id: user.tenant_id,
      case_id: caseId,
      actor_user_id: user.sub,
      kind,
      body: body.body.trim(),
      meta,
    }));

    c.last_touch_at = new Date();
    if (parsedNext !== undefined) {
      c.next_follow_at = parsedNext;
      c.follow_up_status = parsedNext ? 'open' : null;
      await this.cases.save(c);
    } else {
      await this.cases.save(c);
    }

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: caseId, type: 'case.followup_added',
      actor: user.sub,
      payload: {
        activity_id: activity.id,
        kind: activity.kind,
        next_follow_at: c.next_follow_at ? new Date(c.next_follow_at).toISOString() : null,
        follow_up_status: c.follow_up_status,
      },
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'case.activity_add',
      resource_type: 'CaseActivity', resource_id: activity.id,
      detail: {
        case_id: caseId, kind: activity.kind,
        next_follow_at: c.next_follow_at ? new Date(c.next_follow_at).toISOString() : null,
      },
    });

    return { activity, case: { id: c.id, next_follow_at: c.next_follow_at, follow_up_status: c.follow_up_status } };
  }

  async listActivities(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'read');
    return this.activities.find({
      where: { tenant_id: user.tenant_id, case_id: caseId },
      order: { created_at: 'ASC' },
    });
  }

  async getCase(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'read');

    const identity = await this.identities.findOne({ where: { id: c.identity_id } });
    const source = c.source_id ? await this.sources.findOne({ where: { id: c.source_id } }) : null;
    const ownership = await this.ownerships.findOne({ where: { case_id: c.id, status: 'active' } });
    const plan = await this.plans.findOne({ where: { case_id: c.id, status: 'active' } });
    const attempts = await this.attempts.find({ where: { case_id: c.id }, order: { created_at: 'ASC' } });
    const attemptIds = attempts.map((a) => a.id);
    const receipts = attemptIds.length
      ? await this.receipts.createQueryBuilder('r').where('r.attempt_id IN (:...ids)', { ids: attemptIds }).getMany()
      : [];
    const appointments = await this.appointments.find({ where: { case_id: c.id }, order: { created_at: 'DESC' } });
    const domainEvents = await this.events.listByCase(user.tenant_id, c.id);
    const consents = await this.consents.find({ where: { identity_id: c.identity_id } });
    const activities = await this.activities.find({
      where: { tenant_id: user.tenant_id, case_id: c.id },
      order: { created_at: 'ASC' },
    });

    const maskedIdentity = identity
      ? {
          ...identity,
          phone: identity.phone ? identity.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
        }
      : null;

    return {
      case: c,
      identity: maskedIdentity,
      source,
      ownership,
      plan,
      attempts: attempts.map((a) => ({ ...a, mock: a.is_mock, label: a.is_mock ? 'MOCK' : 'LIVE' })),
      receipts: receipts.map((r) => ({ ...r, mock: r.is_mock, label: r.is_mock ? 'MOCK' : 'LIVE' })),
      appointments,
      consents,
      activities,
      events: domainEvents,
      product: getProduct(c.product_code),
    };
  }

  async todayWorkbench(user: AuthUser) {
    const seatId = user.agent_seat_id;
    const qb = this.cases.createQueryBuilder('c')
      .where('c.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('c.stage NOT IN (:...done)', { done: ['ORDERED', 'REJECTED', 'EXIT_REFUSED'] })
      .orderBy('c.updated_at', 'DESC')
      .take(50);
    if (seatId && !this.isAdmin(user)) {
      qb.andWhere('(c.owner_agent_id = :seat OR c.owner_agent_id IS NULL)', { seat: seatId });
    }
    const cases = await qb.getMany();

    const pendingConfirm = await this.appointments.find({
      where: {
        tenant_id: user.tenant_id,
        status: 'draft',
        ...(!this.isAdmin(user) && seatId ? { owner_agent_id: seatId } : {}),
      },
      order: { created_at: 'DESC' },
      take: 20,
    });

    const dueFollowUps = await this.listDueFollowUps(user);

    return {
      stats: {
        my_open: cases.filter((c) => c.owner_agent_id === seatId).length,
        pending_confirm: pendingConfirm.length,
        reaching: cases.filter((c) => c.stage === 'REACHING' || c.stage === 'IN_DIALOG').length,
        appointed: cases.filter((c) => c.stage === 'APPOINTED' || c.stage === 'APPOINTMENT_PENDING').length,
        due_follow_ups: dueFollowUps.length,
      },
      cases,
      pending_appointments: pendingConfirm,
      due_follow_ups: dueFollowUps,
    };
  }

  /** 到期跟进待办：next_follow_at <= now、status=open；销售仅本人名下，经理/管理员看全租户 */
  async listDueFollowUps(user: AuthUser) {
    const now = new Date();
    const qb = this.cases.createQueryBuilder('c')
      .where('c.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('c.next_follow_at IS NOT NULL')
      .andWhere('c.next_follow_at <= :now', { now })
      .andWhere('c.follow_up_status = :st', { st: 'open' })
      .orderBy('c.next_follow_at', 'ASC')
      .take(50);
    if (!this.isAdmin(user)) {
      const seat = user.agent_seat_id;
      if (!seat) return [];
      qb.andWhere('c.owner_agent_id = :seat', { seat });
    }
    const rows = await qb.getMany();
    return rows.map((c) => ({
      case_id: c.id,
      owner_agent_id: c.owner_agent_id,
      stage: c.stage,
      product_code: c.product_code,
      next_follow_at: c.next_follow_at,
      follow_up_status: c.follow_up_status,
      updated_at: c.updated_at,
    }));
  }

  /** 标记到期跟进已处理：不再出现在待办列表 */
  async handleFollowUp(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');
    if (!c.next_follow_at || c.follow_up_status !== 'open') {
      return {
        case: c,
        idempotent: true,
        message: '无需处理或已处理',
      };
    }
    c.follow_up_status = 'handled';
    await this.cases.save(c);
    await this.events.emit({
      tenant_id: user.tenant_id, case_id: caseId, type: 'case.followup_handled',
      actor: user.sub,
      payload: { next_follow_at: new Date(c.next_follow_at).toISOString(), follow_up_status: 'handled' },
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'case.followup_handle',
      resource_type: 'LeadCase', resource_id: c.id,
      detail: { next_follow_at: new Date(c.next_follow_at).toISOString() },
    });
    return { case: c, idempotent: false };
  }

  /**
   * Funnel: intake → qualified → assigned → reached/intent → appointed → ordered(stub)
   */
  async funnelStats(user: AuthUser, productCode?: string) {
    const qb = this.cases.createQueryBuilder('c')
      .where('c.tenant_id = :tid', { tid: user.tenant_id });
    if (productCode) qb.andWhere('c.product_code = :pc', { pc: productCode });
    const cases = await qb.getMany();

    const intake = cases.length;
    const qualified = cases.filter((c) => !['NEW', 'REJECTED'].includes(c.stage)).length;
    const assigned = cases.filter((c) => c.owner_agent_id != null ||
      ['ASSIGNED', 'REACHING', 'IN_DIALOG', 'APPOINTMENT_PENDING', 'APPOINTED', 'ORDERED'].includes(c.stage)).length;
    const reachedIntent = cases.filter((c) =>
      c.intent_qualified || ['IN_DIALOG', 'APPOINTMENT_PENDING', 'APPOINTED', 'ORDERED'].includes(c.stage)).length;
    const appointed = cases.filter((c) => ['APPOINTED', 'ORDERED', 'WON'].includes(c.stage)).length;

    const orderQb = this.orders.createQueryBuilder('o')
      .where('o.tenant_id = :tid', { tid: user.tenant_id });
    if (productCode) {
      orderQb.innerJoin(LeadCase, 'lc', 'lc.id = o.case_id').andWhere('lc.product_code = :pc', { pc: productCode });
    }
    const ordered = await orderQb.getCount();
    const won = cases.filter((c) => c.stage === 'WON').length;
    const lost = cases.filter((c) => ['LOST', 'INVALID'].includes(c.stage)).length;

    const byProduct: Record<string, number> = {};
    for (const c of cases) {
      const k = c.product_code || 'unknown';
      byProduct[k] = (byProduct[k] || 0) + 1;
    }

    return {
      funnel: {
        intake,
        qualified,
        assigned,
        reached_intent: reachedIntent,
        appointed,
        ordered,
        won,
        lost,
      },
      by_product: byProduct,
      stages: cases.reduce((acc, c) => {
        acc[c.stage] = (acc[c.stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Mark case outcome: won | lost | invalid | nurture | blocked
   */
  async markResult(user: AuthUser, caseId: string, result: string, note?: string) {
    const allowed = ['won', 'lost', 'invalid', 'nurture', 'blocked'];
    const r = (result || '').toLowerCase();
    if (!allowed.includes(r)) throw new BadRequestException(`结果须为 ${allowed.join('/')}`);
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    this.assertCaseAccess(user, c, 'write');

    const stageMap: Record<string, string> = {
      won: 'WON',
      lost: 'LOST',
      invalid: 'INVALID',
      nurture: 'NURTURE',
      blocked: 'BLOCKED',
    };
    c.stage = stageMap[r];
    const src = c.source_id ? await this.sources.findOne({ where: { id: c.source_id } }) : null;
    const isSynthetic =
      src?.type === 'synthetic_fixture' ||
      (src?.raw_payload && (src.raw_payload as Record<string, unknown>).label === 'SYNTHETIC_FIXTURE');
    c.flags = {
      ...c.flags,
      result: r,
      result_at: new Date().toISOString(),
      result_by: user.sub,
      // Demo / synthetic WON is never customer 成交
      demo_not_customer_deal: true,
      source_type: src?.type || null,
      synthetic_fixture: !!isSynthetic,
    };
    await this.cases.save(c);

    if (note?.trim()) {
      await this.activities.save(this.activities.create({
        tenant_id: user.tenant_id,
        case_id: caseId,
        actor_user_id: user.sub,
        kind: 'result',
        body: note.trim(),
        meta: { result: r },
      }));
    }

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: c.id, type: 'case.result_marked',
      actor: user.sub, payload: { result: r },
    });
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'case.mark_result',
      resource_type: 'LeadCase', resource_id: c.id, detail: { result: r },
    });
    return { case: c };
  }


  /**
   * Authorized public-list / public-web enterprise lead import.
   * Hard-separates provenance records from synthetic_fixture sales fixtures.
   * Verification statuses:
   *   source_provided | fetch_verified | fetch_failed | pending_verification
   * Only fetch_verified sets real_public_source=true and counts toward acceptance gate.
   * Failed fetch MUST NOT store error-page HTML as facts.
   * Re-import is transactionally idempotent per normalized URL + product scope:
   *   reuse LeadCase; append LeadSource history (no duplicate cases).
   * Unknown contact / demand / consent → store UNKNOWN; never invent person or consent=true.
   * No outbound email/phone/DM/purchase. Public-only SSRF-safe fetch.
   */
  async importAuthorizedPublicList(
    user: AuthUser,
    body: {
      items?: Array<{
        company_name: string;
        official_site_url: string;
        product_code?: string;
        match_reason_vs_icp: string;
        public_facts_excerpt?: string;
        contact_person?: string;
        demand?: string;
        consent_status?: string;
      }>;
      fetch_official?: boolean;
      batch_label?: string;
    },
  ) {
    if (!this.isAdmin(user)) throw new ForbiddenException('需要经理/管理员权限导入公开来源名单');
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) throw new BadRequestException('items 不能为空');
    if (items.length > 20) throw new BadRequestException('单次最多 20 条');

    const batchId = `authpub-${Date.now().toString(36)}`;
    const fetchOfficial = body.fetch_official !== false;
    const results: Array<Record<string, unknown>> = [];

    for (const rawItem of items) {
      const company = String(rawItem.company_name || '').trim();
      const officialUrl = String(rawItem.official_site_url || '').trim();
      const matchReason = String(rawItem.match_reason_vs_icp || '').trim();
      if (!company || !officialUrl || !matchReason) {
        throw new BadRequestException('每条须含 company_name / official_site_url / match_reason_vs_icp');
      }
      let parsed: URL;
      try {
        parsed = new URL(officialUrl);
      } catch {
        throw new BadRequestException(`非法 URL: ${officialUrl.slice(0, 80)}`);
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('仅允许 http/https 公开来源 URL');
      }

      const product = getProduct(rawItem.product_code || 'sales-agent');
      const contactPerson = (rawItem.contact_person || 'UNKNOWN').trim() || 'UNKNOWN';
      const demand = (rawItem.demand || 'UNKNOWN').trim() || 'UNKNOWN';
      const consentStatus = (rawItem.consent_status || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
      if (consentStatus === 'GRANTED' || consentStatus === 'TRUE') {
        throw new BadRequestException('公开来源导入不得伪造成 consent granted；未知请用 UNKNOWN');
      }

      const fetchTime = new Date().toISOString();
      const providedExcerpt = (rawItem.public_facts_excerpt || '').trim();
      let verificationStatus: PublicFetchStatus = fetchOfficial ? 'pending_verification' : 'source_provided';
      let excerpt = 'UNKNOWN';
      let fetchMeta: Record<string, unknown> = {
        skipped_live_fetch: !fetchOfficial,
        verification_status: verificationStatus,
        status: null,
        final_url: officialUrl,
        title: null,
        error: null,
        blocked_reason: null,
      };

      if (fetchOfficial) {
        const fetched = await fetchPublicSource(officialUrl);
        verificationStatus = fetched.verification_status;
        fetchMeta = {
          skipped_live_fetch: false,
          verification_status: fetched.verification_status,
          status: fetched.http_status,
          final_url: fetched.final_url,
          title: fetched.title,
          description: fetched.description,
          bytes: fetched.bytes,
          error: fetched.error,
          blocked_reason: fetched.blocked_reason,
          redirect_hops: fetched.redirect_hops,
        };
        if (fetched.verification_status === 'fetch_verified' && fetched.facts_excerpt) {
          excerpt = fetched.facts_excerpt;
        } else {
          // Failed / empty / error-page → NEVER store HTML as facts
          excerpt = 'UNKNOWN';
        }
      } else {
        // Skip-fetch: URL submitted only — not fetch_verified (honest pending/source_provided)
        verificationStatus = 'source_provided';
        excerpt = 'UNKNOWN';
        fetchMeta.verification_status = verificationStatus;
        if (providedExcerpt && providedExcerpt !== 'UNKNOWN') {
          // Caller-supplied excerpt without live fetch stays source_provided, not verified
          excerpt = providedExcerpt.slice(0, 400);
        }
      }

      const normUrl = normalizeCompanyUrl(officialUrl);
      const mergeKey = publicCompanyMergeKey(officialUrl, product.code);
      const realVerified = verificationStatus === 'fetch_verified';

      const itemResult = await this.dataSource.transaction(async (manager) => {
        const idRepo = manager.getRepository(LeadIdentity);
        const srcRepo = manager.getRepository(LeadSource);
        const caseRepo = manager.getRepository(LeadCase);
        const consentRepo = manager.getRepository(ConsentGrant);

        // Lock identity row for this normalized public company+product scope
        let identity = await idRepo
          .createQueryBuilder('i')
          .setLock('pessimistic_write')
          .where('i.tenant_id = :tid AND i.merge_key = :mk', { tid: user.tenant_id, mk: mergeKey })
          .getOne();

        let identityMerged = false;
        if (!identity) {
          identity = await idRepo.save(idRepo.create({
            tenant_id: user.tenant_id,
            phone: null,
            email: null,
            name: contactPerson === 'UNKNOWN' ? null : contactPerson,
            company_name: company,
            merge_key: mergeKey,
          }));
        } else {
          identityMerged = true;
          if (!identity.company_name) identity.company_name = company;
          await idRepo.save(identity);
        }

        // Idempotent LeadCase: same tenant+identity+product+ENTERPRISE_PUBLIC → reuse
        let leadCase = await caseRepo
          .createQueryBuilder('c')
          .setLock('pessimistic_write')
          .where('c.tenant_id = :tid', { tid: user.tenant_id })
          .andWhere('c.identity_id = :iid', { iid: identity.id })
          .andWhere('c.product_code = :pc', { pc: product.code })
          .andWhere('c.path = :path', { path: 'ENTERPRISE_PUBLIC' })
          .orderBy('c.created_at', 'ASC')
          .getOne();

        let caseMerged = false;
        const provenance = {
          source_type: 'authorized_public_list_import',
          official_site_url: officialUrl,
          normalized_url: normUrl,
          fetch_time: fetchTime,
          fetch_meta: fetchMeta,
          verification_status: verificationStatus,
          public_facts_excerpt: excerpt,
          match_reason_vs_icp: matchReason,
          contact_person: contactPerson,
          demand,
          consent_status: consentStatus,
          label: realVerified ? 'REAL_PUBLIC_SOURCE_FETCH_VERIFIED' : 'PUBLIC_SOURCE_NOT_YET_VERIFIED',
          batch_label: body.batch_label || null,
        };

        const source = await srcRepo.save(srcRepo.create({
          tenant_id: user.tenant_id,
          type: 'authorized_public_list_import',
          campaign: body.batch_label || 'authorized_public_list',
          landing_url: officialUrl,
          form_id: `authorized_public:${product.code}`,
          import_batch_id: batchId,
          utm_source: 'authorized_public_list',
          utm_medium: 'import_api',
          utm_campaign: body.batch_label || 'enterprise_lead_import',
          product_code: product.code,
          raw_payload: provenance,
        }));

        if (!leadCase) {
          leadCase = await caseRepo.save(caseRepo.create({
            tenant_id: user.tenant_id,
            identity_id: identity.id,
            source_id: source.id,
            path: 'ENTERPRISE_PUBLIC',
            stage: 'NEW',
            scene_id: `authorized_public:${product.code}`,
            product_code: product.code,
            sea_status: 'public',
            last_touch_at: new Date(),
            flags: {
              source_type: 'authorized_public_list_import',
              contact_person: contactPerson,
              demand,
              consent_status: consentStatus,
              demo_not_customer_deal: true,
              // Current vs historical: real_public_source follows LATEST fetch only
              real_public_source: realVerified,
              verification_status: verificationStatus,
              historically_verified: realVerified,
              ever_fetch_verified: realVerified,
              current_facts_trustworthy: realVerified,
              verification_explanation: buildVerificationExplanation({
                current: verificationStatus,
                historicallyVerified: realVerified,
              }),
              normalized_url: normUrl,
              public_facts_excerpt: excerpt,
              last_verified_facts_excerpt: realVerified ? excerpt : null,
              last_verified_at: realVerified ? fetchTime : null,
              source_history: [{ source_id: source.id, batch_id: batchId, fetch_time: fetchTime, verification_status: verificationStatus }],
            },
          }));
        } else {
          caseMerged = true;
          const prevFlags = (leadCase.flags || {}) as Record<string, unknown>;
          const history = Array.isArray(prevFlags.source_history)
            ? [...(prevFlags.source_history as SourceHistoryEntry[])]
            : [];
          history.push({
            source_id: source.id,
            batch_id: batchId,
            fetch_time: fetchTime,
            verification_status: verificationStatus,
          });
          const historicallyVerified = realVerified
            || prevFlags.historically_verified === true
            || prevFlags.ever_fetch_verified === true
            || prevFlags.verification_status === 'fetch_verified'
            || history.some((h) => h.verification_status === 'fetch_verified');
          const lastVerifiedFacts = realVerified
            ? excerpt
            : (typeof prevFlags.last_verified_facts_excerpt === 'string'
              ? prevFlags.last_verified_facts_excerpt
              : null);
          const lastVerifiedAt = realVerified
            ? fetchTime
            : (typeof prevFlags.last_verified_at === 'string' ? prevFlags.last_verified_at : null);
          leadCase.source_id = source.id; // latest provenance pointer; history retained
          leadCase.flags = {
            ...prevFlags,
            source_type: 'authorized_public_list_import',
            contact_person: contactPerson,
            demand,
            consent_status: consentStatus,
            demo_not_customer_deal: true,
            // CURRENT status (not sticky). Historical kept separately for audit/UI.
            real_public_source: realVerified,
            verification_status: verificationStatus,
            historically_verified: historicallyVerified,
            ever_fetch_verified: historicallyVerified,
            current_facts_trustworthy: realVerified,
            verification_explanation: buildVerificationExplanation({
              current: verificationStatus,
              historicallyVerified,
            }),
            normalized_url: normUrl,
            // Failed latest fetch → do not treat page body as current facts
            public_facts_excerpt: realVerified ? excerpt : 'UNKNOWN',
            last_verified_facts_excerpt: lastVerifiedFacts,
            last_verified_at: lastVerifiedAt,
            source_history_retention: 'cap20_keeps_latest_lastVerified_transitions',
            source_history: retainSourceHistory(history, 20),
          };
          await caseRepo.save(leadCase);
        }

        // Consent UNKNOWN → store explicit unknown rows only on first create
        if (!caseMerged && consentStatus === 'UNKNOWN') {
          for (const ch of ['call', 'sms', 'email']) {
            await consentRepo.save(consentRepo.create({
              tenant_id: user.tenant_id,
              identity_id: identity.id,
              case_id: leadCase.id,
              channel: ch,
              status: 'unknown',
              evidence_ref: 'consent:UNKNOWN:public_source',
              consent_text: null,
              consent_text_hash: null,
              consent_version: null,
              source_channel: 'authorized_public_list_import',
              consent_accepted_at: null,
              granted_at: null,
            }));
          }
        }

        return {
          leadCase,
          identity,
          source,
          mergeKey,
          identityMerged,
          caseMerged,
          merged: caseMerged || identityMerged,
        };
      });

      await this.events.emit({
        tenant_id: user.tenant_id, case_id: itemResult.leadCase.id, type: 'lead.captured',
        actor: user.sub,
        payload: {
          identity_id: itemResult.identity.id,
          source_id: itemResult.source.id,
          merge_key: itemResult.mergeKey,
          merged: itemResult.merged,
          case_merged: itemResult.caseMerged,
          product_code: product.code,
          source_type: 'authorized_public_list_import',
          verification_status: verificationStatus,
        },
        aggregate_id: itemResult.leadCase.id,
      });
      await this.events.audit({
        tenant_id: user.tenant_id, actor_user_id: user.sub,
        action: 'lead.import_authorized_public',
        resource_type: 'LeadCase', resource_id: itemResult.leadCase.id,
        detail: {
          company_name: company,
          official_site_url: officialUrl,
          normalized_url: normUrl,
          product_code: product.code,
          consent_status: consentStatus,
          contact_person: contactPerson,
          demand,
          merged: itemResult.merged,
          case_merged: itemResult.caseMerged,
          verification_status: verificationStatus,
          batch_id: batchId,
        },
      });

      results.push({
        case_id: itemResult.leadCase.id,
        merged: itemResult.merged,
        case_merged: itemResult.caseMerged,
        company_name: company,
        official_site_url: officialUrl,
        normalized_url: normUrl,
        product_code: product.code,
        source_type: 'authorized_public_list_import',
        contact_person: contactPerson,
        demand,
        consent_status: consentStatus,
        fetch_time: fetchTime,
        public_facts_excerpt: excerpt.slice(0, 200),
        match_reason_vs_icp: matchReason,
        verification_status: verificationStatus,
        real_public_source: realVerified,
        historically_verified: !!(itemResult.leadCase.flags as Record<string, unknown>)?.historically_verified,
        verification_explanation: (itemResult.leadCase.flags as Record<string, unknown>)?.verification_explanation || null,
        source_id: itemResult.source.id,
      });
    }

    const verifiedCount = results.filter((r) => r.verification_status === 'fetch_verified').length;
    const failedCount = results.filter((r) => r.verification_status === 'fetch_failed').length;
    const providedCount = results.filter((r) => r.verification_status === 'source_provided').length;

    return {
      batch_id: batchId,
      imported: results.length,
      items: results,
      verification_summary: {
        fetch_verified: verifiedCount,
        fetch_failed: failedCount,
        source_provided: providedCount,
        pending_verification: results.filter((r) => r.verification_status === 'pending_verification').length,
        acceptance_gate: 'Only fetch_verified counts toward real-source acceptance; require >=3',
      },
      honesty: {
        real_vs_synthetic: 'These records are authorized_public_list_import. Synthetic fixtures use source_type=synthetic_fixture separately.',
        unknowns: 'contact_person / demand / consent default UNKNOWN when not known; never invented.',
        no_outbound: true,
        fetch_verification: 'fetch_verified requires public fetch with extractable facts; error pages/429/empty → fetch_failed and facts=UNKNOWN',
        idempotent_dedupe: 'Same normalized URL + product reuses one LeadCase; source history appended',
        ssrf: 'Public-only fetch; private/loopback/metadata/DNS/redirect targets rejected; dial IP pinned after validate',
        verification_current_vs_historical: 'verification_status/real_public_source = latest fetch; historically_verified = ever verified; failed latest ⇒ facts UNKNOWN',
      },
    };
  }


  async exportLeadsCsv(user: AuthUser): Promise<string> {
    if (!this.isAdmin(user)) throw new ForbiddenException('需要管理员权限');
    const cases = await this.cases.find({
      where: { tenant_id: user.tenant_id },
      order: { created_at: 'DESC' },
      take: 5000,
    });
    const rows = [
      ['case_id', 'product', 'stage', 'path', 'name', 'phone_masked', 'email', 'utm_source', 'utm_medium', 'utm_campaign', 'invite_code', 'created_at'].join(','),
    ];
    for (const c of cases) {
      const id = await this.identities.findOne({ where: { id: c.identity_id } });
      const src = c.source_id ? await this.sources.findOne({ where: { id: c.source_id } }) : null;
      const phone = id?.phone ? id.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '';
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      rows.push([
        c.id, c.product_code, c.stage, c.path, id?.name, phone, id?.email,
        src?.utm_source, src?.utm_medium, src?.utm_campaign, src?.invite_code,
        c.created_at?.toISOString?.() || c.created_at,
      ].map(esc).join(','));
    }
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'leads.export_csv',
      resource_type: 'LeadCase', detail: { count: cases.length },
    });
    return rows.join('\n');
  }

  /** CSV 模板（中文表头） */
  csvImportTemplate(): string {
    const header = [
      'company_name', 'contact_name', 'phone', 'email', 'source', 'product_code', 'demand', 'note',
    ].join(',');
    const sample = [
      '示例科技有限公司', '张三', '13800138000', 'zhang@example.com', '展会名录', 'sales-agent', 'UNKNOWN', '备注可选',
    ].map((v) => `"${v}"`).join(',');
    return '\uFEFF' + header + '\n' + sample + '\n';
  }

  /**
   * 批量 CSV 导入：source 必填；坏行不影响好行；返回成功/失败/合并与失败行导出。
   */
  async importCsv(user: AuthUser, body: { csv?: string; rows?: Record<string, string>[] }) {
    if (!this.isAdmin(user)) throw new ForbiddenException('需要经理/管理员权限导入');
    let rows: Record<string, string>[] = [];
    if (Array.isArray(body.rows) && body.rows.length) {
      rows = body.rows;
    } else if (typeof body.csv === 'string' && body.csv.trim()) {
      rows = this.parseCsv(body.csv);
    } else {
      throw new BadRequestException('请提供 csv 文本或 rows 数组');
    }

    const succeeded: Record<string, unknown>[] = [];
    const failed: Record<string, unknown>[] = [];
    let mergedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2; // header = 1
      try {
        const source = (row.source || row['来源'] || '').trim();
        if (!source) {
          failed.push({ line, row, error: '来源（source）必填', error_zh: '来源必填，未填写无法入库' });
          continue;
        }
        const phone = (row.phone || row['手机'] || '').trim() || undefined;
        const email = (row.email || row['邮箱'] || '').trim() || undefined;
        const company = (row.company_name || row['公司名'] || '').trim();
        const name = (row.contact_name || row.name || row['联系人'] || '').trim() || 'UNKNOWN';
        if (!phone && !email && !company) {
          failed.push({ line, row, error: 'phone/email/company_name 至少填一项', error_zh: '手机、邮箱、公司名至少填一项' });
          continue;
        }
        const intake = await this.intake(user, {
          phone,
          email,
          name,
          company_name: company || undefined,
          source_type: 'csv_batch_import',
          source_channel: source,
          campaign: source,
          product_code: (row.product_code || row['产品'] || 'sales-agent').trim(),
          consent_accepted: true,
          path: 'STANDARD',
          raw: {
            demand: (row.demand || row['需求'] || 'UNKNOWN').trim() || 'UNKNOWN',
            note: (row.note || row['备注'] || '').trim() || null,
            import_line: line,
            label: 'csv_batch_import',
          },
        });
        const merged = !!(intake as { merged?: boolean }).merged;
        if (merged) mergedCount += 1;
        succeeded.push({
          line,
          case_id: (intake as { case?: { id: string } }).case?.id,
          merged,
          merge_message_zh: merged
            ? '已与已有客户合并（相同手机/邮箱），未新建重复案件'
            : '新建案件成功',
          company_name: company || null,
          source,
        });
      } catch (e) {
        failed.push({
          line,
          row,
          error: String((e as Error)?.message || e).slice(0, 200),
          error_zh: String((e as Error)?.message || e).slice(0, 200),
        });
      }
    }

    const failedCsv = this.rowsToCsv(
      ['line', 'company_name', 'contact_name', 'phone', 'email', 'source', 'product_code', 'error_zh'],
      failed.map((f) => ({
        line: f.line,
        company_name: (f.row as Record<string, string>)?.company_name || (f.row as Record<string, string>)?.['公司名'] || '',
        contact_name: (f.row as Record<string, string>)?.contact_name || (f.row as Record<string, string>)?.name || '',
        phone: (f.row as Record<string, string>)?.phone || '',
        email: (f.row as Record<string, string>)?.email || '',
        source: (f.row as Record<string, string>)?.source || '',
        product_code: (f.row as Record<string, string>)?.product_code || '',
        error_zh: f.error_zh || f.error,
      })),
    );

    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'leads.import_csv',
      resource_type: 'LeadCase',
      detail: { success: succeeded.length, failed: failed.length, merged: mergedCount },
    });

    return {
      success_count: succeeded.length,
      failed_count: failed.length,
      merged_count: mergedCount,
      items: succeeded,
      failed_rows: failed,
      failed_csv: failedCsv,
      summary_zh: `成功 ${succeeded.length} 行，失败 ${failed.length} 行，合并 ${mergedCount} 行。坏行未阻断好行。`,
    };
  }

  private parseCsv(text: string): Record<string, string>[] {
    const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw.split('\n').filter((l) => l.trim().length);
    if (lines.length < 2) return [];
    const headers = this.splitCsvLine(lines[0]).map((h) => h.trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this.splitCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] ?? '').trim(); });
      rows.push(row);
    }
    return rows;
  }

  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  private rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => esc(r[h])).join(','));
    }
    return '\uFEFF' + lines.join('\n') + '\n';
  }


}
