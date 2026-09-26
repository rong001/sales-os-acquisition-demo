import { Controller, Get, UseGuards } from '@nestjs/common';
import { BossService } from './boss.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller('boss')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BossController {
  constructor(private readonly boss: BossService) {}

  @Get('screens')
  @Roles('admin', 'supervisor', 'viewer')
  screens(@CurrentUser() user: AuthUser) {
    return this.boss.screens(user);
  }
}
