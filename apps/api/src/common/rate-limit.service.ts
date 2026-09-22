import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Sliding-window rate limit by IP + phone (or email).
 * Uses Redis when available; falls back to in-memory Map for local demos.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly log = new Logger('RateLimit');
  private redis: Redis | null = null;
  private mem = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxHits: number;

  constructor() {
    this.windowMs = Number(process.env.INTAKE_RATE_WINDOW_MS || 60_000);
    this.maxHits = Number(process.env.INTAKE_RATE_MAX || 8);
    const url = process.env.REDIS_URL;
    if (url) {
      try {
        this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
        this.redis.connect().catch((e) => {
          this.log.warn(`Redis unavailable for rate limit: ${e?.message || e}`);
          this.redis = null;
        });
      } catch {
        this.redis = null;
      }
    }
  }

  onModuleDestroy() {
    try { this.redis?.disconnect(); } catch { /* */ }
  }

  private key(ip: string, phoneOrEmail: string) {
    return `rl:intake:${ip || 'unknown'}:${phoneOrEmail || 'none'}`;
  }

  async assertAllowed(ip: string | undefined, phoneOrEmail: string) {
    const k = this.key(ip || 'unknown', phoneOrEmail);
    if (this.redis) {
      try {
        const now = Date.now();
        const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
        const pipe = this.redis.multi();
        pipe.zremrangebyscore(k, 0, now - this.windowMs);
        pipe.zadd(k, now, member);
        pipe.zcard(k);
        pipe.pexpire(k, this.windowMs);
        const res = await pipe.exec();
        const count = Number(res?.[2]?.[1] ?? 0);
        if (count > this.maxHits) {
          throw new HttpException(
            { message: '提交过于频繁，请稍后再试', code: 'RATE_LIMITED' },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return { limited: false, count, backend: 'redis' as const };
      } catch (e) {
        if (e instanceof HttpException) throw e;
        this.log.warn(`rate limit redis error, fallback mem: ${(e as Error)?.message}`);
      }
    }
    // memory fallback
    const now = Date.now();
    const arr = (this.mem.get(k) || []).filter((t) => t > now - this.windowMs);
    arr.push(now);
    this.mem.set(k, arr);
    if (arr.length > this.maxHits) {
      throw new HttpException(
        { message: '提交过于频繁，请稍后再试', code: 'RATE_LIMITED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return { limited: false, count: arr.length, backend: 'memory' as const };
  }
}
