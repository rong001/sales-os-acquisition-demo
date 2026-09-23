# Business acceptance harness

Trial-pack path for **获客 / Sales OS** business loop (import → dedupe → assign → isolation → due reminder → win/lose → funnel → persistence).

## Why this exists

Legacy `scripts/e2e-*.sh` historically wrote raw JWT/API bodies under `docs/**/.raw-run`. Those scripts are **deprecated for trial packs** and default to ephemeral raw only (`SALES_OS_E2E_UNSAFE_RAW=1` to opt into durable dumps — not for delivery).

## Run (Windows native, after Start)

```powershell
cd sales-os-app
.\scripts\windows\native\Start-InternalTrial-Native.ps1
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Invoke-BusinessAcceptance.ps1
# or:
node .\scripts\acceptance\business-acceptance.mjs
```

Credentials: **only** repo-root `.env.native`. Secrets are never echoed. JWT stays in memory.

Default base URL: `http://127.0.0.1:${NATIVE_WEB_PORT}` (exercises `/api` proxy).

Optional:

- `SALES_OS_ACCEPTANCE_BASE=http://127.0.0.1:19280`
- `SALES_OS_ACCEPTANCE_RESTART_CMD=...` — shell to Stop→Start for stronger persistence proof
- `SALES_OS_ACCEPTANCE_SKIP_FETCH=1` — skip live public site fetch (provenance still recorded)

## Coverage aliases

`PASS|FAIL` lines for: health, logins, import samples, normalize-dedupe, assign-manager, agent-isolation, due-reminder, opportunity-win/lose, manager-funnel, neg-anon/wrong-password/overreach, business-persistence.

## Honesty

- Public samples use `source_type=public_web_sample` with official URL + fetch time + ICP match reason.
- Synthetic negatives (if needed for isolation) are **clearly labeled** and separate from public acquisition.
- Due reminder uses wall-clock `next_follow_at` crossing; **in-app only** (no outbound email/SMS/phone).
- This harness is **API via Web `/api` proxy** — **not** a substitute for typed browser UI login PASS.
