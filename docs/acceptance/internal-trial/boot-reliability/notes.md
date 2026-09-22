# Boot reliability — internal trial start gate

## Scope

Harden Windows start/self-check scripts so they **do not claim available** until
`GET http://127.0.0.1:HOST_WEB_PORT/api/health` returns HTTP 2xx **and** JSON
`ok: true` with `service: sales-os-api`. SPA static 200 alone is insufficient.

**No business feature changes.** No hairpin overlay in the user pack. No opening
DB/Redis host ports. No firewall changes. No new public tunnel.

## Delivered

| Item | Notes |
|---|---|
| `scripts/windows/Start-InternalTrial.ps1` | Parse `.env`; required keys non-empty / not `CHANGE_ME` (fail lists **key names only**); compose up; poll `/api/health` ≤120s; OK+URL or FAIL+redacted class |
| `scripts/windows/Test-InternalTrial.ps1` | Read-only same health gate; no compose config / raw `.env` dump |
| `scripts/check-internal-trial.sh` | Linux/macOS mirror of the gate |
| `START_WINDOWS.md` | Documents gate + Test script |

Failure classes: `docker-not-running` / `compose-up` / `api-or-db-not-ready` / `web-proxy-broken`.

## Isolated bot verify (shipped compose only)

| | |
|---|---|
| Compose | `docker-compose.internal-trial.yml` **only** (no hairpin) |
| Project | `salesos_trial_bootcheck` |
| Ports | `127.0.0.1:19280` (web), `127.0.0.1:39200` (api) |
| Env | Synthetic `/tmp/salesos_trial_bootcheck.env` — **not committed** |

| Gate | Result |
|---|---|
| web `/api/health` JSON ok + sales-os-api | **FAIL** |
| web static `/` HTTP 200 | PASS (explicitly **not** treated as ready) |
| direct `HOST_API_PORT/health` | **FAIL** |
| Chromium UI login on `/login` (type credentials; no localStorage inject) | **FAIL** |
| Windows host Docker Desktop | **PENDING** |

### Why FAIL on this bot

Postgres/Redis container healthchecks are healthy, but **api → postgres:5432 / redis:6379 TCP times out** on the Compose bridge (same class of bot networking issue noted under `windows-compose-boot`). API never binds Nest `/health`; nginx `/api` proxy therefore cannot return API JSON. **Stop at acceptance — do not hairpin to force PASS.**

Windows Docker Desktop users still use the shipped compose (DB/Redis unpublished). Expect PASS there when Desktop networking is normal.

## Stop-at-acceptance

This suite **stops at acceptance evidence**. No workaround overlay, no port publish of DB/Redis, no tunnel, no claim that the bot stack is user-ready.
