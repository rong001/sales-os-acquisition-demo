import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Tenant, User, SkillGroup, AgentSeat } from '../entities';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly log = new Logger('Seed');

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(SkillGroup) private readonly groups: Repository<SkillGroup>,
    @InjectRepository(AgentSeat) private readonly seats: Repository<AgentSeat>,
  ) {}

  async onModuleInit() {
    if (process.env.SEED_ON_BOOT === 'false') return;
    await this.ensureDemo();
  }

  private demoPassword(which: 'agent' | 'admin') {
    const fromEnv =
      which === 'agent'
        ? process.env.DEMO_AGENT_PASSWORD
        : process.env.DEMO_ADMIN_PASSWORD;
    if (fromEnv && fromEnv !== 'CHANGE_ME') return fromEnv;
    // Local-only fallback when .env provides nothing; never commit real secrets.
    return process.env.DEMO_DEFAULT_PASSWORD || 'demo1234';
  }

  async ensureDemo() {
    let tenant = await this.tenants.findOne({ where: { slug: 'demo' } });
    if (!tenant) {
      tenant = await this.tenants.findOne({ where: { name: '演示销售公司' } });
    }
    if (!tenant) {
      tenant = await this.tenants.save(this.tenants.create({
        name: '演示销售公司',
        slug: 'demo',
        mode_flags: ['LEAD_INBOUND', 'HYBRID'],
        timezone: 'Asia/Shanghai',
        locale: 'zh-CN',
      }));
      this.log.log(`created tenant ${tenant.id}`);
    } else if (!tenant.slug) {
      tenant.slug = 'demo';
      await this.tenants.save(tenant);
    }

    const skillDefs = [
      { name: '默认技能组', skills: ['general', 'demo', 'ticket-grab', 'usgate'] },
      { name: '抢票技能组', skills: ['ticket-grab'] },
      { name: 'USGate技能组', skills: ['usgate'] },
    ];
    let defaultGroup: SkillGroup | null = null;
    for (const def of skillDefs) {
      let g = await this.groups.findOne({ where: { tenant_id: tenant.id, name: def.name } });
      if (!g) {
        g = await this.groups.save(this.groups.create({
          tenant_id: tenant.id,
          name: def.name,
          skills: def.skills,
          max_in_progress: 50,
        }));
      }
      if (def.name === '默认技能组') defaultGroup = g;
    }
    if (!defaultGroup) throw new Error('default skill group missing');

    const accounts: Array<[string, string, string, 'agent' | 'admin']> = [
      ['agent@demo.local', '演示坐席', 'agent', 'agent'],
      ['admin@demo.local', '演示管理员', 'admin', 'admin'],
    ];

    for (const [email, name, role, pwdKey] of accounts) {
      let user = await this.users.findOne({ where: { tenant_id: tenant.id, email } });
      const hash = await bcrypt.hash(this.demoPassword(pwdKey), 10);
      if (!user) {
        user = await this.users.save(this.users.create({
          tenant_id: tenant.id,
          email,
          password_hash: hash,
          display_name: name,
          role,
        }));
        this.log.log(`created user ${email}`);
      } else {
        // Keep role in sync; refresh password from env on boot for demo hygiene.
        user.role = role;
        user.password_hash = hash;
        user.display_name = name;
        await this.users.save(user);
      }
      const seat = await this.seats.findOne({ where: { tenant_id: tenant.id, user_id: user.id } });
      if (!seat) {
        await this.seats.save(this.seats.create({
          tenant_id: tenant.id,
          user_id: user.id,
          skill_group_id: defaultGroup.id,
          online: true,
          current_load: 0,
          shift: 'day',
        }));
      }
    }

    return { tenant };
  }
}
