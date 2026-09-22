# 稳定可展示部署（获客 Sales OS）

> 目标：生产静态构建 + 受管进程 +（可选）临时公网隧道。  
> **不要**把 trycloudflare / quick tunnel 写成「稳定域名」。

## 端口隔离（硬约束）

| 用途 | 端口 |
|---|---|
| 获客 API | **3100** |
| 获客 Gateway（静态 Web + `/api` 反代） | **127.0.0.1:18180** |
| Postgres / Redis | 5432 / 6379（共享，勿动其他库） |
| **禁止占用/重启** | 4173、8080、8765、3000、3001、5173，以及非 sales-os 的 cloudflared |

生产模式下 **不再需要** Vite :5174。

## 一键生产

```bash
cp .env.example .env   # 设置 DEMO_*_PASSWORD / JWT_SECRET / DATABASE_URL
npm install
npm run build          # apps/api/dist + apps/worker/dist + apps/web/dist
bash deploy/run-prod.sh
# 或：
bash scripts/supervise.sh restart
bash scripts/supervise.sh status
```

健康检查：

- API：`http://127.0.0.1:3100/health`
- Gateway：`http://127.0.0.1:18180/__gateway_health`
- Ready（含上游 API）：`http://127.0.0.1:18180/__ready`
- 落地页：`http://127.0.0.1:18180/p/ticket-grab` 、 `/p/usgate`

日志：`var/log/{api,worker,gateway}.log`（已 gitignore）。

## Gateway 模式

- **默认（生产）**：`GATEWAY_WEB_MODE=static`，托管 `apps/web/dist`（SPA fallback），`/api/*` → :3100。
- **本地开发**：`GATEWAY_WEB_MODE=proxy WEB_TARGET=http://127.0.0.1:5174`，可继续用 Vite。

## 公网 HTTPS（临时）

```bash
bash scripts/deploy-public-https.sh
# URL 写入 docs/acceptance/public-https/PUBLIC_URL.txt
# 标注：trycloudflare = 临时，进程退出或重跑会换域名
```

固定域名未启用（条件待用户确认）。Named Tunnel 占位已备，启用前须用户确认域名与 DNS/Cloudflare，见 `docs/USER_ACTIONS.md` / `docs/PROD_HTTPS.md`。

## 数据库备份 / 恢复（仅 sales_os）

```bash
bash scripts/backup-db.sh                 # → var/backups/sales_os-*.dump
bash scripts/restore-db.sh var/backups/sales_os-YYYYMMDD-HHMMSS.dump
```

## 演示账号

| 邮箱 | 角色 | 能力 |
|---|---|---|
| `agent@demo.local` | agent | 线索写操作（分配/跟进/预约等） |
| `admin@demo.local` | admin | 全量 + 漏斗 + CSV 导出 |
| `viewer@demo.local` | viewer | **只读**：登录、列表/详情、漏斗；禁止写与导出 |

密码仅来自本地 `.env`：`DEMO_AGENT_PASSWORD` / `DEMO_ADMIN_PASSWORD` / `DEMO_VIEWER_PASSWORD`（默认合成值，克隆后必须修改）。**勿写入公开 README。**

## 验收

```bash
# 正向
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-acquisition.sh
# 负面（缺字段 / 无同意 / 越权 / 去重）
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-negative.sh
# 公网（临时 URL）
API_BASE="$(cat docs/acceptance/public-https/PUBLIC_URL.txt)/api" \
  OUT_DIR=docs/acceptance/public-https/e2e-logs \
  bash scripts/e2e-acquisition.sh
```
