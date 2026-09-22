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
    }));
  }

  @Get('products/:code')
  product(@Param('code') code: string) {
    const p = getProduct(code);
    return {
      ...p,
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
    return this.leads.publicIntake({
      ...(body as never),
      ip,
      user_agent,
    });
  }
}
