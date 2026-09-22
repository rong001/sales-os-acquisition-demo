import { Module, Controller, Get } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ALL_ENTITIES } from './entities';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { SeedModule } from './seed/seed.module';
import { PublicModule } from './public/public.module';
import { GrowthModule } from './growth/growth.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'sales-os-api',
      ts: new Date().toISOString(),
      reach: {
        real_sms: process.env.REAL_SMS_ENABLED === 'true',
        real_call: process.env.REAL_CALL_ENABLED === 'true',
        real_email: process.env.REAL_EMAIL_ENABLED === 'true',
      },
    };
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
})
export class AppModule {}
