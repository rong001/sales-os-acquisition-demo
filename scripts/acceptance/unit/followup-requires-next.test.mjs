import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function validateFollowUp(body) {
  const kind = body.kind || 'note';
  const followKinds = new Set(['note', 'followup', 'follow_up', 'call', 'wecom_followup']);
  if (followKinds.has(kind)) {
    if (body.next_follow_at === undefined || body.next_follow_at === null || body.next_follow_at === '') {
      return { ok: false, status: 400, message: '下次跟进时间必填（next_follow_at）' };
    }
  }
  return { ok: true };
}

describe('follow-up requires next_follow_at', () => {
  it('rejects missing next', () => {
    const r = validateFollowUp({ kind: 'followup', body: 'hi' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });
  it('accepts with next', () => {
    const r = validateFollowUp({ kind: 'followup', body: 'hi', next_follow_at: new Date().toISOString() });
    assert.equal(r.ok, true);
  });
});
