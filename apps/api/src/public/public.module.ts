import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { LeadsModule } from '../leads/leads.module';
import { GrowthModule } from '../growth/growth.module';
import { RateLimitService } from '../common/rate-limit.service';

@Module({
  imports: [LeadsModule, GrowthModule],
  controllers: [PublicController],
  providers: [RateLimitService],
})
export class PublicModule {}
