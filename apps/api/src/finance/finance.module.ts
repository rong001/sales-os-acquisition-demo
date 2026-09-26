import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  Contract, PaymentPlan, PaymentReceipt, LeadCase,
  DomainEvent, Outbox, AuditLog,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contract, PaymentPlan, PaymentReceipt, LeadCase,
      DomainEvent, Outbox, AuditLog,
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [FinanceService],
})
export class FinanceModule {}
