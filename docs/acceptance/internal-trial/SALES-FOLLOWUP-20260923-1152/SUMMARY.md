# SALES-FOLLOWUP-20260923-1152

获客 / Sales OS — real enterprise lead acquisition honesty, due-reminder wall-clock, SKIP layering, memory-only trial path, isolated fault recovery.

## User-already-PASS (DO NOT REDO / NOT re-run on bot)

- followup1112 pack `c3466e97…` / 4858982 bytes verified
- business Node runner exit0; +12 readonly RBAC PASS
- Full Stop→Start: 3 synthetic records WON/LOST/NEW ownership, reminders, activity counts preserved
- Sub2API unchanged
- Start/Test/Stop/ports/API login from earlier followups
- Runtime mix of 1016 API/worker + 1040 native + 1112 runner + 4 web files; prior UI copy visible
- Typed browser password UI login still pending on their PC — API ≠ UI; list UI未测; no token injection

## Root changes (items 1–5)

### 1) Real enterprise lead vs synthetic fixtures
- New `POST /api/leads/import/authorized-public-list` (manager+): provenance (official URL, fetch time, public facts excerpt, ICP reason); contact/demand/consent → **UNKNOWN** when unknown; never invents demo.local person or `consent=true`.
- Samples: `scripts/acceptance/public-company-samples.json` (5 revisit-able public companies).
- Synthetic pipeline uses explicit `source_type=synthetic_fixture` only; demo WON flags `demo_not_customer_deal=true` (≠ 客户成交).
- Product codes primary: `ai-cs` / `kb-crm` / `sales-agent` (legacy ticket-grab/usgate remain optional landing channels).
- UI: Workbench authorized-import form + Funnel filters + synthetic button label.

### 2) Due reminders honesty
- Harness sets **future** `next_follow_at`, waits wall-clock past, then asserts due list hit.
- After `follow-up/handle`: **no duplicate** due.
- Dual sales isolation on due list.
- Documented mechanism: **list polling / workbench query only** — **not** worker timed push.

### 3) Runner SKIP layering
- `persist-restart-cmd` without `SALES_OS_ACCEPTANCE_RESTART_CMD` → **SKIP** (not PASS).
- Intake auth failure for import → 401/403 assert; **no** anonymous fallback.
- Workbench isolation asserts **HTTP 200 + structure** (`cases[]`, `stats`).
- `OVERALL=PASS` only if `fail_count=0` and no required-tier SKIP; SKIP list printed.

### 4) Memory-only sensitive data
- Trial path remains `business-acceptance.mjs` (JWT in memory).
- `e2e-raw-gate.sh` now **refuses all disk raw** (including `/tmp`) unless `SALES_OS_E2E_UNSAFE_RAW=1`.
- Deprecated `e2e-*.sh` exit 2 directing to business-acceptance when unsafe raw unset.

### 5) Isolated fault + recovery
- Wrong API port → `connection_error` classification; re-check healthy `/health`.
- Native redis/pg ports probed; on this bot they are closed → honest SKIP; wrong redis port probed.
- **Never** operated Sub2API `15432/16379`; did **not** stop shared redis/pg on bot.

## Bot verified (this delivery)

| Alias | Result |
|---|---|
| health / logins / neg-auth | PASS |
| import-authorized-public (≥3) + provenance UNKNOWN + enterprise products | PASS |
| synthetic fixtures + real-vs-synthetic separation | PASS |
| assign / isolation (HTTP+structure) / overreach | PASS |
| due wall-clock + no-dup after handle + dual sales | PASS |
| opportunity win/lose synthetic (not 成交) | PASS |
| persist-restart-cmd | **SKIP** (env unset; Windows Full Stop→Start already PASS) |
| business-persistence-relogin | PASS |
| fault-api-wrong-port + recovery health | PASS |
| fault-native-redis-pg-ports | **SKIP** (native ports not listening on bot) |
| ui-typed-browser-login | **SKIP / 本侧 UI 未测** |

Artifacts: `business-acceptance-results.json`, `bot-harness-console.txt`.

## SKIP / OVERALL

- `OVERALL=PASS` iff no FAIL and no required-tier SKIP.
- Optional/ui_pending SKIP allowed and listed (`SKIP_LIST …`).
- This run: fail=0, skip=3 (`persist-restart-cmd`, `fault-native-redis-pg-ports`, `ui-typed-browser-login`).

## 本侧 UI 未测

See `UI-PENDING.md`. API login ≠ typed browser UI.

## Codex steps (Windows)

1. Unpack `sales-os-internal-trial-local-20260923-followup1152.tar.gz` over existing tree; **keep** `.env.native` / `.data`.
2. Overlay includes `apps/api` + `apps/web` source — rebuild if using native compiled path:
   - `npm run build -w @sales-os/api`
   - `npm run build -w @sales-os/web`
3. `.\scripts\windows\native\Start-InternalTrial-Native.ps1`
4. `.\scripts\windows\native\Test-InternalTrial-Native.ps1`
5. `.\scripts\windows\native\Invoke-BusinessAcceptance.ps1` (or `node scripts/acceptance/business-acceptance.mjs`)
6. Typed browser UI checklist in `UI-PENDING.md` (password from `.env.native`; no token injection).

## Commits

- `852b348` — feat(api): enterprise products + authorized public-list import
- `9ddd412` — feat(web): authorized public import UI + enterprise product filters
- `1cf664d` — feat(acceptance): real vs synthetic harness with SKIP layering
- `af472c9` — fix: refuse e2e disk JWT by default; point trial to business-acceptance
- `be3903f` — docs: SALES-FOLLOWUP-20260923-1152 bot harness evidence + UI待测
- `eaf5194` — chore: ship followup1152 pack + SHA256


## Pack

- `sales-os-internal-trial-local-20260923-followup1152.tar.gz`
- bytes: 4876745
- SHA256: `41d6d3aeed0d68db06cacf9533c0673005ba6005ace50cd9a022c040b21cb8b3`
- Also at `/workspace/` and `releases/`; symlink `sales-os-internal-trial-local.tar.gz` → followup1152


## Tip
`eaf5194`
