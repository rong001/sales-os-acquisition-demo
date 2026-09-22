import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { GrowthService } from './growth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GrowthController {
  constructor(private readonly growth: GrowthService) {}

  @Get('admin/content-pages')
  @Roles('admin', 'supervisor', 'viewer')
  listPages(@CurrentUser() user: AuthUser) {
    return this.growth.adminListPages(user);
  }

  @Put('admin/content-pages')
  @Roles('admin', 'supervisor')
  upsertPage(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.growth.upsertPage(user, body as never);
  }

  @Get('admin/channel-links')
  @Roles('admin', 'supervisor', 'viewer')
  listLinks(@CurrentUser() user: AuthUser) {
    return this.growth.listChannelLinks(user);
  }

  @Put('admin/channel-links')
  @Roles('admin', 'supervisor')
  upsertLink(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.growth.upsertChannelLink(user, body as never);
  }

  @Get('admin/invite-codes')
  @Roles('admin', 'supervisor', 'viewer')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.growth.listInvites(user);
  }

  @Put('admin/invite-codes')
  @Roles('admin', 'supervisor')
  upsertInvite(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.growth.upsertInvite(user, body as never);
  }

  @Get('admin/campaigns')
  @Roles('admin', 'supervisor', 'viewer')
  listCampaigns(@CurrentUser() user: AuthUser, @Query('enabled') enabled?: string) {
    return this.growth.listCampaigns(user, enabled === '1' || enabled === 'true');
  }

  @Put('admin/campaigns')
  @Roles('admin', 'supervisor')
  upsertCampaign(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.growth.upsertCampaign(user, body as never);
  }

  @Get('admin/audits')
  @Roles('admin', 'supervisor', 'viewer')
  listAudits(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.growth.listAudits(user, limit ? Number(limit) : 100);
  }

  @Get('admin/conversion')
  @Roles('admin', 'supervisor', 'viewer')
  conversion(@CurrentUser() user: AuthUser) {
    return this.growth.conversionBySource(user);
  }
}
