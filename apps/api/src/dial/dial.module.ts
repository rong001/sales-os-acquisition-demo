import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DialService } from './dial.service';
import { DialController } from './dial.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  DialTask, DialTaskItem, CallRecord, LeadCase, LeadIdentity, CaseActivity, ScriptStar,
  DomainEvent, Outbox, AuditLog,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DialTask, DialTaskItem, CallRecord, LeadCase, LeadIdentity, CaseActivity, ScriptStar,
      DomainEvent, Outbox, AuditLog,
    ]),
  ],
  controllers: [DialController],
  providers: [DialService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [DialService],
})
export class DialModule {}
