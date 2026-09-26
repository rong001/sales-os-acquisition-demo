import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScriptsService } from './scripts.service';
import { ScriptsController } from './scripts.controller';
import { EventsService } from '../events/events.service';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { SalesScript, LeadCase, DomainEvent, Outbox, AuditLog } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesScript, LeadCase, DomainEvent, Outbox, AuditLog]),
  ],
  controllers: [ScriptsController],
  providers: [ScriptsService, EventsService, RolesGuard, JwtAuthGuard],
  exports: [ScriptsService],
})
export class ScriptsModule {}
