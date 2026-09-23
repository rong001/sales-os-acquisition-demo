# Health contract (unchanged from 1217; enqueue note)

- `GET /health/live` = liveness
- `GET /health` + `/health/ready` = readiness (503 if required PG/Redis down)
- Readiness OK ≠ enqueue success; pending outbox recovered by worker / `recoverPendingOutbox`
- Never use workbench 200 as proof of enqueue recovery — see `redis-enqueue-recovery-synthetic`
