import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadCase, LeadIdentity } from '../entities';
import { FinanceService } from '../finance/finance.service';
import { AuthUser } from '../common/types';

@Injectable()
export class BossService {
  constructor(
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    @InjectRepository(LeadIdentity) private readonly identities: Repository<LeadIdentity>,
    private readonly finance: FinanceService,
  ) {}

  private isBoss(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor' || user.role === 'viewer';
  }

  async screens(user: AuthUser) {
    if (!this.isBoss(user)) {
      throw new ForbiddenException('老板三屏仅对经理/管理员/只读访客开放（销售请用作战台）');
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const dueQb = this.cases.createQueryBuilder('c')
      .where('c.tenant_id = :tid', { tid: user.tenant_id })
      .andWhere('c.next_follow_at IS NOT NULL')
      .andWhere('c.follow_up_status = :st', { st: 'open' })
      .andWhere('c.next_follow_at <= :now', { now })
      .orderBy('c.next_follow_at', 'ASC')
      .take(100);
    const dueCases = await dueQb.getMany();
    const overdue = dueCases.filter((c) => new Date(c.next_follow_at!).getTime() < startOfDay.getTime());
    const dueToday = dueCases.filter((c) => new Date(c.next_follow_at!).getTime() >= startOfDay.getTime());

    const dueList = [];
    for (const c of dueCases.slice(0, 30)) {
      const idn = await this.identities.findOne({ where: { id: c.identity_id } });
      dueList.push({
        case_id: c.id,
        stage: c.stage,
        product_code: c.product_code,
        next_follow_at: c.next_follow_at,
        owner_agent_id: c.owner_agent_id,
        company_name: idn?.company_name || null,
        name: idn?.name || null,
        overdue: new Date(c.next_follow_at!).getTime() < startOfDay.getTime(),
      });
    }

    const funnelRaw = await this.cases.createQueryBuilder('c')
      .select('c.stage', 'stage')
      .addSelect('COUNT(*)', 'count')
      .where('c.tenant_id = :tid', { tid: user.tenant_id })
      .groupBy('c.stage')
      .getRawMany();
    const funnel: Record<string, number> = {};
    for (const r of funnelRaw) funnel[r.stage] = Number(r.count);

    const payment = await this.finance.paymentRisk(user);

    return {
      screen1_team_todos: {
        due_today_count: dueToday.length,
        overdue_count: overdue.length,
        total_open_due: dueCases.length,
        items: dueList,
      },
      screen2_funnel: {
        stages: funnel,
        total: Object.values(funnel).reduce((a, b) => a + b, 0),
      },
      screen3_payment_risk: payment,
      generated_at: now.toISOString(),
    };
  }
}
