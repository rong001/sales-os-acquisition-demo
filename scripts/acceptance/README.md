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

## Real vs synthetic

- **Real public-source**: `POST /api/leads/import/authorized-public-list` with samples from `public-company-samples.json`. Fields contact/demand/consent → `UNKNOWN` when unknown. Provenance: official URL, fetch time, public facts excerpt, ICP match reason.
- **Synthetic fixtures**: `source_type=synthetic_fixture` only — used for assign / isolation / win-lose. Demo WON ≠ 客户成交.

## Env

- `SALES_OS_ACCEPTANCE_BASE`
- `SALES_OS_ACCEPTANCE_RESTART_CMD` — if **unset**, `persist-restart-cmd` is **SKIP** (not PASS)
- `SALES_OS_ACCEPTANCE_SKIP_FETCH=1`
- `SALES_OS_ACCEPTANCE_DUE_WAIT_MS` — default `2500`; `0` → SKIP wall-clock due crossing

## OVERALL rule

`OVERALL=PASS` only if `fail_count=0` **and** no required-tier SKIP. Optional / `ui_pending` SKIP are listed clearly and do not alone fail the suite.

Due reminder honesty: **list polling / workbench query only** — do not claim worker timed push.

## UI

This harness is **API via Web `/api` proxy**. **本侧 UI 未测** — typed browser login must be done by Codex/user on Windows.
