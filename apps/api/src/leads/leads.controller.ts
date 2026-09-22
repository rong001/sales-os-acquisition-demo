import {
  Body, Controller, Get, Header, Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller()
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('leads/intake')
  intake(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.leads.intake(user, body as never);
  }

  @Post('leads/:caseId/qualify')
  qualify(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.leads.qualify(user, caseId);
  }

  @Post('leads/:caseId/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { agent_seat_id?: string },
  ) {
    return this.leads.assign(user, caseId, body?.agent_seat_id);
  }

  @Get('agents')
  listAgents(@CurrentUser() user: AuthUser) {
    return this.leads.listAgents(user);
  }

  @Post('leads/:caseId/reach-attempts')
  createAttempt(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { channel?: string },
  ) {
    return this.leads.createReachAttempt(user, caseId, body?.channel || 'mock_call');
  }

  @Post('reach-attempts/:attemptId/mock-receipt')
  mockReceipt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() body: { result_code?: string },
  ) {
    return this.leads.mockReceipt(user, attemptId, body?.result_code || 'connected_intent');
  }

  @Post('leads/:caseId/appointments/draft')
  draft(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.leads.draftAppointment(user, caseId);
  }

  @Post('appointments/:id/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leads.confirmAppointment(user, id);
  }

  @Post('leads/:caseId/activities')
  addActivity(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() body: { kind?: string; body: string; meta?: Record<string, unknown> },
  ) {
    return this.leads.addActivity(user, caseId, body);
  }

  @Get('leads/:caseId/activities')
  listActivities(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.leads.listActivities(user, caseId);
  }

  @Get('leads/:caseId')
  getCase(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.leads.getCase(user, caseId);
  }

  @Get('workbench/today')
  today(@CurrentUser() user: AuthUser) {
    return this.leads.todayWorkbench(user);
  }

  @Get('admin/funnel')
  @UseGuards(RolesGuard)
  @Roles('admin')
  funnel(@CurrentUser() user: AuthUser, @Query('product') product?: string) {
    return this.leads.funnelStats(user, product);
  }

  @Get('admin/leads/export.csv')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async exportCsv(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.leads.exportLeadsCsv(user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send('\uFEFF' + csv);
  }
}
