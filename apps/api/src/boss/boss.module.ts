import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BossService } from './boss.service';
import { BossController } from './boss.controller';
import { FinanceModule } from '../finance/finance.module';
import { RolesGuard } from '../common/roles.guard';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { LeadCase, LeadIdentity } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeadCase, LeadIdentity]),
    FinanceModule,
  ],
  controllers: [BossController],
  providers: [BossService, RolesGuard, JwtAuthGuard],
})
export class BossModule {}
