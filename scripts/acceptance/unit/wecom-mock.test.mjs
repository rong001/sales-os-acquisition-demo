import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function wecomStatus({ mode, corpId, secret }) {
  const configured = !!(corpId && secret);
  if (mode === 'real' && !configured) {
    return { mode: 'real', configured: false, error: 'REAL 模式缺少企微密钥' };
  }
  return {
    mode: mode || 'mock',
    configured,
    honest_label: mode === 'mock' || !configured
      ? 'MOCK 演示模式（无企微官方密钥；不调用企微 API）'
      : 'REAL',
  };
}

describe('wecom mock', () => {
  it('defaults to mock honest label', () => {
    const s = wecomStatus({ mode: 'mock' });
    assert.match(s.honest_label, /MOCK/);
  });
  it('real without keys fails closed', () => {
    const s = wecomStatus({ mode: 'real' });
    assert.equal(s.configured, false);
    assert.match(s.error, /缺少企微密钥/);
  });
});
