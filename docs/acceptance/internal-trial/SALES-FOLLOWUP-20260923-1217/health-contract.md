# Health endpoint contract — SALES-FOLLOWUP-20260923-1217

| Endpoint | Role | When ok |
|---|---|---|
| `GET /health/live` | **Liveness** | Process up (does **not** prove PG/Redis) |
| `GET /health` | **Readiness** | Required postgres OK; redis OK when `REDIS_URL` set |
| `GET /health/ready` | **Readiness** (alias) | Same as `/health` |
| Web `GET /api/health` | Proxied readiness | Vite/gateway strip `/api` → `/health` |

## Status codes

- Readiness failure → **HTTP 503** + `{ ok:false, check:"readiness", deps:{ postgres, redis } }`
- Liveness → always 200 while process serves

## User evidence (pre-fix, DO NOT REDO)

- Stop PG 55433 → `/api/health` still 200/ok while workbench 500 (liveness-only bug)
- Redis 56380 `SHUTDOWN SAVE` → health + workbench still 200
- After this pack: `/api/health` is readiness and should fail when required deps down

## Business APIs

Dependency outages map to recoverable `503 DEPENDENCY_UNAVAILABLE` via `DependencyExceptionFilter`.
