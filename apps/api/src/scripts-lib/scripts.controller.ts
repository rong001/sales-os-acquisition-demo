import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ScriptsService } from './scripts.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CurrentUser } from '../common/tenant.decorator';
import { AuthUser } from '../common/types';

@Controller('scripts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Get('recommend/:caseId')
  recommend(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.scripts.recommend(user, caseId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('scene') scene?: string, @Query('all') all?: string) {
    if (all === '1') return this.scripts.listAll(user);
    return this.scripts.list(user, scene);
  }

  @Post()
  @Roles('agent', 'admin', 'supervisor')
  create(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.scripts.create(user, body as never);
  }

  @Patch(':id')
  @Roles('agent', 'admin', 'supervisor')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.scripts.update(user, id, body as never);
  }

  @Delete(':id')
  @Roles('admin', 'supervisor')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scripts.remove(user, id);
  }
}
