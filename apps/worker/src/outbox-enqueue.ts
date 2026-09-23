/**
 * Outbox → Redis stream enqueue with failure recovery and idempotent publish.
 * Readiness OK does not imply enqueue success; pending rows are recovered by poll.
 */

export type OutboxRow = {
  id: string;
  tenant_id: string;
  event_type: string;
  payload: unknown;
};

export type EnqueueOutcome =
  | 'published'
  | 'enqueue_failed_pending'
  | 'idempotent_already_published'
  | 'idempotent_skip_inflight';

export type RedisEnqueueClient = {
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  del(key: string): Promise<number>;
  xadd(stream: string, id: string, ...args: string[]): Promise<string>;
};

export type OutboxStatusStore = {
  markPublished(id: string): Promise<'updated' | 'already'>;
  listPending(limit: number): Promise<OutboxRow[]>;
};

export const OUTBOX_STREAM = 'salesos:events';
export const OUTBOX_LOCK_PREFIX = 'salesos:outbox:enq:';

export function outboxLockKey(outboxId: string): string {
  return `${OUTBOX_LOCK_PREFIX}${outboxId}`;
}

/**
 * Attempt to publish one outbox row to the stream exactly once.
 * On Redis failure: leave DB status pending (caller must not mark published) and drop lock so recovery can retry.
 */
export async function enqueueOutboxRow(
  redis: RedisEnqueueClient,
  row: OutboxRow,
  opts?: { stream?: string; lockTtlSec?: number },
): Promise<{ outcome: EnqueueOutcome; error?: string }> {
  const stream = opts?.stream ?? OUTBOX_STREAM;
  const lockTtl = opts?.lockTtlSec ?? 86_400;
  const lockKey = outboxLockKey(row.id);

  let lock: string | null;
  try {
    lock = await redis.set(lockKey, '1', 'EX', lockTtl, 'NX');
  } catch (e) {
    return { outcome: 'enqueue_failed_pending', error: String((e as Error).message || e) };
  }

  if (lock === null) {
    // Another publisher holds/held the lock — treat as idempotent (already enqueued or in-flight).
    return { outcome: 'idempotent_skip_inflight' };
  }

  try {
    await redis.xadd(
      stream,
      '*',
      'outbox_id', row.id,
      'event_type', row.event_type,
      'tenant_id', row.tenant_id,
      'payload', JSON.stringify(row.payload ?? {}),
    );
    return { outcome: 'published' };
  } catch (e) {
    try { await redis.del(lockKey); } catch { /* allow retry */ }
    return { outcome: 'enqueue_failed_pending', error: String((e as Error).message || e) };
  }
}

/**
 * Recovery poll: publish pending rows. Idempotent — already-locked/published rows do not duplicate process side-effects
 * when combined with markPublished that only flips pending→published once.
 */
export async function recoverPendingOutbox(
  redis: RedisEnqueueClient,
  store: OutboxStatusStore,
  opts?: { limit?: number; stream?: string },
): Promise<{
  attempted: number;
  published: number;
  failed: number;
  idempotent: number;
  outcomes: Array<{ id: string; outcome: EnqueueOutcome }>;
}> {
  const pending = await store.listPending(opts?.limit ?? 20);
  const outcomes: Array<{ id: string; outcome: EnqueueOutcome }> = [];
  let published = 0;
  let failed = 0;
  let idempotent = 0;

  for (const row of pending) {
    const result = await enqueueOutboxRow(redis, row, { stream: opts?.stream });
    if (result.outcome === 'published') {
      const mark = await store.markPublished(row.id);
      if (mark === 'already') {
        idempotent += 1;
        outcomes.push({ id: row.id, outcome: 'idempotent_already_published' });
      } else {
        published += 1;
        outcomes.push({ id: row.id, outcome: 'published' });
      }
    } else if (result.outcome === 'enqueue_failed_pending') {
      failed += 1;
      outcomes.push({ id: row.id, outcome: 'enqueue_failed_pending' });
    } else {
      // inflight lock — try to mark published if a prior xadd succeeded but DB lagged
      const mark = await store.markPublished(row.id);
      if (mark === 'updated') {
        published += 1;
        outcomes.push({ id: row.id, outcome: 'published' });
      } else {
        idempotent += 1;
        outcomes.push({ id: row.id, outcome: result.outcome });
      }
    }
  }

  return {
    attempted: pending.length,
    published,
    failed,
    idempotent,
    outcomes,
  };
}

/**
 * In-memory doubles for synthetic unit tests (no real Redis / PG).
 */
export function createMemoryOutboxHarness() {
  const stream: Array<Record<string, string>> = [];
  const locks = new Map<string, string>();
  const rows = new Map<string, OutboxRow & { status: 'pending' | 'published' }>();

  const redis: RedisEnqueueClient = {
    async set(key, value, ...args) {
      const nx = args.includes('NX');
      if (nx && locks.has(key)) return null;
      locks.set(key, String(value));
      return 'OK';
    },
    async del(key) {
      return locks.delete(key) ? 1 : 0;
    },
    async xadd(_stream, _id, ...flat) {
      if ((redis as { failNext?: boolean }).failNext) {
        (redis as { failNext?: boolean }).failNext = false;
        throw new Error('synthetic_xadd_failure');
      }
      const fields: Record<string, string> = {};
      for (let i = 0; i < flat.length; i += 2) fields[flat[i]] = flat[i + 1];
      stream.push(fields);
      return `${Date.now()}-${stream.length}`;
    },
  };

  const store: OutboxStatusStore = {
    async markPublished(id) {
      const row = rows.get(id);
      if (!row) return 'already';
      if (row.status === 'published') return 'already';
      row.status = 'published';
      return 'updated';
    },
    async listPending(limit) {
      return [...rows.values()].filter((r) => r.status === 'pending').slice(0, limit);
    },
  };

  return {
    redis: redis as RedisEnqueueClient & { failNext?: boolean },
    store,
    stream,
    locks,
    rows,
    seedPending(row: OutboxRow) {
      rows.set(row.id, { ...row, status: 'pending' });
    },
    publishedIds() {
      return [...rows.values()].filter((r) => r.status === 'published').map((r) => r.id);
    },
    streamOutboxIds() {
      return stream.map((f) => f.outbox_id);
    },
  };
}
