import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, AgentSeat, Tenant } from '../entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AgentSeat) private readonly seats: Repository<AgentSeat>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');
    const seat = await this.seats.findOne({ where: { user_id: user.id, tenant_id: user.tenant_id } });
    const tenant = await this.tenants.findOne({ where: { id: user.tenant_id } });
    const payload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
      agent_seat_id: seat?.id,
      display_name: user.display_name,
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        tenant_id: user.tenant_id,
        tenant_name: tenant?.name,
        agent_seat_id: seat?.id,
      },
    };
  }

  async me(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const seat = await this.seats.findOne({ where: { user_id: user.id } });
    const tenant = await this.tenants.findOne({ where: { id: user.tenant_id } });
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      tenant_id: user.tenant_id,
      tenant_name: tenant?.name,
      agent_seat_id: seat?.id,
    };
  }
}
