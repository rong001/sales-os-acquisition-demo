import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  Tenant, User, SkillGroup, AgentSeat,
  ContentPage, ChannelLink, InviteCode, Campaign,
} from '../entities';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly log = new Logger('Seed');

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(SkillGroup) private readonly groups: Repository<SkillGroup>,
    @InjectRepository(AgentSeat) private readonly seats: Repository<AgentSeat>,
    @InjectRepository(ContentPage) private readonly pages: Repository<ContentPage>,
    @InjectRepository(ChannelLink) private readonly links: Repository<ChannelLink>,
    @InjectRepository(InviteCode) private readonly invites: Repository<InviteCode>,
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
  ) {}

  async onModuleInit() {
    if (process.env.SEED_ON_BOOT === 'false') return;
    await this.ensureDemo();
  }

  private demoPassword(which: 'agent' | 'admin' | 'viewer' | 'agent2' | 'manager') {
    const map: Record<string, string | undefined> = {
      agent: process.env.DEMO_AGENT_PASSWORD,
      agent2: process.env.DEMO_AGENT2_PASSWORD || process.env.DEMO_AGENT_PASSWORD,
      manager: process.env.DEMO_MANAGER_PASSWORD || process.env.DEMO_ADMIN_PASSWORD,
      admin: process.env.DEMO_ADMIN_PASSWORD,
      viewer: process.env.DEMO_VIEWER_PASSWORD,
    };
    const fromEnv = map[which];
    if (fromEnv && fromEnv !== 'CHANGE_ME') return fromEnv;
    if (which === 'viewer') return process.env.DEMO_DEFAULT_PASSWORD || 'demo-viewer';
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

    const accounts: Array<[string, string, string, 'agent' | 'admin' | 'viewer' | 'agent2' | 'manager']> = [
      ['agent@demo.local', '演示销售1', 'agent', 'agent'],
      ['agent2@demo.local', '演示销售2', 'agent', 'agent2'],
      ['manager@demo.local', '演示经理', 'supervisor', 'manager'],
      ['admin@demo.local', '演示管理员', 'admin', 'admin'],
      ['viewer@demo.local', '演示访客(只读)', 'viewer', 'viewer'],
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
        user.role = role;
        user.password_hash = hash;
        user.display_name = name;
        await this.users.save(user);
      }
      if (role === 'viewer') continue;
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

    await this.seedGrowth(tenant.id);
    return { tenant };
  }

  private async seedGrowth(tenantId: string) {
    const pageDefs = [
      {
        slug: 'ticket-grab-overview',
        title: '抢票助手能力边界（演示）',
        description: '火车 live 可用；机票库存/票价监控不可用；邮件未实达待 SMTP。演示留资≠正式合同。',
        product_code: 'ticket-grab',
        body: `## 能力边界（诚实）

- **火车公开余票**：live 可用（provider=train12306；trainRealSubmit=false）
- **机票实时可售 / 票价监控**：不可用（flightInventoryLive=false / flightFareMonitor=false）
- **邮件通知**：未实达（SMTP 未配置 / ECONNREFUSED）— 属阻塞，非成功 MOCK
- **真实成交 / 自动购票**：stub，不虚称可售

现网：https://159.75.71.192:18444/intake · /capabilities  
公开仓 tip：9ee80b0

> 本页与落地页留资均为**演示**，不等于正式服务合同。`,
      },
      {
        slug: 'usgate-overview',
        title: 'USGate MOCK 演示说明',
        description: 'MOCK 门户可访问；真面板/真机未验收；不可标 ToC 可售。',
        product_code: 'usgate',
        body: `## MOCK 演示（不可标可售）

- MOCK 门户：https://117.55.227.224:8443/（mock_xui:true）
- 仓：usgate-demo@809bf29 · usgate-client@53a9afb
- **未接**真实 3X-UI；Android 真机 E2E **未通过**
- 未交付：真面板验收、真订阅、真机出口证据、CI workflow

> 演示留资 ≠ 正式服务合同。`,
      },
    ];
    for (const def of pageDefs) {
      let row = await this.pages.findOne({ where: { tenant_id: tenantId, slug: def.slug } });
      if (!row) {
        await this.pages.save(this.pages.create({
          tenant_id: tenantId,
          ...def,
          published: true,
        }));
      } else {
        Object.assign(row, def, { published: true });
        await this.pages.save(row);
      }
    }

    const linkDefs = [
      {
        code: 'wx-ticket',
        name: '微信·抢票演示',
        product_code: 'ticket-grab',
        utm_source: 'wechat',
        utm_medium: 'social',
        utm_campaign: 'demo_ticket',
        invite_code: 'INV01',
      },
      {
        code: 'web-usgate',
        name: '官网·USGate演示',
        product_code: 'usgate',
        utm_source: 'website',
        utm_medium: 'referral',
        utm_campaign: 'demo_usgate',
        invite_code: 'INV02',
      },
    ];
    for (const def of linkDefs) {
      let row = await this.links.findOne({ where: { tenant_id: tenantId, code: def.code } });
      if (!row) {
        await this.links.save(this.links.create({ tenant_id: tenantId, enabled: true, hit_count: 0, ...def }));
      }
    }

    const inviteDefs = [
      { code: 'INV01', label: '抢票种子邀请', product_code: 'ticket-grab', channel_code: 'wx-ticket' },
      { code: 'INV02', label: 'USGate种子邀请', product_code: 'usgate', channel_code: 'web-usgate' },
      { code: 'DEMO99', label: '综合演示码', product_code: null, channel_code: null },
    ];
    for (const def of inviteDefs) {
      let row = await this.invites.findOne({ where: { tenant_id: tenantId, code: def.code } });
      if (!row) {
        await this.invites.save(this.invites.create({
          tenant_id: tenantId,
          code: def.code,
          label: def.label,
          product_code: def.product_code,
          channel_code: def.channel_code,
          enabled: true,
          use_count: 0,
          max_uses: null,
        }));
      }
    }

    const campDefs = [
      {
        name: '春运抢票咨询演示',
        landing_product: 'ticket-grab',
        creative_copy: '高峰出行自愿留资 · 演示不等于可售',
        creative_url: '/c/ticket-grab-overview',
        utm_campaign: 'demo_ticket',
        enabled: true,
      },
      {
        name: 'USGate MOCK 门户引流',
        landing_product: 'usgate',
        creative_copy: 'MOCK 门户可访问 · 真面板未接',
        creative_url: '/c/usgate-overview',
        utm_campaign: 'demo_usgate',
        enabled: true,
      },
    ];
    for (const def of campDefs) {
      let row = await this.campaigns.findOne({ where: { tenant_id: tenantId, name: def.name } });
      if (!row) {
        await this.campaigns.save(this.campaigns.create({
          tenant_id: tenantId,
          starts_at: new Date('2026-01-01'),
          ends_at: new Date('2026-12-31'),
          ...def,
        }));
      }
    }
    this.log.log('growth seed upserted (pages/links/invites/campaigns)');
  }
}
