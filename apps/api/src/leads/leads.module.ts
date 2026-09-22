import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import {
  LeadIdentity, LeadSource, LeadCase, ConsentGrant, Ownership, PoolItem,
  ReachPlan, ReachAttempt, ReachReceipt, Appointment, AgentSeat, SkillGroup,
  DomainEvent, Outbox, AuditLog, CaseActivity, Tenant, User, Order,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeadIdentity, LeadSource, LeadCase, ConsentGrant, Ownership, PoolItem,
      ReachPlan, ReachAttempt, ReachReceipt, Appointment, AgentSeat, SkillGroup,
      DomainEvent, Outbox, AuditLog, CaseActivity, Tenant, User, Order,
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService, EventsService, RolesGuard],
  exports: [LeadsService, EventsService],
})
export class LeadsModule {}
