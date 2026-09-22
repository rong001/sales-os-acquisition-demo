import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DomainEvent, Outbox, AuditLog } from '../entities';
import Redis from 'ioredis';

@Injectable()
export class EventsService {
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(DomainEvent) private readonly events: Repository<DomainEvent>,
    @InjectRepository(Outbox) private readonly outbox: Repository<Outbox>,
    @InjectRepository(AuditLog) private readonly audits: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {
    const url = process.env.REDIS_URL;
    if (url) {
      try {
        this.redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
        this.redis.connect().catch(() => { this.redis = null; });
      } catch {
        this.redis = null;
      }
    }
  }

  async emit(params: {
    tenant_id: string;
    case_id?: string | null;
    type: string;
    actor?: string;
    payload?: Record<string, unknown>;
    correlation_id?: string | null;
    causation_id?: string | null;
    aggregate_type?: string;
    aggregate_id?: string;
  }): Promise<DomainEvent> {
    return this.dataSource.transaction(async (manager) => {
      const event = manager.create(DomainEvent, {
        tenant_id: params.tenant_id,
        case_id: params.case_id ?? null,
        type: params.type,
        actor: params.actor ?? 'system',
        payload: params.payload ?? {},
        correlation_id: params.correlation_id ?? null,
        causation_id: params.causation_id ?? null,
        version: 1,
      });
      const saved = await manager.save(event);

      const ob = manager.create(Outbox, {
        tenant_id: params.tenant_id,
        aggregate_type: params.aggregate_type ?? 'LeadCase',
        aggregate_id: params.aggregate_id ?? params.case_id ?? saved.id,
        event_type: params.type,
        payload: { event_id: saved.id, ...(params.payload ?? {}) },
        status: 'pending',
      });
      const savedOb = await manager.save(ob);

      if (this.redis) {
        try {
          await this.redis.xadd(
            'salesos:events',
            '*',
            'outbox_id', savedOb.id,
            'event_type', params.type,
            'tenant_id', params.tenant_id,
            'payload', JSON.stringify(savedOb.payload),
          );
          savedOb.status = 'published';
          savedOb.published_at = new Date();
          await manager.save(savedOb);
        } catch {
          // leave pending for worker
        }
      }
      return saved;
    });
  }

  async audit(params: {
    tenant_id: string;
    actor_user_id?: string | null;
    action: string;
    resource_type?: string;
    resource_id?: string;
    detail?: Record<string, unknown>;
  }) {
    return this.audits.save(this.audits.create({
      tenant_id: params.tenant_id,
      actor_user_id: params.actor_user_id ?? null,
      action: params.action,
      resource_type: params.resource_type ?? null,
      resource_id: params.resource_id ?? null,
      detail: params.detail ?? {},
    }));
  }

  listByCase(tenant_id: string, case_id: string) {
    return this.events.find({
      where: { tenant_id, case_id },
      order: { occurred_at: 'ASC' },
    });
  }
}
