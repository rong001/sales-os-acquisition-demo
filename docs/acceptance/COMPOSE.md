# Docker Compose 实测

**日期**: 2026-09-22  
**结果**: Docker **不可用**

```text
$ which docker
# (empty)
$ docker compose version
bash: docker: command not found
```

本执行环境无 Docker 引擎/CLI，故 **未** 实测 `docker compose up`。

## 本地替代（已验证）

- PostgreSQL @ `127.0.0.1:5432`（库 `sales_os`，用户 `sales`；数据落在本机 Postgres 数据目录，进程重启后仍在）
- Redis @ `127.0.0.1:6379`
- API / Web 以 npm 进程运行（见 README 方式 B）

`docker-compose.yml` 已齐备（postgres/redis/api/worker/web + named volumes `pgdata`/`redisdata`）。有 Docker 的机器上可：

```bash
cp .env.example .env   # 填入非 CHANGE_ME 值
docker compose up --build
```

持久化证明（本机）：API 进程重启后同一 `CASE_ID` 仍为 `APPOINTED` 且跟进/同意证据仍在 — 见 `E2E.md` 步骤 7。
