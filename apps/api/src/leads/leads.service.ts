import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  source_type?: string; campaign?: string; path?: string;
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
  ) {}

  private assertTenant(rowTenant: string, user: AuthUser) {
    if (rowTenant !== user.tenant_id) throw new ForbiddenException('跨租户访问被拒绝');
  }

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
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
    }));

    const consentText = body.consent_text || CONSENT_TEXT_V1;
    const consentVersion = body.consent_version || CONSENT_VERSION;
    const channels = body.consent_channels?.length ? body.consent_channels : ['call', 'sms'];
    const grantedAt = new Date();
    for (const ch of channels) {
      await this.consents.save(this.consents.create({
        tenant_id: user.tenant_id,
        identity_id: identity.id,
        case_id: leadCase.id,
        channel: ch,
        status: 'granted',
        evidence_ref: `consent:${consentVersion}`,
        consent_text: consentText,
        consent_version: consentVersion,
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

    return { case: c, plan };
  }

  async assign(user: AuthUser, caseId: string, agentSeatId?: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
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

    const realEnabled =
      (channel === 'sms' && process.env.REAL_SMS_ENABLED === 'true') ||
      (['human_call', 'robot_call'].includes(channel) && process.env.REAL_CALL_ENABLED === 'true');
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
      template_ref: 'demo-script',
      status: 'running',
      provider_msg_id: isMock ? `MOCK-${Date.now()}` : `provider-${Date.now()}`,
      is_mock: isMock,
      started_at: new Date(),
    }));

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

    return { ...attempt, mock: isMock, label: isMock ? 'MOCK' : 'LIVE' };
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

    if (appt.status === 'confirmed' && appt.valid) {
      return { appointment: appt, idempotent: true, event: 'conversion.appointment_valid' };
    }
    if (appt.status !== 'draft' && appt.status !== 'confirmed') {
      throw new BadRequestException(`当前状态不可确认: ${appt.status}`);
    }

    appt.status = 'confirmed';
    appt.valid = true;
    appt.confirmed_at = new Date();
    await this.appointments.save(appt);

    const c = await this.cases.findOne({ where: { id: appt.case_id } });
    if (c) {
      c.stage = 'APPOINTED';
      await this.cases.save(c);
      const own = await this.ownerships.findOne({ where: { case_id: c.id, status: 'active' } });
      if (own && appt.slot_end) {
        own.protect_until = new Date(appt.slot_end.getTime() + 24 * 3600 * 1000);
        await this.ownerships.save(own);
      }
    }

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

  async addActivity(user: AuthUser, caseId: string, body: { kind?: string; body: string; meta?: Record<string, unknown> }) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    if (!body.body?.trim()) throw new BadRequestException('跟进内容不能为空');

    const activity = await this.activities.save(this.activities.create({
      tenant_id: user.tenant_id,
      case_id: caseId,
      actor_user_id: user.sub,
      kind: body.kind || 'note',
      body: body.body.trim(),
      meta: body.meta || {},
    }));

    await this.events.emit({
      tenant_id: user.tenant_id, case_id: caseId, type: 'case.followup_added',
      actor: user.sub, payload: { activity_id: activity.id, kind: activity.kind },
    });

    return activity;
  }

  async listActivities(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);
    return this.activities.find({
      where: { tenant_id: user.tenant_id, case_id: caseId },
      order: { created_at: 'ASC' },
    });
  }

  async getCase(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId } });
    if (!c) throw new NotFoundException('案件不存在');
    this.assertTenant(c.tenant_id, user);

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

    return {
      stats: {
        my_open: cases.filter((c) => c.owner_agent_id === seatId).length,
        pending_confirm: pendingConfirm.length,
        reaching: cases.filter((c) => c.stage === 'REACHING' || c.stage === 'IN_DIALOG').length,
        appointed: cases.filter((c) => c.stage === 'APPOINTED' || c.stage === 'APPOINTMENT_PENDING').length,
      },
      cases,
      pending_appointments: pendingConfirm,
    };
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
    const appointed = cases.filter((c) => ['APPOINTED', 'ORDERED'].includes(c.stage)).length;

    const orderQb = this.orders.createQueryBuilder('o')
      .where('o.tenant_id = :tid', { tid: user.tenant_id });
    if (productCode) {
      orderQb.innerJoin(LeadCase, 'lc', 'lc.id = o.case_id').andWhere('lc.product_code = :pc', { pc: productCode });
    }
    const ordered = await orderQb.getCount();

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
      },
      by_product: byProduct,
      stages: cases.reduce((acc, c) => {
        acc[c.stage] = (acc[c.stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
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
}
