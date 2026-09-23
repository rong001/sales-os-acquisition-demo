import { Module, Controller, Get, Res, HttpStatus, UseFilters } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from 'express';
import { ALL_ENTITIES } from './entities';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { SeedModule } from './seed/seed.module';
import { PublicModule } from './public/public.module';
import { GrowthModule } from './growth/growth.module';
import { HealthService } from './common/health.service';
import { DependencyExceptionFilter } from './common/dependency.filter';

/**
 * Health contract (followup1217):
 * - GET /health/live  → liveness (process up only; does NOT prove PG/Redis)
 * - GET /health       → readiness (fails 503 when required postgres/redis down)
 * - GET /health/ready → readiness (alias)
 * Web proxy /api/health → /health (readiness). Start/Test gates must use readiness.
 */
@Controller()
@UseFilters(DependencyExceptionFilter)
class HealthController {
  constructor(private readonly healthSvc: HealthService) {}

  @Get('health/live')
  live() {
    return this.healthSvc.liveness();
  }

  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const body = await this.healthSvc.readiness();
    if (!body.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  @Get('health')
  async health(@Res({ passthrough: true }) res: Response) {
    const body = await this.healthSvc.readiness();
    if (!body.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL || 'postgres://sales:sales@127.0.0.1:5432/sales_os',
      entities: ALL_ENTITIES,
      synchronize: true,
      logging: process.env.TYPEORM_LOG === 'true',
    }),
    AuthModule,
    LeadsModule,
    GrowthModule,
    PublicModule,
    SeedModule,
  ],
  controllers: [HealthController],
  providers: [HealthService, DependencyExceptionFilter],
})
export class AppModule {}
