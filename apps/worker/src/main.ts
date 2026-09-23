import Redis from 'ioredis';
import { Client } from 'pg';
import {
  enqueueOutboxRow,
  recoverPendingOutbox,
  OUTBOX_STREAM,
  type RedisEnqueueClient,
  type OutboxStatusStore,
} from './outbox-enqueue';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://sales:sales@127.0.0.1:5432/sales_os';
const STREAM = OUTBOX_STREAM;
const GROUP = 'salesos-workers';
const CONSUMER = `worker-${process.pid}`;

async function ensureGroup(redis: Redis) {
  try {
    await redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
    console.log(`created consumer group ${GROUP}`);
  } catch (e: unknown) {
    if (!String(e).includes('BUSYGROUP')) throw e;
  }
}

async function pollOutbox(pg: Client, redis: Redis) {
  const store: OutboxStatusStore = {
    async listPending(limit) {
      const { rows } = await pg.query(
        `SELECT id, tenant_id, event_type, payload FROM outbox WHERE status='pending' ORDER BY created_at ASC LIMIT $1`,
        [limit],
      );
      return rows.map((row: { id: string; tenant_id: string; event_type: string; payload: unknown }) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        event_type: row.event_type,
        payload: row.payload,
      }));
    },
    async markPublished(id) {
      const res = await pg.query(
        `UPDATE outbox SET status='published', published_at=now() WHERE id=$1 AND status='pending'`,
        [id],
      );
      return (res.rowCount ?? 0) > 0 ? 'updated' : 'already';
    },
  };

  const summary = await recoverPendingOutbox(
    redis as unknown as RedisEnqueueClient,
    store,
    { limit: 20, stream: STREAM },
  );
  for (const o of summary.outcomes) {
    if (o.outcome === 'published') {
      console.log(`[outbox→stream] recovered/published ${o.id}`);
    } else if (o.outcome === 'enqueue_failed_pending') {
      console.error(`[outbox→stream] enqueue failed, still pending ${o.id}`);
    }
  }
}

async function handleMessage(fields: Record<string, string>, processed: Set<string>) {
  const outboxId = fields.outbox_id;
  if (outboxId && processed.has(outboxId)) {
    console.log(`[event] idempotent skip duplicate outbox_id=${outboxId}`);
    return;
  }
  const type = fields.event_type;
  if (type === 'conversion.appointment_valid') {
    console.log(`[P2] appointment_valid tenant=${fields.tenant_id} payload=${fields.payload}`);
  } else {
    console.log(`[event] ${type}`);
  }
  if (outboxId) processed.add(outboxId);
}

async function consumeLoop(redis: Redis) {
  const processed = new Set<string>();
  for (;;) {
    try {
      const res = await redis.xreadgroup(
        'GROUP', GROUP, CONSUMER, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', STREAM, '>',
      ) as [string, [string, string[]][]][] | null;
      if (!res) continue;
      for (const [, messages] of res) {
        for (const [id, flat] of messages) {
          const fields: Record<string, string> = {};
          for (let i = 0; i < flat.length; i += 2) fields[flat[i]] = flat[i + 1];
          try {
            await handleMessage(fields, processed);
            await redis.xack(STREAM, GROUP, id);
          } catch (err) {
            console.error('handle failed', id, err);
          }
        }
      }
    } catch (err) {
      console.error('consume error', err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  await ensureGroup(redis);
  console.log(`Sales OS worker online. stream=${STREAM} group=${GROUP}`);
  setInterval(() => { pollOutbox(pg, redis).catch((e) => console.error(e)); }, 3000);
  await consumeLoop(redis);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Export enqueue helper for direct one-shot publish paths if needed
export { enqueueOutboxRow };
