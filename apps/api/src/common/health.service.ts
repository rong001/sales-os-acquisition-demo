import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

export type DepCheck = {
  ok: boolean;
  latency_ms: number | null;
  error: string | null;
};

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly log = new Logger('Health');
  private redis: Redis | null = null;
  private redisUrl: string | null = null;

  constructor(private readonly dataSource: DataSource) {
    const url = process.env.REDIS_URL || '';
    this.redisUrl = url || null;
    if (url) {
      try {
        this.redis = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          lazyConnect: true,
          enableOfflineQueue: false,
        });
      } catch (e) {
        this.log.warn(`redis client init failed: ${(e as Error)?.message || e}`);
        this.redis = null;
      }
    }
  }

  onModuleDestroy() {
    try { this.redis?.disconnect(); } catch { /* */ }
  }

  liveness() {
    return {
      ok: true,
      check: 'liveness' as const,
      service: 'sales-os-api',
      ts: new Date().toISOString(),
      reach: {
        real_sms: process.env.REAL_SMS_ENABLED === 'true',
        real_call: process.env.REAL_CALL_ENABLED === 'true',
        real_email: process.env.REAL_EMAIL_ENABLED === 'true',
      },
    };
  }

  async checkPostgres(): Promise<DepCheck> {
    const t0 = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { ok: true, latency_ms: Date.now() - t0, error: null };
    } catch (e) {
      return {
        ok: false,
        latency_ms: Date.now() - t0,
        error: String((e as Error)?.message || e).slice(0, 160),
      };
    }
  }

  async checkRedis(): Promise<DepCheck> {
    const t0 = Date.now();
    if (!this.redisUrl) {
      // Redis optional for pure API demo; readiness still reports not_configured
      return { ok: false, latency_ms: null, error: 'REDIS_URL not configured' };
    }
    if (!this.redis) {
      return { ok: false, latency_ms: null, error: 'redis client unavailable' };
    }
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect().catch(() => undefined);
      }
      const pong = await this.redis.ping();
      if (String(pong).toUpperCase() !== 'PONG') {
        return { ok: false, latency_ms: Date.now() - t0, error: `unexpected ping: ${pong}` };
      }
      return { ok: true, latency_ms: Date.now() - t0, error: null };
    } catch (e) {
      return {
        ok: false,
        latency_ms: Date.now() - t0,
        error: String((e as Error)?.message || e).slice(0, 160),
      };
    }
  }

  /**
   * Readiness: required deps for business APIs.
   * Postgres is always required. Redis is required when REDIS_URL is set
   * (queue/stream / rate-limit path for this deployment).
   */
  async readiness() {
    const postgres = await this.checkPostgres();
    const redisRequired = !!this.redisUrl;
    const redis = await this.checkRedis();
    const depsOk = postgres.ok && (!redisRequired || redis.ok);
    return {
      ok: depsOk,
      check: 'readiness' as const,
      service: 'sales-os-api',
      ts: new Date().toISOString(),
      deps: {
        postgres: {
          required: true,
          ...postgres,
        },
        redis: {
          required: redisRequired,
          configured: redisRequired,
          ...redis,
        },
      },
      reach: {
        real_sms: process.env.REAL_SMS_ENABLED === 'true',
        real_call: process.env.REAL_CALL_ENABLED === 'true',
        real_email: process.env.REAL_EMAIL_ENABLED === 'true',
      },
      contract: {
        liveness: 'GET /health/live — process up only',
        readiness: 'GET /health and GET /health/ready — fails when required postgres/redis down',
        note: 'Web proxy /api/health → /health (readiness). Do not treat liveness as business-ready.',
      },
    };
  }
}
