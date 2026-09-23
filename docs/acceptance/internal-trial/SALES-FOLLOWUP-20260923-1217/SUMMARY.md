# SALES-FOLLOWUP-20260923-1217

获客 / Sales OS — import verification honesty, idempotent company dedupe, SSRF public-only fetch, liveness vs readiness, layered runner reporting.

## User-already-PASS (DO NOT REDO / NOT re-run on bot)

- Pack 4876745 / SHA256 `41d6d3ae…` verified; 9 diffs overlaid keeping `.env.native`/`.data` + 1040 start scripts; API+Web build+start exit0
- New runner: future 2500ms wall-clock crossing, completed no-dupe, dual-sales isolation, synthetic WON-LOST etc. PASS
- User-run dependency faults on **own** stack only:
  - Stop PG 55433 → `/api/health` still 200/ok (pre-fix), workbench 500; restore → business 200
  - Redis 56380 `SHUTDOWN SAVE` → health + workbench still 200; restore → business 200
  - Sub2API 15432/16379 PIDs unchanged; all project services restored
- Typed browser UI still 待测 — runner optional UI/fault SKIP may only claim **API subsuite PASS**, never whole-product green

## Root changes (A–E)

### A) Real import verification honesty
- Statuses: `source_provided` | `fetch_verified` | `fetch_failed` | `pending_verification`
- Failed fetch / 429 / empty facts → `fetch_failed`; facts=`UNKNOWN` (never error-page HTML)
- Only `fetch_verified` sets `real_public_source=true` and counts toward ≥3 gate
- Runner FAIL or honest SKIP if `<3` verified (not PASS all-real); `SKIP_FETCH` → gate SKIP

### B) Idempotent company dedupe
- Normalize URL + product scope merge key; pessimistic lock transaction
- Re-import → same `LeadCase` (`case_merged`); append `source_history`
- Parallel re-import concurrency → single case (harness PASS)

### C) SSRF / public-only fetch
- `apps/api/src/common/public-fetch.ts`: reject private/loopback/link-local/metadata; validate every redirect hop; body+timeout limits
- Manager auth ≠ intranet/metadata permission; no outbound email/phone/DM
- See `SSRF.md`

### D) Liveness vs readiness + dependency honesty
- `GET /health/live` = liveness; `GET /health` + `/health/ready` = readiness (503 if required PG/Redis down)
- Web `/api/health` → readiness (Start/Test gates now honest)
- Business APIs: recoverable `503 DEPENDENCY_UNAVAILABLE`
- Controlled dep stop: SKIP on bot (cite user Windows PASS); wrong-port ≠ dependency fault test; never Sub2API
- See `health-contract.md`

### E) Runner reporting
- Layers: `api_subsuite` / `real_source_gate` / `ui`
- `OVERALL` harness PASS ≠ `product_green` (UI SKIP ⇒ `product_green=NO`)

## Bot verified (this delivery)

| Alias / layer | Result |
|---|---|
| health-liveness + health-readiness | PASS |
| import submitted + verification status split | PASS |
| real-source-gate ≥3 fetch_verified | PASS (3 verified / 2 failed; failed facts clean) |
| company dedupe reimport + parallel + history | PASS |
| ssrf-reject-loopback | PASS |
| due wall-clock / no-dupe / dual-sales / WON-LOST | PASS |
| persist-restart-cmd | SKIP |
| fault-dependency-controlled-stop | SKIP (cite user PASS) |
| ui-typed-browser-login | SKIP / 本侧 UI 未测 |
| **api_subsuite** | **PASS** |
| **real_source_gate** | **PASS** |
| **ui** | **SKIP** |
| **product_green** | **NO** (UI未测) |
| harness OVERALL | PASS (fail=0 skip=3) |

Artifacts: `business-acceptance-results.json`, `bot-harness-console.txt`, `results.json`.

## Codex steps (Windows)

1. Unpack `sales-os-internal-trial-local-20260923-followup1217.tar.gz` over existing tree; **keep** `.env.native` / `.data`.
2. Overlay includes `apps/api` source — rebuild:
   - `npm run build -w @sales-os/api`
   - `npm run build -w @sales-os/web` (if web changed; this pack API-focused)
3. `.\scripts\windows\native\Start-InternalTrial-Native.ps1` — gates on readiness `/api/health`
4. `.\scripts\windows\native\Test-InternalTrial-Native.ps1`
5. `.\scripts\windows\native\Invoke-BusinessAcceptance.ps1`
6. Optional: Stop project PG → expect `/api/health` **503/not ready**, workbench recoverable 503; restore → ready. Never touch Sub2API.
7. Typed browser UI checklist in `UI-PENDING.md`

## Commits

- `fd1cd5c` — feat(api): fetch verification, idempotent import, SSRF, readiness health
- `2ab6494` — feat(acceptance): real_source_gate layer, dedupe concurrency, honest faults
- `020fded` — docs: SALES-FOLLOWUP-20260923-1217 bot harness evidence + UI待测
- `938b6a4` — chore: ship followup1217 pack + SHA256
- `1cd37af` / `05b17e0` / later — docs pin tip SHA notes

## Pack

- `sales-os-internal-trial-local-20260923-followup1217.tar.gz`
- bytes: 4896460
- SHA256: `8bd71d117505f617883ea7d68cbb450b34f1b0f81b8a6175275e4ac2cc2f65a6`
- Also at `/workspace/` and `releases/`; symlink `sales-os-internal-trial-local.tar.gz` → followup1217

## Tip
`938b6a4` (pack ship; docs pins follow)
