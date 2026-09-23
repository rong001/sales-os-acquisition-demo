/**
 * Synthetic Redis enqueue failure → recovery → idempotent / exactly-once outcomes.
 * In-memory doubles only — does NOT use workbench 200 as substitute.
 */
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mod = require(path.resolve(__dirname, '../../../apps/api/dist/common/outbox-enqueue.js'));

const {
  enqueueOutboxRow,
  recoverPendingOutbox,
  createMemoryOutboxHarness,
} = mod;

test('enqueue failure leaves pending; recovery publishes once; second recovery idempotent', async () => {
  const h = createMemoryOutboxHarness();
  h.seedPending({
    id: 'ob-1',
    tenant_id: 't1',
    event_type: 'lead.captured',
    payload: { event_id: 'e1' },
  });

  h.redis.failNext = true;
  const fail = await enqueueOutboxRow(h.redis, h.rows.get('ob-1'));
  assert.equal(fail.outcome, 'enqueue_failed_pending');
  assert.equal(h.rows.get('ob-1').status, 'pending');
  assert.equal(h.streamOutboxIds().length, 0);

  const recovered = await recoverPendingOutbox(h.redis, h.store, { limit: 10 });
  assert.equal(recovered.published, 1);
  assert.equal(recovered.failed, 0);
  assert.deepEqual(h.streamOutboxIds(), ['ob-1']);
  assert.deepEqual(h.publishedIds(), ['ob-1']);

  // Second recovery: nothing pending → no duplicate stream entries
  const again = await recoverPendingOutbox(h.redis, h.store, { limit: 10 });
  assert.equal(again.attempted, 0);
  assert.equal(h.streamOutboxIds().length, 1);

  // Forced re-enqueue attempt is idempotent via lock
  h.rows.get('ob-1').status = 'pending'; // simulate lagging DB view
  const dup = await enqueueOutboxRow(h.redis, {
    id: 'ob-1',
    tenant_id: 't1',
    event_type: 'lead.captured',
    payload: { event_id: 'e1' },
  });
  assert.equal(dup.outcome, 'idempotent_skip_inflight');
  assert.equal(h.streamOutboxIds().length, 1);
});

test('two pending rows: fail one, recover both without duplicate', async () => {
  const h = createMemoryOutboxHarness();
  h.seedPending({ id: 'a', tenant_id: 't', event_type: 'x', payload: {} });
  h.seedPending({ id: 'b', tenant_id: 't', event_type: 'y', payload: {} });
  h.redis.failNext = true;
  const r1 = await recoverPendingOutbox(h.redis, h.store);
  // first row fails, second may publish depending on order
  assert.ok(r1.failed + r1.published === 2 || r1.attempted === 2);
  const r2 = await recoverPendingOutbox(h.redis, h.store);
  const ids = h.streamOutboxIds();
  assert.equal(new Set(ids).size, ids.length, 'no duplicate outbox_ids in stream');
  assert.equal(h.publishedIds().sort().join(','), 'a,b');
  assert.equal(r2.failed, 0);
});
