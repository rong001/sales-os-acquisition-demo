# 销售获客 OS 演示（Sales Acquisition OS）

## 项目矩阵

完整表见 **[docs/PROJECT_MATRIX.md](./docs/PROJECT_MATRIX.md)**。摘要：

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 |
|---|---|---|---|---|---|---|
| 抢票 | [已交付](https://github.com/rong001/ticket-grab-cloud-demo)（`88f93f3`） | [已交付 HTTPS](https://159.75.71.192:18444/) · [/intake](https://159.75.71.192:18444/intake) | 腾讯云轻量 Compose + Caddy | 查票 live、盯票、intake 对话；诚实边界（非未授权代购）；真实成交/自动购票 stub | 未通过 ToC 自助闭环 | 真实购票闭环；合法边界 |
| USGate | [demo](https://github.com/rong001/usgate-demo) · [client](https://github.com/rong001/usgate-client) | [已交付](https://117.55.227.224:8443/) | 见 docs/PROJECT_MATRIX.md |
| 获客（本仓库） | [已交付](https://github.com/rong001/sales-os-acquisition-demo) | 公网 **临时** trycloudflare（见 `docs/acceptance/public-https/PUBLIC_URL.txt`） | 生产静态 dist + gateway :18180 + supervise；可选 cloudflared | 获客全切片；触达/成单 MOCK/stub；viewer 只读 | 本机+负面+公网(临时) E2E | 隧道临时；真实触达/成交 |

面向 **抢票产品（ticket-grab）** 与 **USGate** 的获客经营垂直切片：公开落地页留资 → 同意证据 → UTM/邀请码归因 → 去重建档 → 技能组负载分配 → 跟进时间线 → 预约披露确认 → 转化漏斗。

设计对齐见同级目录 `../sales-os/`（00–06）。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite（克制中文 UI） |
| API | NestJS + TypeORM + PostgreSQL |
| Worker | Redis Streams / outbox（可选） |
| 编排 | Docker Compose（本仓库已齐备；若本机无 Docker 用本地 Postgres） |
| 公网 | `deploy/public-gateway.mjs`（:18180）+ cloudflared quick tunnel |

## 目录

```
sales-os-app/
  apps/api       NestJS API（含公开 /public 进线）
  apps/worker    事件消费者
  apps/web       落地页 + 作战台 + 漏斗
  deploy/        公网 gateway（隔离端口 18180）
  docs/          未完成项、用户操作、验收证据
  scripts/       冒烟 / E2E / 公网部署
```

## 端口说明（统一）

| 服务 | 默认端口 | 说明 |
|---|---|---|
| Web（Vite） | **5173** | 若占用，Vite 自动改用 **5174** 等下一可用端口（以终端 `Local:` 为准） |
| API | **3100** | Compose 内映射常见为 3000，见 `docker-compose.yml` |
| 公网 Gateway | **18180** | 仅本机 `127.0.0.1`；`/api/*` → API（strip `/api`，与 Vite proxy 一致），其余 → Web |
| Vite `/api` 代理 | → `VITE_PROXY_TARGET` | 默认 `http://127.0.0.1:3100` |

**勿占用/勿重启**他项目常用口：4173、8080、8765、3000、3001。

## 快速启动

```bash
cp .env.example .env
# 编辑 .env：设置 DEMO_AGENT_PASSWORD / DEMO_ADMIN_PASSWORD / JWT_SECRET / DATABASE_URL
npm install
npm run start:dev -w @sales-os/api    # 默认 :3100
npm run dev -w @sales-os/web          # 默认 :5173（若占用则自动 5174…）；/api 代理到 API :3100
```

Docker（若可用）：

```bash
cp .env.example .env   # 填入非 CHANGE_ME 的密码
docker compose up --build
# Web http://localhost:5173  API http://localhost:3000/health
```

## 公网 HTTPS 演示

当前核验 URL（**cloudflared 临时域名，进程重启会变**）：

**https://cons-make-empire-treaty.trycloudflare.com**

| 入口 | URL |
|---|---|
| 抢票落地页 | https://cons-make-empire-treaty.trycloudflare.com/p/ticket-grab |
| USGate 落地页 | https://cons-make-empire-treaty.trycloudflare.com/p/usgate |
| 坐席登录 / 作战台 | https://cons-make-empire-treaty.trycloudflare.com/ |
| 转化漏斗（管理员） | https://cons-make-empire-treaty.trycloudflare.com/admin/funnel |

重新发布（不中断其他项目隧道/端口）：

```bash
# 前置：API :3100、Web :5174（或 5173）已运行；cloudflared 二进制可用
bash scripts/deploy-public-https.sh
# 新 URL 写入 docs/acceptance/public-https/PUBLIC_URL.txt
```

架构：浏览器 → HTTPS trycloudflare → `127.0.0.1:18180` gateway → API :3100 / Web :517x。  
前端默认相对路径 `/api`（同域），无需把 `localhost:3100` 暴露给浏览器。

验收证据：`docs/acceptance/public-https/E2E.md`。

## 本机演示入口

| 入口 | URL |
|---|---|
| 抢票落地页 | http://127.0.0.1:5173/p/ticket-grab?utm_source=demo&utm_medium=readme&invite=INV01 （若 Vite 在 5174 则改端口） |
| USGate 落地页 | http://127.0.0.1:5173/p/usgate?utm_source=demo&utm_medium=readme&invite=INV02 |
| 坐席作战台 | http://127.0.0.1:5173/ |
| 转化漏斗 | http://127.0.0.1:5173/admin/funnel （管理员） |

演示账号邮箱：`agent@demo.local` / `admin@demo.local` / `viewer@demo.local`（只读）。  
**密码仅来自本地 `.env` 的 `DEMO_*_PASSWORD`（含 `DEMO_VIEWER_PASSWORD`），勿写入公开 README。**

## 能力清单

1. 双产品公开落地页：自愿留资 + 明确同意勾选 + 同意证据（文本版本/时间/IP/UA）
2. UTM（source/medium/campaign/content/term）+ 邀请码，写入 LeadSource
3. 同租户同手机/邮箱 merge_key 去重，不造假身份
4. 技能组 + 负载 + Ownership；管理员可指定坐席
5. 案件跟进时间线（notes/activities）
6. 预约草稿 + 确认（费用/边界/取消规则披露）
7. 漏斗统计：intake → qualified → assigned → reached/intent → appointed → ordered(stub)
8. 角色门禁（agent / admin）；管理员可导出脱敏 CSV
9. 外呼/短信演示一律标记 **MOCK**；真实供应商仅当 `REAL_SMS_ENABLED` / `REAL_CALL_ENABLED=true` 且配置密钥

## 验收

见 `docs/acceptance/E2E.md`、`docs/acceptance/public-https/E2E.md`、`docs/acceptance/COMPOSE.md`。

```bash
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-acquisition.sh
# 公网：
API_BASE="$(cat docs/acceptance/public-https/PUBLIC_URL.txt)/api" \
  OUT_DIR=docs/acceptance/public-https/e2e-logs \
  bash scripts/e2e-acquisition.sh
```

## 非目标

真实短信/外呼默认关闭；不做违规逆向；不做虚高自动化率宣传。

## 相关文档

- `docs/STABLE_DEPLOY.md` — 生产静态构建 + 受管进程


- `docs/UNFINISHED.md` — 未完成项
- `docs/USER_ACTIONS.md` — 需人工完成的步骤
- `docs/screenshots/` — 界面截图
- `docs/PROJECT_MATRIX.md` — 三项目索引

## 可访问地址

- **GitHub（公开制品）**: https://github.com/rong001/sales-os-acquisition-demo
- **公网 HTTPS（临时）**: https://cons-make-empire-treaty.trycloudflare.com
- **本机落地页**: http://127.0.0.1:5173/p/ticket-grab 、 http://127.0.0.1:5173/p/usgate（占用时改 5174）
- **本机 API**: http://127.0.0.1:3100/health
