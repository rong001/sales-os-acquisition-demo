import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import {
  Tenant, User, SkillGroup, AgentSeat,
  ContentPage, ChannelLink, InviteCode, Campaign,
} from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant, User, SkillGroup, AgentSeat,
      ContentPage, ChannelLink, InviteCode, Campaign,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
