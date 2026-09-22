import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { LeadsService } from '../leads/leads.service';
import { PRODUCTS, getProduct } from '../common/products';
import { CONSENT_TEXT_V1, CONSENT_VERSION } from '../entities';

@Controller('public')
export class PublicController {
  constructor(private readonly leads: LeadsService) {}

  @Get('products')
  products() {
    return Object.values(PRODUCTS).map((p) => ({
      code: p.code,
      name_zh: p.name_zh,
      name_en: p.name_en,
      tagline: p.tagline,
      demo_live_url: p.demo_live_url || null,
      intake_url: p.intake_url || null,
      repo_url: p.repo_url || null,
      capabilities: p.capabilities || [],
    }));
  }

  @Get('products/:code')
  product(@Param('code') code: string) {
    const p = getProduct(code);
    return {
      ...p,
      demo_live_url: p.demo_live_url || null,
      intake_url: p.intake_url || null,
      repo_url: p.repo_url || null,
      capabilities: p.capabilities || [],
      consent_text: CONSENT_TEXT_V1,
      consent_version: CONSENT_VERSION,
    };
  }

  @Post('leads/intake')
  async intake(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      undefined;
    const user_agent = req.headers['user-agent'];
    const payload = Object.assign({}, body, { ip, user_agent });
    return this.leads.publicIntake(payload as never);
  }
}
