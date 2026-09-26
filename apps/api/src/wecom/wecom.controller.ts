import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { WecomService } from './wecom.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller('wecom')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WecomController {
  constructor(private readonly wecom: WecomService) {}

  @Get('status')
  status() {
    return this.wecom.status();
  }

  @Get('sidepanel/context')
  context(
    @CurrentUser() user: AuthUser,
    @Query('external_userid') external_userid?: string,
    @Query('phone') phone?: string,
    @Query('case_id') case_id?: string,
    @Query('mock') mock?: string,
  ) {
    return this.wecom.resolveContext(user, { external_userid, phone, case_id, mock });
  }

  @Post('sidepanel/follow-up')
  @Roles('agent', 'admin', 'supervisor')
  followUp(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.wecom.followUp(user, body as never);
  }

  @Post('sidepanel/tag')
  @Roles('agent', 'admin', 'supervisor')
  tag(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.wecom.tag(user, body as never);
  }
}
