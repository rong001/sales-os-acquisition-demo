# Repro steps — bugs fixed in 1331

## Bug 1 title false positive
1. Offline: `node --test scripts/acceptance/unit/public-fetch-ssrf.test.mjs` — titles `Cloudflare, Inc.` / `Built on Cloudflare` must NOT be error pages; challenge HTML must.
2. Live: import Cloudflare sample with `fetch_official:true` → expect `fetch_verified` (unless real challenge/network failure with non-title reason).

## Bug 2 IP / DNS pin
1. Unit asserts `isNonPublicIp('::ffff:7f00:1')` and `fe90::1` === true.
2. Mock lookup public then `169.254.169.254` on redirect → `blocked_resolved_ip` (no real metadata HTTP).

## Bug 3 sticky verified
1. Import with live verify → `fetch_verified`.
2. Reimport same URL with `fetch_official:false` → current `source_provided`, `real_public_source=false`, `historically_verified=true`, explanation mentions previously verified.

## Bug 4 Redis enqueue
1. `node --test scripts/acceptance/unit/outbox-enqueue-recovery.test.mjs`
2. Expect fail → recover → one stream id; second recovery idempotent.
