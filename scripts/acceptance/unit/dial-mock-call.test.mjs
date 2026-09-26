import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function startCall({ mode, vendor, apiKey }) {
  if (mode !== 'real') {
    return { ok: true, mode: 'mock', recording_url: 'mock://recording/x', result: 'connected' };
  }
  if (!vendor || !apiKey) {
    return { ok: false, mode: 'real', error: 'REAL 外呼未配置', result: 'failed_closed' };
  }
  return { ok: false, mode: 'real', error: '适配器未接通', result: 'failed_closed' };
}

describe('dial mock/real', () => {
  it('mock succeeds with recording placeholder', () => {
    const r = startCall({ mode: 'mock' });
    assert.equal(r.ok, true);
    assert.match(r.recording_url, /^mock:\/\//);
  });
  it('real fails closed without keys', () => {
    const r = startCall({ mode: 'real' });
    assert.equal(r.ok, false);
    assert.equal(r.result, 'failed_closed');
  });
});
