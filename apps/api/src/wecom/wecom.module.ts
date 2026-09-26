import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WecomService } from './wecom.service';
import { WecomController } from './wecom.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  WecomLinkCache, LeadCase, LeadIdentity, CaseActivity,
  DomainEvent, Outbox, AuditLog,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WecomLinkCache, LeadCase, LeadIdentity, CaseActivity,
      DomainEvent, Outbox, AuditLog,
    ]),
  ],
  controllers: [WecomController],
  providers: [WecomService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [WecomService],
})
export class WecomModule {}
