# CHANGELOG — SALES-FOLLOWUP-20260923-1331 vs followup1217

Precise diffs vs pack tip `938b6a4` / followup1217 (4896460 / SHA256 `8bd71d11…`).

## Bug 1 — ERROR_TITLE_RE false positive

**Before:** `ERROR_TITLE_RE` contained bare `cloudflare|akamai`, so HTTP 200 titles like `Cloudflare, Inc.` / `Built on Cloudflare` were classified `fetch_failed` / `http_200_or_error_page`.

**After (`apps/api/src/common/public-fetch.ts`):**
- Removed bare `cloudflare` / `akamai` from title regex.
- Title errors limited to challenge/block phrasing (`Just a moment`, `Attention Required`, Access Denied, rate-limit, HTTP code titles, Akamai reference/block titles).
- Body challenge markers via `CHALLENGE_BODY_RE` (`cf-browser-verification`, `challenge-platform`, `cdn-cgi/challenge`, Akamai reference/edgesuite, etc.).
- Offline unit: legitimate titles NOT error; challenge HTML IS error.
- Live harness: `Cloudflare, Inc.` → `fetch_verified` (`import-title-honesty-cloudflare`).

## Bug 2 — IP / DNS pin gaps

**Before:** `::ffff:7f00:1` and `fe90::1` returned NON-prohibited; fetch re-resolved without pinning → DNS rebinding window.

**After:**
- Full IPv6 expand + IPv4-mapped hex (`::ffff:7f00:1` → 127.0.0.1) and dotted forms.
- Link-local `fe80::/10` (fe80–febf), ULA `fc00::/7`, multicast, unspecified, loopback.
- After validate: **PIN** verified IP via custom `lookup` on http(s).Agent; Host + TLS `servername` stay on original hostname.
- Every redirect hop: re-resolve, re-validate, re-pin.
- Offline mocks: DNS rebind (public→169.254.169.254) blocked; pin IP visible to transport; **no** real HTTP to metadata/intranet.

## Bug 3 — source_history / sticky verified

**Before:** `verification_status` / `real_public_source` stayed sticky `fetch_verified` even when latest source was `failed`/`source_provided`; history hard-sliced to last 20.

**After (`leads.service.ts` + UI):**
- **Current:** `verification_status`, `real_public_source`, `current_facts_trustworthy`, `public_facts_excerpt` follow latest fetch (failed ⇒ facts `UNKNOWN`).
- **Historical:** `historically_verified` / `ever_fetch_verified`, `last_verified_facts_excerpt`, `last_verified_at`.
- `verification_explanation` e.g. `previously verified, latest fetch failed — do not treat failed page as current facts`.
- `retainSourceHistory(…, 20)` keeps latest + last-verified + status transitions under cap.
- Case detail + workbench import message surface current vs historical.

## Bug 4 — Redis enqueue failure / recovery

**Before:** readiness could be OK while `xadd` failed; pending left without proven recovery/idempotency tests (workbench 200 was not a substitute).

**After:**
- New `outbox-enqueue.ts` (API + worker): lock + xadd; failure drops lock and leaves `pending`; `recoverPendingOutbox` republishes; lock makes re-enqueue idempotent.
- Synthetic in-memory tests: fail → recover → single stream entry; second recovery no duplicate.
- Runner alias `redis-enqueue-recovery-synthetic` (api_subsuite).

## Runner / reporting

- Still: UI SKIP ⇒ `product_green=NO`; API PASS ≠ product green.
- New aliases: `import-title-honesty-cloudflare`, `verification-current-vs-historical`, `redis-enqueue-recovery-synthetic`, `ssrf-unit-title-ip-dns-pin`.
- Dedupe concurrency assertions retained (already PASS).

## Intentionally NOT redone

- 6 concurrent same new synthetic URL all 201 → 1 case
- User PG55433 / Redis56380 controlled-stop evidence (bot SKIP)
- Sub2API 15432/16379 untouched
