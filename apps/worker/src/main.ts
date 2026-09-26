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

async function recycleIdlePool(pg: Client) {
  // Load enabled pool_rules; recycle private cases past idle_days (and past protect)
  const { rows: rules } = await pg.query(
    `SELECT tenant_id, idle_days_to_recycle FROM pool_rules WHERE enabled = true`,
  ).catch(() => ({ rows: [] as { tenant_id: string; idle_days_to_recycle: number }[] }));
  for (const rule of rules) {
    const { rows: candidates } = await pg.query(
      `SELECT id, owner_agent_id AS prev_owner FROM lead_cases c
       WHERE c.tenant_id = $1
         AND c.sea_status = 'private'
         AND (c.protected_until IS NULL OR c.protected_until < now())
         AND (c.last_touch_at IS NULL OR c.last_touch_at < now() - ($2 || ' days')::interval)`,
      [rule.tenant_id, String(rule.idle_days_to_recycle)],
    );
    const rows: { id: string; prev_owner: string | null }[] = [];
    for (const cand of candidates) {
      const upd = await pg.query(
        `UPDATE lead_cases SET sea_status='public', owner_agent_id=NULL, protected_until=NULL, updated_at=now()
         WHERE id=$1 AND sea_status='private' RETURNING id`,
        [cand.id],
      );
      if ((upd.rowCount ?? 0) > 0) rows.push(cand);
    }
    for (const r of rows) {
      await pg.query(
        `INSERT INTO pool_audit_logs (id, tenant_id, actor_user_id, case_id, action, detail, created_at)
         VALUES (gen_random_uuid(), $1, NULL, $2, 'pool.idle_recycle', $3::jsonb, now())`,
        [rule.tenant_id, r.id, JSON.stringify({ prev_owner: r.prev_owner, via: 'worker' })],
      ).catch(() => undefined);
      await pg.query(
        `INSERT INTO pool_items (id, tenant_id, case_id, reason, claimable_from, last_owner_id, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'idle_recycle', now(), $3, 'open', now())
         ON CONFLICT DO NOTHING`,
        [rule.tenant_id, r.id, r.prev_owner],
      ).catch(async () => {
        // pool_items may not have unique on case_id — upsert via update
        await pg.query(
          `UPDATE pool_items SET status='open', reason='idle_recycle', last_owner_id=$2, claimable_from=now()
           WHERE case_id=$1`,
          [r.id, r.prev_owner],
        ).catch(() => undefined);
      });
      console.log(`[pool.idle_recycle] case=${r.id}`);
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
  setInterval(() => { recycleIdlePool(pg).catch((e) => console.error('[idle_recycle]', e)); }, 60000);
  // run once shortly after boot
  setTimeout(() => { recycleIdlePool(pg).catch((e) => console.error('[idle_recycle]', e)); }, 5000);
  await consumeLoop(redis);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Export enqueue helper for direct one-shot publish paths if needed
export { enqueueOutboxRow };
