import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { LeadsService } from '../leads/leads.service';
import { GrowthService } from '../growth/growth.service';
import { PRODUCTS, getProduct } from '../common/products';
import { CONSENT_TEXT_V1, CONSENT_VERSION } from '../entities';
import { PublicIntakeDto } from '../dto/intake.dto';
import { RateLimitService } from '../common/rate-limit.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly leads: LeadsService,
    private readonly growth: GrowthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('products')
  products() {
    return Object.values(PRODUCTS).map((p) => ({
      code: p.code,
      name_zh: p.name_zh,
      name_en: p.name_en,
      tagline: p.tagline,
      demo_live_url: p.demo_live_url || null,
      intake_url: p.intake_url || null,
      capabilities_url: p.capabilities_url || null,
      repo_url: p.repo_url || null,
      repo_tip: p.repo_tip || null,
      secondary_repos: p.secondary_repos || [],
      capabilities: p.capabilities || [],
      honesty: p.honesty || [],
      service_disclaimer: p.service_disclaimer || null,
      status_label: p.status_label || null,
    }));
  }

  @Get('products/:code')
  product(@Param('code') code: string) {
    const p = getProduct(code);
    return {
      ...p,
      demo_live_url: p.demo_live_url || null,
      intake_url: p.intake_url || null,
      capabilities_url: p.capabilities_url || null,
      repo_url: p.repo_url || null,
      repo_tip: p.repo_tip || null,
      secondary_repos: p.secondary_repos || [],
      capabilities: p.capabilities || [],
      honesty: p.honesty || [],
      service_disclaimer: p.service_disclaimer || null,
      status_label: p.status_label || null,
      consent_text: CONSENT_TEXT_V1,
      consent_version: CONSENT_VERSION,
      reach_modes: {
        sms: process.env.REAL_SMS_ENABLED === 'true' ? 'LIVE_IF_CREDENTIALS' : 'MOCK',
        call: process.env.REAL_CALL_ENABLED === 'true' ? 'LIVE_IF_CREDENTIALS' : 'MOCK',
        email: process.env.REAL_EMAIL_ENABLED === 'true' ? 'LIVE_IF_CREDENTIALS' : 'MOCK_OR_UNDELIVERED',
      },
    };
  }

  @Get('pages')
  listPages() {
    return this.growth.listPagesPublic();
  }

  @Get('pages/:slug')
  getPage(@Param('slug') slug: string) {
    return this.growth.getPageBySlug(slug);
  }

  @Get('r/:code')
  resolveRedirect(@Param('code') code: string) {
    return this.growth.resolveRedirect(code);
  }

  @Post('leads/intake')
  async intake(@Body() body: PublicIntakeDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    const user_agent = req.headers['user-agent'];
    const phoneDigits = (body.phone || '').replace(/\D/g, '');
    const identityKey = phoneDigits || (body.email || '').toLowerCase() || 'anon';
    await this.rateLimit.assertAllowed(ip, identityKey);
    const payload = Object.assign({}, body, { ip, user_agent });
    return this.leads.publicIntake(payload as never);
  }
}
