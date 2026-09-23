# SALES-FOLLOWUP-20260923-1112

Business acceptance harness + raw-JWT kill + enterprise login copy for 获客 / Sales OS.

## Windows already PASS (user-cited; NOT re-run on bot)

- followup1040 pack verified
- Start → Test → Stop → second Start **exit 0**
- Ports PG**55433** / Redis**56380** / API**39300** / worker / Web**19280**
- Sub2API **15432/16379** untouched
- Web `/api` proxy login: manager + two sales PASS; wrong password / unauthenticated → **401**
- Prior PS1 parse/argv/Host/pg_ctl hang fixes

## Bot verified (this delivery)

Host: Linux bot box — **not** user Windows PC. Stack used: gateway `http://127.0.0.1:18180` → API `:3100` (matching local `.env` / `.env.native` seed). Ports **39300/19280** on this host returned 401 for demo logins (different seed / foreign instance) — **not** used for bot PASS.

Harness: `node scripts/acceptance/business-acceptance.mjs --base http://127.0.0.1:18180`

| Alias | Result |
|---|---|
| health | PASS |
| login-manager / sales1 / sales2 | PASS |
| neg-anon-401 / neg-wrong-password-401 | PASS |
| import public_web_sample (Stripe/GitLab/Cloudflare/Notion) | PASS (≥3; HashiCorp official fetch soft SKIP HTTP 429) |
| normalize-dedupe | PASS |
| assign-manager | PASS |
| agent-isolation (+ workbench + overreach no-write) | PASS |
| due-reminder (wall-clock past `next_follow_at`, in-app only) | PASS |
| opportunity-win / lose + manager funnel/board | PASS |
| business-persistence | PASS (`relogin_same_process`; full Stop→Start cited to Windows infra PASS) |

Artifacts: `business-acceptance-results.json`, `bot-harness-console.txt` (desensitized).

## Raw JWT fixes

- New gate: `scripts/lib/e2e-raw-gate.sh` — default ephemeral `/tmp` RAW; durable docs `.raw-run` only if `SALES_OS_E2E_UNSAFE_RAW=1`
- Deprecated for trial packs: `e2e-internal-sales.sh`, `e2e-followup-reminders.sh`, `e2e-followup-live-poll.sh`, `e2e-confirm-appointment-rbac.sh`
- Trial path: `scripts/acceptance/business-acceptance.mjs` (JWT **in memory only**)

## UI copy changed

- `apps/web/src/views/LoginView.vue` — 企业 AI 定制销售 / AI客服·知识库·CRM·销售智能体
- `apps/web/src/views/WorkbenchView.vue` — removed 抢票/USGate landing buttons; tenant label
- `apps/web/src/views/FunnelView.vue` — product filter labels → 知识库·CRM / 销售智能体实施（演示渠道）
- `apps/web/index.html` title
- Rebuilt `apps/web/dist`

Landing `/p/ticket-grab` `/p/usgate` remain as optional demo channels (not login/workbench chrome).

## UI待测 (Codex / user Windows browser — NOT claimed PASS)

1. Open `http://127.0.0.1:19280/login` — copy shows **企业 AI 定制销售 OS** (not 抢票/USGate)
2. Type manager email + password from `.env.native` (no paste token / no localStorage inject)
3. Land on 作战台; confirm no 抢票/USGate topbar buttons; due-follow / funnel navigation
4. Login as agent@ and agent2@ — isolation visible in UI case list
5. Wrong password → error UI; logged-out `/` → redirect login
6. Optional: manager funnel filter labels read as enterprise demo channels

**API login ≠ browser login.** Bot did **not** automate typed browser login.

## Harness usage (Windows)

```powershell
cd sales-os-app
.\scripts\windows\native\Start-InternalTrial-Native.ps1
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Invoke-BusinessAcceptance.ps1
```

## Unpack

Tar over source; **keep** existing `.env.native` and `.data/`.

## Pack

See pack SHA in this folder after ship.
