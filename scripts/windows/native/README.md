# Windows-native internal trial (no Docker / no WSL)

For Windows 11 when **Docker Desktop is not available**. Uses **isolated**
Postgres + Redis on `127.0.0.1` only with dedicated ports (default **15432** /
**16379**) and data under repo `.data/native/` — **never** reuses Sub2API’s
default `5432` / `6379`.

## Quick start

```powershell
cd sales-os-app
.\scripts\windows\native\Start-InternalTrial-Native.ps1
# browser: http://127.0.0.1:19280
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Stop-InternalTrial-Native.ps1
```

`Start-InternalTrial-Native.ps1` generates `.env.native` with random secrets if
missing (file is gitignored). It **refuses** to print SUCCESS unless
`GET /api/health` through the web port returns JSON `ok` + `sales-os-api`.

## Dependencies the script expects

1. **Node.js 20+** on PATH (`node`, `npm`) — https://nodejs.org/ (LTS MSI)
2. **PostgreSQL 15/16/17 Windows binaries** either:
   - Already installed and available as `pg_ctl` / `initdb` / `psql` on PATH, **or**
   - Portable tree under `vendor/windows/pgsql/` (see `Fetch-NativeDeps.ps1`)
3. **Redis** Windows build either:
   - `redis-server` on PATH, **or**
   - `vendor/windows/redis/redis-server.exe` (tporadowski/redis, BSD-like)

`Fetch-NativeDeps.ps1` downloads official/known sources into `vendor/windows/`
and writes SHA256SUMS. Run once with user approval for outbound download.

## Isolation guarantees

| Item | Behavior |
|---|---|
| Ports | Defaults 15432 / 16379 / 39300 / 19280; fail if occupied |
| Bind | Postgres/Redis configured for `127.0.0.1` only |
| Data dirs | `.data/native/pg` and `.data/native/redis` under this repo |
| Foreign data | Refuses if data dir markers look like another product |
| Secrets | Only in local `.env.native` (not committed) |

## Relation to Docker path

If Docker Desktop **is** available, prefer `..\Start-InternalTrial.ps1` +
`docker-compose.internal-trial.yml` instead.
