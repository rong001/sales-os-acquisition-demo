import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PoolService } from './pool.service';
import { PoolController } from './pool.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  LeadCase, Ownership, PoolItem, PoolRule, PoolAuditLog, AgentSeat, LeadIdentity,
  DomainEvent, Outbox, AuditLog,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeadCase, Ownership, PoolItem, PoolRule, PoolAuditLog, AgentSeat, LeadIdentity,
      DomainEvent, Outbox, AuditLog,
    ]),
  ],
  controllers: [PoolController],
  providers: [PoolService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [PoolService],
})
export class PoolModule {}
