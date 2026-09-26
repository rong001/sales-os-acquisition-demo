/**
 * Offline unit: pool claim race semantics (pure logic mirror of SQL lock intent).
 * Real concurrent claim covered by business-acceptance against live API.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function claimOnce(state, seatId) {
  if (state.sea_status !== 'public') return { ok: false, reason: 'not_public' };
  if (state.claiming) return { ok: false, reason: 'race' };
  state.claiming = true;
  state.sea_status = 'private';
  state.owner = seatId;
  state.claiming = false;
  return { ok: true, owner: seatId };
}

describe('pool claim race (logic)', () => {
  it('only first claim wins', () => {
    const state = { sea_status: 'public', owner: null, claiming: false };
    const a = claimOnce(state, 'seat-a');
    const b = claimOnce(state, 'seat-b');
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.equal(state.owner, 'seat-a');
  });
});
