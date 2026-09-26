import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('contracts')
  listContracts(@CurrentUser() user: AuthUser, @Query('case_id') caseId?: string) {
    return this.finance.listContracts(user, caseId);
  }

  @Post('contracts')
  @Roles('agent', 'admin', 'supervisor')
  createContract(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.finance.createContract(user, body as never);
  }

  @Patch('contracts/:id')
  @Roles('agent', 'admin', 'supervisor')
  updateContract(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.finance.updateContract(user, id, body as never);
  }

  @Get('payment-plans')
  listPlans(
    @CurrentUser() user: AuthUser,
    @Query('case_id') caseId?: string,
    @Query('contract_id') contractId?: string,
  ) {
    return this.finance.listPlans(user, caseId, contractId);
  }

  @Post('payment-plans')
  @Roles('agent', 'admin', 'supervisor')
  createPlan(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.finance.createPlan(user, body as never);
  }

  @Get('payment-receipts')
  listReceipts(
    @CurrentUser() user: AuthUser,
    @Query('case_id') caseId?: string,
    @Query('contract_id') contractId?: string,
  ) {
    return this.finance.listReceipts(user, caseId, contractId);
  }

  @Post('payment-receipts')
  @Roles('agent', 'admin', 'supervisor')
  createReceipt(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.finance.createReceipt(user, body as never);
  }
}
