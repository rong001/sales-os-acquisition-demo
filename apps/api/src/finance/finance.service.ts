import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Contract, PaymentPlan, PaymentReceipt, LeadCase,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Contract) private readonly contracts: Repository<Contract>,
    @InjectRepository(PaymentPlan) private readonly plans: Repository<PaymentPlan>,
    @InjectRepository(PaymentReceipt) private readonly receipts: Repository<PaymentReceipt>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    private readonly events: EventsService,
  ) {}

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
  }

  private async assertCase(user: AuthUser, caseId: string) {
    const c = await this.cases.findOne({ where: { id: caseId, tenant_id: user.tenant_id } });
    if (!c) throw new NotFoundException('案件不存在');
    if (!this.isAdmin(user) && user.role !== 'viewer') {
      if (user.agent_seat_id && c.owner_agent_id && c.owner_agent_id !== user.agent_seat_id) {
        throw new ForbiddenException('无权访问其他销售的合同');
      }
    }
    return c;
  }

  async listContracts(user: AuthUser, caseId: string) {
    await this.assertCase(user, caseId);
    return this.contracts.find({
      where: { tenant_id: user.tenant_id, case_id: caseId },
      order: { created_at: 'DESC' },
    });
  }

  async createContract(user: AuthUser, body: {
    case_id: string; amount: string; currency?: string; status?: string;
    signed_at?: string; attachment_url?: string; note?: string;
  }) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    const c = await this.assertCase(user, body.case_id);
    if (!body.amount?.trim()) throw new BadRequestException('合同金额必填');
    const status = body.status || 'draft';
    if (!['draft', 'signed', 'void'].includes(status)) throw new BadRequestException('status 无效');
    const row = await this.contracts.save(this.contracts.create({
      tenant_id: user.tenant_id,
      case_id: c.id,
      amount: body.amount.trim(),
      currency: body.currency || 'CNY',
      status,
      signed_at: body.signed_at ? new Date(body.signed_at) : (status === 'signed' ? new Date() : null),
      attachment_url: body.attachment_url || null,
      note: body.note || null,
    }));
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'contract.create',
      resource_type: 'Contract', resource_id: row.id, detail: { case_id: c.id, amount: row.amount, status },
    });
    if (c.stage === 'WON') {
      /* ok without contract historically; hint only via response */
    }
    return { contract: row, hint: c.stage === 'WON' && status === 'draft' ? '赢单案件建议补签正式合同' : null };
  }

  async updateContract(user: AuthUser, id: string, body: Partial<{
    amount: string; currency: string; status: string; signed_at: string; attachment_url: string; note: string;
  }>) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    const row = await this.contracts.findOne({ where: { id, tenant_id: user.tenant_id } });
    if (!row) throw new NotFoundException('合同不存在');
    await this.assertCase(user, row.case_id);
    if (body.amount != null) row.amount = String(body.amount);
    if (body.currency != null) row.currency = body.currency;
    if (body.status != null) {
      if (!['draft', 'signed', 'void'].includes(body.status)) throw new BadRequestException('status 无效');
      row.status = body.status;
      if (body.status === 'signed' && !row.signed_at) row.signed_at = new Date();
    }
    if (body.signed_at !== undefined) row.signed_at = body.signed_at ? new Date(body.signed_at) : null;
    if (body.attachment_url !== undefined) row.attachment_url = body.attachment_url || null;
    if (body.note !== undefined) row.note = body.note || null;
    await this.contracts.save(row);
    return row;
  }

  async listPlans(user: AuthUser, caseId?: string, contractId?: string) {
    const qb = this.plans.createQueryBuilder('p')
      .where('p.tenant_id = :tid', { tid: user.tenant_id });
    if (caseId) qb.andWhere('p.case_id = :cid', { cid: caseId });
    if (contractId) qb.andWhere('p.contract_id = :coid', { coid: contractId });
    return qb.orderBy('p.due_at', 'ASC').getMany();
  }

  async createPlan(user: AuthUser, body: {
    contract_id: string; due_at: string; amount: string; note?: string;
  }) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    const contract = await this.contracts.findOne({ where: { id: body.contract_id, tenant_id: user.tenant_id } });
    if (!contract) throw new NotFoundException('合同不存在');
    await this.assertCase(user, contract.case_id);
    if (!body.due_at || !body.amount) throw new BadRequestException('due_at 与 amount 必填');
    const due = new Date(body.due_at);
    if (Number.isNaN(due.getTime())) throw new BadRequestException('due_at 无效');
    const row = await this.plans.save(this.plans.create({
      tenant_id: user.tenant_id,
      contract_id: contract.id,
      case_id: contract.case_id,
      due_at: due,
      amount: String(body.amount).trim(),
      status: 'pending',
      note: body.note || null,
    }));
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'payment_plan.create',
      resource_type: 'PaymentPlan', resource_id: row.id, detail: { amount: row.amount, due_at: due.toISOString() },
    });
    return row;
  }

  async createReceipt(user: AuthUser, body: {
    contract_id: string; amount: string; paid_at?: string; method?: string; plan_id?: string; note?: string;
  }) {
    if (user.role === 'viewer') throw new ForbiddenException('只读访客禁止写操作');
    const contract = await this.contracts.findOne({ where: { id: body.contract_id, tenant_id: user.tenant_id } });
    if (!contract) throw new NotFoundException('合同不存在');
    await this.assertCase(user, contract.case_id);
    if (!body.amount?.trim()) throw new BadRequestException('实收金额必填');
    const paidAt = body.paid_at ? new Date(body.paid_at) : new Date();
    if (Number.isNaN(paidAt.getTime())) throw new BadRequestException('paid_at 无效');
    const row = await this.receipts.save(this.receipts.create({
      tenant_id: user.tenant_id,
      contract_id: contract.id,
      case_id: contract.case_id,
      plan_id: body.plan_id || null,
      paid_at: paidAt,
      amount: body.amount.trim(),
      method: body.method || 'transfer',
      note: body.note || null,
    }));
    if (body.plan_id) {
      const plan = await this.plans.findOne({ where: { id: body.plan_id, tenant_id: user.tenant_id } });
      if (plan) {
        plan.status = 'paid';
        await this.plans.save(plan);
      }
    }
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'payment_receipt.create',
      resource_type: 'PaymentReceipt', resource_id: row.id, detail: { amount: row.amount },
    });
    return row;
  }

  async listReceipts(user: AuthUser, caseId?: string, contractId?: string) {
    const qb = this.receipts.createQueryBuilder('r')
      .where('r.tenant_id = :tid', { tid: user.tenant_id });
    if (caseId) qb.andWhere('r.case_id = :cid', { cid: caseId });
    if (contractId) qb.andWhere('r.contract_id = :coid', { coid: contractId });
    return qb.orderBy('r.paid_at', 'DESC').getMany();
  }

  /** Payment risk for boss screen 3: signed contracts with overdue unpaid plans or no receipts. */
  async paymentRisk(user: AuthUser) {
    if (!this.isAdmin(user) && user.role !== 'viewer') {
      throw new ForbiddenException('仅老板/经理可查看回款风险');
    }
    const now = new Date();
    const overduePlans = await this.plans.createQueryBuilder('p')
      .where('p.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('p.status = :st', { st: 'pending' })
      .andWhere('p.due_at < :now', { now })
      .orderBy('p.due_at', 'ASC')
      .getMany();

    const signed = await this.contracts.find({
      where: { tenant_id: user.tenant_id, status: 'signed' },
    });
    const unpaidContracts = [];
    for (const c of signed) {
      const rec = await this.receipts.count({ where: { contract_id: c.id } });
      const pending = await this.plans.count({ where: { contract_id: c.id, status: 'pending' } });
      if (rec === 0 || pending > 0) {
        unpaidContracts.push({
          contract_id: c.id,
          case_id: c.case_id,
          amount: c.amount,
          currency: c.currency,
          receipts: rec,
          pending_plans: pending,
        });
      }
    }

    return {
      overdue_plans: overduePlans.map((p) => ({
        plan_id: p.id,
        case_id: p.case_id,
        contract_id: p.contract_id,
        amount: p.amount,
        due_at: p.due_at,
        days_overdue: Math.floor((now.getTime() - new Date(p.due_at).getTime()) / 86400000),
      })),
      unpaid_or_open_contracts: unpaidContracts,
      empty: overduePlans.length === 0 && unpaidContracts.length === 0,
      empty_hint: '暂无回款风险数据。创建合同并录入回款计划/实收后，逾期项会出现在此。',
    };
  }
}
