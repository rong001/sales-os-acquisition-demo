import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User, AgentSeat, Tenant } from '../entities';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AgentSeat, Tenant]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'sales-os-dev-secret-change-me',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
