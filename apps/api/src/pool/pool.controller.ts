import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PoolService } from './pool.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller('pool')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PoolController {
  constructor(private readonly pool: PoolService) {}

  @Get('rules')
  getRules(@CurrentUser() user: AuthUser) {
    return this.pool.getRules(user);
  }

  @Put('rules')
  @Roles('admin', 'supervisor')
  putRules(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.pool.putRules(user, body as never);
  }

  @Get('public')
  listPublic(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.pool.listPublic(user, limit ? Number(limit) : 50);
  }

  @Get('audits')
  @Roles('admin', 'supervisor')
  audits(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.pool.listAudits(user, limit ? Number(limit) : 50);
  }

  @Post(':caseId/claim')
  @Roles('agent', 'admin', 'supervisor')
  claim(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.pool.claim(user, caseId);
  }

  @Post(':caseId/release')
  @Roles('agent', 'admin', 'supervisor')
  release(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { reason?: string },
  ) {
    return this.pool.release(user, caseId, body?.reason || 'manual_release');
  }

  @Post('recycle')
  @Roles('admin', 'supervisor')
  recycle(@CurrentUser() user: AuthUser) {
    return this.pool.recycleIdle(user.tenant_id);
  }
}
