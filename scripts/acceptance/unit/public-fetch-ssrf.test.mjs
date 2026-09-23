/**
 * Offline unit tests: ERROR_TITLE_RE honesty, IP/DNS pin gaps, DNS rebinding mock.
 * No real HTTP to 169.254.169.254 / intranet.
 */
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pf = require(path.resolve(__dirname, '../../../apps/api/dist/common/public-fetch.js'));

const {
  isNonPublicIp,
  ipv4MappedFromIpv6,
  looksLikeErrorPage,
  titleLooksLikeCdnChallenge,
  fetchPublicSource,
  retainSourceHistory,
  buildVerificationExplanation,
} = pf;

test('IPv4-mapped hex ::ffff:7f00:1 is loopback / non-public', () => {
  assert.equal(ipv4MappedFromIpv6('::ffff:7f00:1'), '127.0.0.1');
  assert.equal(isNonPublicIp('::ffff:7f00:1'), true);
  assert.equal(isNonPublicIp('::ffff:a00:1'), true); // 10.0.0.1
  assert.equal(isNonPublicIp('::ffff:c0a8:1'), true); // 192.168.0.1
  assert.equal(isNonPublicIp('::ffff:127.0.0.1'), true);
});

test('fe80::/10 full link-local including fe90::1', () => {
  assert.equal(isNonPublicIp('fe80::1'), true);
  assert.equal(isNonPublicIp('fe90::1'), true);
  assert.equal(isNonPublicIp('fe8a::1'), true);
  assert.equal(isNonPublicIp('febf:ffff::1'), true);
  assert.equal(isNonPublicIp('fe7f::1'), false); // just below /10
});

test('ULA / multicast / unspecified still blocked', () => {
  assert.equal(isNonPublicIp('fc00::1'), true);
  assert.equal(isNonPublicIp('fd12::1'), true);
  assert.equal(isNonPublicIp('ff02::1'), true);
  assert.equal(isNonPublicIp('::'), true);
  assert.equal(isNonPublicIp('::1'), true);
});

test('public v4/v6 allowed', () => {
  assert.equal(isNonPublicIp('8.8.8.8'), false);
  assert.equal(isNonPublicIp('2001:4860:4860::8888'), false);
});

test('legitimate Cloudflare / Akamai titles are NOT error pages', () => {
  assert.equal(titleLooksLikeCdnChallenge('Cloudflare, Inc.'), false);
  assert.equal(titleLooksLikeCdnChallenge('Built on Cloudflare'), false);
  assert.equal(titleLooksLikeCdnChallenge('Akamai Technologies'), false);
  assert.equal(looksLikeErrorPage(200, 'Cloudflare, Inc.', '<html><title>Cloudflare, Inc.</title><p>Enterprise network</p></html>'), false);
  assert.equal(looksLikeErrorPage(200, 'Built on Cloudflare', '<html><title>Built on Cloudflare</title></html>'), false);
});

test('actual challenge / Attention Required titles ARE error pages', () => {
  assert.equal(titleLooksLikeCdnChallenge('Just a moment...'), true);
  assert.equal(titleLooksLikeCdnChallenge('Attention Required! | Cloudflare'), true);
  assert.equal(
    looksLikeErrorPage(
      200,
      'Just a moment...',
      '<div id="cf-browser-verification" class="challenge-platform">cdn-cgi/challenge</div>',
    ),
    true,
  );
  assert.equal(
    looksLikeErrorPage(
      200,
      'Access Denied',
      'Access Denied Akamai Reference #18.0a0a0a0a.123',
    ),
    true,
  );
});

test('DNS rebinding: public then private on later hop is blocked (mock)', async () => {
  let lookups = 0;
  const lookup = async () => {
    lookups += 1;
    if (lookups === 1) return [{ address: '93.184.216.34', family: 4 }]; // example.com public
    return [{ address: '169.254.169.254', family: 4 }]; // metadata — must block
  };
  const pinnedRequest = async (url) => {
    // First hop redirects; second hop would be rebinding target
    if (lookups === 1) {
      return {
        status: 302,
        headers: { get: (n) => (n.toLowerCase() === 'location' ? 'https://rebind.example/meta' : null) },
        bodyText: async () => '',
      };
    }
    throw new Error('should_not_fetch_private');
  };
  const res = await fetchPublicSource('https://example.com/', { maxRedirects: 3 }, { lookup, pinnedRequest });
  assert.equal(res.verification_status, 'fetch_failed');
  assert.match(String(res.blocked_reason || res.error), /blocked_resolved_ip:169\.254\.169\.254/);
  assert.equal(res.facts_excerpt, null);
});

test('DNS pin used for dial: mock sees pinned IP not re-lookup hostname', async () => {
  const seen = [];
  const lookup = async () => [{ address: '203.0.113.10', family: 4 }]; // TEST-NET? 203.0.113 is TEST-NET-3 — blocked!
  // Use a public documentation-ish but our rules block 203.0.113 — use 8.8.8.8 for mock
  const lookupPublic = async () => [{ address: '8.8.8.8', family: 4 }];
  const pinnedRequest = async (url, pinnedIp) => {
    seen.push({ host: url.hostname, pinnedIp });
    return {
      status: 200,
      headers: { get: () => null },
      bodyText: async () => '<html><title>Acme Corp</title><meta name="description" content="Widgets"></html>',
    };
  };
  const res = await fetchPublicSource('https://acme.example/', {}, { lookup: lookupPublic, pinnedRequest });
  assert.equal(res.verification_status, 'fetch_verified');
  assert.equal(seen[0].pinnedIp, '8.8.8.8');
  assert.equal(seen[0].host, 'acme.example');
  assert.equal(res.title, 'Acme Corp');
});

test('retainSourceHistory keeps latest + last verified + transitions under cap', () => {
  const hist = [];
  for (let i = 0; i < 30; i++) {
    hist.push({
      source_id: `s${i}`,
      batch_id: `b${i}`,
      fetch_time: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      verification_status: i === 5 ? 'fetch_verified' : (i === 29 ? 'fetch_failed' : 'source_provided'),
    });
  }
  const kept = retainSourceHistory(hist, 20);
  assert.ok(kept.length <= 20);
  assert.equal(kept[kept.length - 1].verification_status, 'fetch_failed');
  assert.ok(kept.some((h) => h.verification_status === 'fetch_verified' && h.source_id === 's5'));
});

test('verification explanation distinguishes historical vs current', () => {
  const msg = buildVerificationExplanation({ current: 'fetch_failed', historicallyVerified: true });
  assert.match(msg, /previously verified, latest fetch failed/i);
});
