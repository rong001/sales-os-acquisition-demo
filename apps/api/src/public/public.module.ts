import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],
  controllers: [PublicController],
})
export class PublicModule {}
