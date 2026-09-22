import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrowthService } from './growth.service';
import { GrowthController } from './growth.controller';
import {
  ContentPage, ChannelLink, InviteCode, Campaign, Tenant, AuditLog, LeadSource, LeadCase,
  DomainEvent, Outbox,
} from '../entities';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentPage, ChannelLink, InviteCode, Campaign, Tenant, AuditLog, LeadSource, LeadCase,
      DomainEvent, Outbox,
    ]),
  ],
  controllers: [GrowthController],
  providers: [GrowthService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [GrowthService],
})
export class GrowthModule {}
