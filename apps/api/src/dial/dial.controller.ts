import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { DialService } from './dial.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DialController {
  constructor(private readonly dial: DialService) {}

  @Get('calls/provider')
  provider() {
    return this.dial.providerStatus();
  }

  @Get('calls/starred')
  starred(@CurrentUser() user: AuthUser) {
    return this.dial.listStarred(user);
  }

  @Get('dial-tasks')
  listTasks(@CurrentUser() user: AuthUser) {
    return this.dial.listTasks(user);
  }

  @Post('dial-tasks')
  @Roles('admin', 'supervisor')
  createTask(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dial.createTask(user, body as never);
  }

  @Get('dial-tasks/:id')
  getTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dial.getTask(user, id);
  }

  @Post('dial-tasks/:id/next')
  @Roles('agent', 'admin', 'supervisor')
  next(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dial.nextItem(user, id);
  }

  @Post('dial-items/:id/result')
  @Roles('agent', 'admin', 'supervisor')
  result(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dial.submitResult(user, id, body as never);
  }

  @Post('calls/start')
  @Roles('agent', 'admin', 'supervisor')
  startCall(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.dial.startStandaloneCall(user, body as never);
  }

  @Get('calls')
  listCalls(@CurrentUser() user: AuthUser, @Query('case_id') caseId: string) {
    return this.dial.listCalls(user, caseId);
  }

  @Post('calls/:id/star')
  @Roles('agent', 'admin', 'supervisor')
  star(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.dial.starCall(user, id, body as never);
  }
}
