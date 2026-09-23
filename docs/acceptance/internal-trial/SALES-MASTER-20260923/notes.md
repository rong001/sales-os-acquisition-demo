# SALES-MASTER-20260923 — acceptance notes

Pack: `SALES-MASTER-20260923`  
Evidence tree tip at write time may differ from final push SHA (see `results.json`).

## Root cause of prior api↔postgres/redis TCP timeout

On this Linux bot (Docker Engine **inside a containerized VM**, storage driver `vfs`):

1. Compose **user-defined bridge** assigns IPs and container names correctly.
2. Docker embedded DNS `127.0.0.11:53` **times out** from containers.
3. Even with raw container IPs, **inter-container TCP times out** (ICC broken).
4. Host → `127.0.0.1:<published>` works; container `network_mode: host` → loopback published ports works.
5. `host.docker.internal` → `127.0.0.1`-bound publishes is **connection refused** (bind is loopback-only, by design).

**Classification:** bot nested-Docker **bridge ICC / DNS failure**, not Compose YAML syntax, not Nest listen bind (API already listens `0.0.0.0`), not nginx upstream naming for Desktop.

**Firewall:** did **not** globally disable or rewrite host firewall (Auto-review blocks iptables changes; also out of scope).

## Fix strategy

| Path | Audience | Status on this bot |
|---|---|---|
| `docker-compose.internal-trial.yml` (bridge, DB/Redis unpublished) | Windows Docker Desktop / normal Docker | Unchanged intent; added explicit `trial` network, redis `bind 0.0.0.0` *inside container*, API healthcheck. Bridge ICC still FAIL on this bot. |
| `docker-compose.internal-trial.linux-hostnet.yml` overlay | Linux with broken ICC | **GREEN** here: PG/Redis published `127.0.0.1` only + api/worker/web `network_mode: host`. |
| `scripts/windows/native/*` | Windows 11 **without** Docker/WSL | **Shipped** (scripts). Cannot execute Windows binaries on this Linux bot. |

## Verify project (this run)

- Compose project: `salesos_master_20260923`
- Ports: web `127.0.0.1:19280`, api `127.0.0.1:39300`, pg `127.0.0.1:15432`, redis `127.0.0.1:16379`
- Synthetic env: `/tmp/salesos_master_20260923/trial.env` (**not committed**)
- Protected ports untouched: 4173/8080/8765/3000/3001/5173; no new public cloudflared

## Honest gaps for Codex on user Windows PC

1. Docker Desktop path: run `Start-InternalTrial.ps1` — expect PASS when Desktop networking is normal (bridge).
2. If Docker absent: run `scripts/windows/native/Fetch-NativeDeps.ps1` then `Start-InternalTrial-Native.ps1` (needs Node 20+ and Postgres binaries via PATH or `vendor/windows/pgsql`).
3. This bot did **not** run on the user’s Windows PC.
4. HashiCorp official site fetch failed once (HTTP/network); 4/5 other public samples imported.
