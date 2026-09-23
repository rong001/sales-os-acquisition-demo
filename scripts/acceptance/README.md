# Business acceptance harness

**Only recommended trial-pack runner** for 获客 / Sales OS business loop.

Legacy `scripts/e2e-*.sh` are **deprecated for trial packs**. Their raw gate refuses JWT/body disk writes by default (including `/tmp`). Do not claim memory-only if those scripts write tokens.

## Run (Windows native, after Start)

```powershell
cd sales-os-app
.\scripts\windows\native\Start-InternalTrial-Native.ps1
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Invoke-BusinessAcceptance.ps1
# or:
node .\scripts\acceptance\business-acceptance.mjs
```

Credentials: **only** repo-root `.env.native`. Secrets never echoed. JWT stays in memory.

Default base URL: `http://127.0.0.1:${NATIVE_WEB_PORT}` (exercises `/api` proxy).

## Layers (followup1217)

| Layer | Meaning |
|---|---|
| `api_subsuite` | Auth, pipeline, isolation, due wall-clock, health contract, SSRF reject, dedupe |
| `real_source_gate` | Only `fetch_verified` counts; require ≥3 or FAIL / honest SKIP (`SKIP_FETCH`) |
| `ui` | Typed browser UI — harness always SKIP; **cannot** make `product_green` |

`OVERALL=PASS` (harness exit 0) ≠ `product_green`. UI SKIP ⇒ `product_green=NO`.

## Real vs synthetic + verification statuses

- **Statuses**: `source_provided` | `fetch_verified` | `fetch_failed` | `pending_verification`
- Only **`fetch_verified`** sets `real_public_source=true` and counts toward the ≥3 gate
- Failed fetch / 429 / empty facts → `fetch_failed`; facts stored as `UNKNOWN` (never error-page HTML)
- `SALES_OS_ACCEPTANCE_SKIP_FETCH=1` → all `source_provided`; gate is honest SKIP (not all-real PASS)
- **Synthetic fixtures**: `source_type=synthetic_fixture` only — assign / isolation / win-lose. Demo WON ≠ 客户成交
- Re-import same normalized URL+product → **same LeadCase** (`case_merged`); source history appended

## Health contract

- `GET /health/live` — liveness (process up)
- `GET /health` and `GET /health/ready` — **readiness** (503 when required PG/Redis down)
- Web `/api/health` → readiness. Start/Test gates should treat non-ok as not ready.

## Fault honesty

Wrong-port TCP probe is **not** a dependency fault test. Controlled PG/Redis stop only with isolated project ports + `SALES_OS_ACCEPTANCE_ALLOW_DEP_STOP=1`; otherwise SKIP and cite user Windows PASS. **Never** touch Sub2API `15432/16379`.

## Env

- `SALES_OS_ACCEPTANCE_BASE`
- `SALES_OS_ACCEPTANCE_RESTART_CMD` — if **unset**, `persist-restart-cmd` is **SKIP** (not PASS)
- `SALES_OS_ACCEPTANCE_SKIP_FETCH=1`
- `SALES_OS_ACCEPTANCE_DUE_WAIT_MS` — default `2500`; `0` → SKIP wall-clock due crossing
- `SALES_OS_ACCEPTANCE_ALLOW_DEP_STOP=1` — opt-in controlled dep stop (still refused on shared bot)

## UI

This harness is **API via Web `/api` proxy**. **本侧 UI 未测** — typed browser login must be done by Codex/user on Windows.
