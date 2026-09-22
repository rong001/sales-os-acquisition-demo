import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { Tenant, User, SkillGroup, AgentSeat } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, User, SkillGroup, AgentSeat])],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
