import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ContentPage, ChannelLink, InviteCode, Campaign, Tenant, AuditLog, LeadSource, LeadCase,
} from '../entities';
import { EventsService } from '../events/events.service';
import { AuthUser } from '../common/types';

@Injectable()
export class GrowthService {
  constructor(
    @InjectRepository(ContentPage) private readonly pages: Repository<ContentPage>,
    @InjectRepository(ChannelLink) private readonly links: Repository<ChannelLink>,
    @InjectRepository(InviteCode) private readonly invites: Repository<InviteCode>,
    @InjectRepository(Campaign) private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    @InjectRepository(LeadSource) private readonly sources: Repository<LeadSource>,
    @InjectRepository(LeadCase) private readonly cases: Repository<LeadCase>,
    private readonly events: EventsService,
  ) {}

  private isAdmin(user: AuthUser) {
    return user.role === 'admin' || user.role === 'supervisor';
  }

  private assertAdmin(user: AuthUser) {
    if (!this.isAdmin(user)) throw new ForbiddenException('需要管理员权限');
  }

  async resolveDemoTenant(): Promise<Tenant> {
    const slug = process.env.DEMO_TENANT_SLUG || 'demo';
    let t = await this.tenants.findOne({ where: { slug } });
    if (!t) t = await this.tenants.findOne({ where: { name: '演示销售公司' } });
    if (!t) throw new NotFoundException('演示租户未初始化');
    return t;
  }

  // ---- Content pages (SEO) ----
  async listPagesPublic() {
    const tenant = await this.resolveDemoTenant();
    return this.pages.find({
      where: { tenant_id: tenant.id, published: true },
      order: { updated_at: 'DESC' },
      select: ['id', 'slug', 'title', 'description', 'product_code', 'updated_at'],
    });
  }

  async getPageBySlug(slug: string) {
    const tenant = await this.resolveDemoTenant();
    const page = await this.pages.findOne({ where: { tenant_id: tenant.id, slug, published: true } });
    if (!page) throw new NotFoundException('页面不存在');
    return page;
  }

  async adminListPages(user: AuthUser) {
    return this.pages.find({ where: { tenant_id: user.tenant_id }, order: { updated_at: 'DESC' } });
  }

  async upsertPage(user: AuthUser, body: Partial<ContentPage> & { slug: string; title: string; body: string }) {
    this.assertAdmin(user);
    if (!body.slug?.trim() || !body.title?.trim()) throw new BadRequestException('slug/title 必填');
    let page = await this.pages.findOne({ where: { tenant_id: user.tenant_id, slug: body.slug } });
    if (!page) {
      page = this.pages.create({
        tenant_id: user.tenant_id,
        slug: body.slug.trim(),
        title: body.title.trim(),
        description: body.description || null,
        body: body.body || '',
        product_code: body.product_code || null,
        published: body.published !== false,
      });
    } else {
      page.title = body.title.trim();
      page.description = body.description ?? page.description;
      page.body = body.body ?? page.body;
      page.product_code = body.product_code ?? page.product_code;
      if (typeof body.published === 'boolean') page.published = body.published;
    }
    const saved = await this.pages.save(page);
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'content_page.upsert',
      resource_type: 'ContentPage', resource_id: saved.id,
      detail: { slug: saved.slug },
    });
    return saved;
  }

  // ---- Channel links /r/:code ----
  async resolveRedirect(code: string) {
    const tenant = await this.resolveDemoTenant();
    const link = await this.links.findOne({ where: { tenant_id: tenant.id, code, enabled: true } });
    if (!link) throw new NotFoundException('渠道码无效');
    link.hit_count += 1;
    await this.links.save(link);
    const product = link.product_code || 'ticket-grab';
    const landing = link.landing_path || `/p/${product}`;
    const q = new URLSearchParams();
    if (link.utm_source) q.set('utm_source', link.utm_source);
    if (link.utm_medium) q.set('utm_medium', link.utm_medium);
    if (link.utm_campaign) q.set('utm_campaign', link.utm_campaign);
    if (link.utm_content) q.set('utm_content', link.utm_content);
    if (link.invite_code) q.set('invite', link.invite_code);
    q.set('channel', link.code);
    const qs = q.toString();
    return { redirect_to: qs ? `${landing}?${qs}` : landing, link };
  }

  async listChannelLinks(user: AuthUser) {
    return this.links.find({ where: { tenant_id: user.tenant_id }, order: { created_at: 'DESC' } });
  }

  async upsertChannelLink(user: AuthUser, body: Partial<ChannelLink> & { code: string; name: string }) {
    this.assertAdmin(user);
    if (!body.code?.trim() || !body.name?.trim()) throw new BadRequestException('code/name 必填');
    let row = await this.links.findOne({ where: { tenant_id: user.tenant_id, code: body.code } });
    if (!row) {
      row = this.links.create({
        tenant_id: user.tenant_id,
        code: body.code.trim(),
        name: body.name.trim(),
        product_code: body.product_code || 'ticket-grab',
        utm_source: body.utm_source || body.code,
        utm_medium: body.utm_medium || 'channel',
        utm_campaign: body.utm_campaign || null,
        utm_content: body.utm_content || null,
        invite_code: body.invite_code || null,
        landing_path: body.landing_path || null,
        enabled: body.enabled !== false,
      });
    } else {
      Object.assign(row, {
        name: body.name.trim(),
        product_code: body.product_code ?? row.product_code,
        utm_source: body.utm_source ?? row.utm_source,
        utm_medium: body.utm_medium ?? row.utm_medium,
        utm_campaign: body.utm_campaign ?? row.utm_campaign,
        utm_content: body.utm_content ?? row.utm_content,
        invite_code: body.invite_code ?? row.invite_code,
        landing_path: body.landing_path ?? row.landing_path,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : row.enabled,
      });
    }
    const saved = await this.links.save(row);
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'channel_link.upsert',
      resource_type: 'ChannelLink', resource_id: saved.id, detail: { code: saved.code },
    });
    return saved;
  }

  // ---- Invite codes ----
  async listInvites(user: AuthUser) {
    return this.invites.find({ where: { tenant_id: user.tenant_id }, order: { created_at: 'DESC' } });
  }

  async upsertInvite(user: AuthUser, body: Partial<InviteCode> & { code: string }) {
    this.assertAdmin(user);
    if (!body.code?.trim()) throw new BadRequestException('code 必填');
    let row = await this.invites.findOne({ where: { tenant_id: user.tenant_id, code: body.code } });
    if (!row) {
      row = this.invites.create({
        tenant_id: user.tenant_id,
        code: body.code.trim().toUpperCase(),
        label: body.label || null,
        channel_code: body.channel_code || null,
        product_code: body.product_code || null,
        max_uses: body.max_uses ?? null,
        enabled: body.enabled !== false,
        expires_at: body.expires_at ? new Date(body.expires_at as unknown as string) : null,
      });
    } else {
      Object.assign(row, {
        label: body.label ?? row.label,
        channel_code: body.channel_code ?? row.channel_code,
        product_code: body.product_code ?? row.product_code,
        max_uses: body.max_uses ?? row.max_uses,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : row.enabled,
        expires_at: body.expires_at ? new Date(body.expires_at as unknown as string) : row.expires_at,
      });
    }
    const saved = await this.invites.save(row);
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'invite_code.upsert',
      resource_type: 'InviteCode', resource_id: saved.id, detail: { code: saved.code },
    });
    return saved;
  }

  async touchInviteUse(tenantId: string, code?: string | null) {
    if (!code) return;
    const row = await this.invites.findOne({ where: { tenant_id: tenantId, code: code.toUpperCase() } });
    if (!row || !row.enabled) return;
    if (row.expires_at && row.expires_at.getTime() < Date.now()) return;
    if (row.max_uses != null && row.use_count >= row.max_uses) return;
    row.use_count += 1;
    await this.invites.save(row);
  }

  // ---- Campaigns ----
  async listCampaigns(user: AuthUser, onlyEnabled = false) {
    const where: Record<string, unknown> = { tenant_id: user.tenant_id };
    if (onlyEnabled) where.enabled = true;
    return this.campaigns.find({ where: where as never, order: { created_at: 'DESC' } });
  }

  async upsertCampaign(user: AuthUser, body: Partial<Campaign> & { name: string }) {
    this.assertAdmin(user);
    if (!body.name?.trim()) throw new BadRequestException('name 必填');
    let row: Campaign | null = null;
    if (body.id) {
      row = await this.campaigns.findOne({ where: { id: body.id, tenant_id: user.tenant_id } });
    }
    if (!row) {
      row = this.campaigns.create({
        tenant_id: user.tenant_id,
        name: body.name.trim(),
        landing_product: body.landing_product || 'ticket-grab',
        creative_copy: body.creative_copy || null,
        creative_url: body.creative_url || null,
        starts_at: body.starts_at ? new Date(body.starts_at as unknown as string) : null,
        ends_at: body.ends_at ? new Date(body.ends_at as unknown as string) : null,
        enabled: body.enabled !== false,
        utm_campaign: body.utm_campaign || body.name.trim().replace(/\s+/g, '_').toLowerCase(),
      });
    } else {
      Object.assign(row, {
        name: body.name.trim(),
        landing_product: body.landing_product ?? row.landing_product,
        creative_copy: body.creative_copy ?? row.creative_copy,
        creative_url: body.creative_url ?? row.creative_url,
        starts_at: body.starts_at ? new Date(body.starts_at as unknown as string) : row.starts_at,
        ends_at: body.ends_at ? new Date(body.ends_at as unknown as string) : row.ends_at,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : row.enabled,
        utm_campaign: body.utm_campaign ?? row.utm_campaign,
      });
    }
    const saved = await this.campaigns.save(row);
    await this.events.audit({
      tenant_id: user.tenant_id, actor_user_id: user.sub, action: 'campaign.upsert',
      resource_type: 'Campaign', resource_id: saved.id, detail: { name: saved.name },
    });
    return saved;
  }

  // ---- Audit list (admin full; viewer redacted) ----
  async listAudits(user: AuthUser, limit = 100) {
    const rows = await this.audits.find({
      where: { tenant_id: user.tenant_id },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 500),
    });
    if (user.role === 'viewer') {
      return rows.map((r) => ({
        id: r.id,
        action: r.action,
        resource_type: r.resource_type,
        resource_id: r.resource_id,
        created_at: r.created_at,
        actor_user_id: r.actor_user_id ? '***' : null,
        detail: this.redactDetail(r.detail),
      }));
    }
    return rows;
  }

  private redactDetail(d: Record<string, unknown> | null) {
    if (!d) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (/phone|email|ip|ua|user_agent|password/i.test(k)) out[k] = '***';
      else out[k] = v;
    }
    return out;
  }

  /** Conversion by source / invite / campaign */
  async conversionBySource(user: AuthUser) {
    const cases = await this.cases.find({ where: { tenant_id: user.tenant_id } });
    const byUtm: Record<string, { intake: number; appointed: number; won: number; lost: number }> = {};
    const byInvite: Record<string, { intake: number; appointed: number; won: number; lost: number }> = {};
    const byCampaign: Record<string, { intake: number; appointed: number; won: number; lost: number }> = {};

    const bump = (
      map: Record<string, { intake: number; appointed: number; won: number; lost: number }>,
      key: string,
      c: LeadCase,
    ) => {
      const k = key || '(none)';
      if (!map[k]) map[k] = { intake: 0, appointed: 0, won: 0, lost: 0 };
      map[k].intake += 1;
      if (['APPOINTED', 'ORDERED', 'WON'].includes(c.stage)) map[k].appointed += 1;
      if (c.stage === 'WON' || c.stage === 'ORDERED') map[k].won += 1;
      if (['LOST', 'INVALID', 'REJECTED', 'EXIT_REFUSED'].includes(c.stage)) map[k].lost += 1;
    };

    for (const c of cases) {
      const src = c.source_id ? await this.sources.findOne({ where: { id: c.source_id } }) : null;
      bump(byUtm, src?.utm_source || '', c);
      bump(byInvite, src?.invite_code || '', c);
      bump(byCampaign, src?.utm_campaign || src?.campaign || '', c);
    }

    return { by_utm_source: byUtm, by_invite: byInvite, by_campaign: byCampaign, total_cases: cases.length };
  }
}
