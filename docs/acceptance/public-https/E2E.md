# 公网 HTTPS E2E 验收（获客 OS）

**日期**: 2026-09-22  
**结果**: **PASS**  
**证据目录**: `docs/acceptance/public-https/`（本目录）与 `e2e-logs/`

## 环境

| 组件 | 地址 | 说明 |
|---|---|---|
| Public HTTPS | https://shoes-midnight-reload-noted.trycloudflare.com | cloudflared quick tunnel → 127.0.0.1:18180 |
| Gateway | http://127.0.0.1:18180 | `deploy/public-gateway.mjs`：`/api/*`→:3100（strip `/api`），其余→Vite :5174 |
| API | http://127.0.0.1:3100 | Nest；仅本服务被重启做过持久化核验 |
| Web | http://127.0.0.1:5174 | Vite（5173 被其他项目占用） |
| Docker | 不可用 | 未使用；未动其他项目 Compose |

**隔离约束核对**：未杀/未重启 4173、8080、8765、3000、3001 及既有其他项目 cloudflared。

## 入口

| 入口 | URL |
|---|---|
| 抢票落地页 | https://shoes-midnight-reload-noted.trycloudflare.com/p/ticket-grab |
| USGate 落地页 | https://shoes-midnight-reload-noted.trycloudflare.com/p/usgate |
| 坐席登录 / 作战台 | https://shoes-midnight-reload-noted.trycloudflare.com/ |
| 漏斗（管理员） | https://shoes-midnight-reload-noted.trycloudflare.com/admin/funnel |
| API health（同域） | https://shoes-midnight-reload-noted.trycloudflare.com/api/health |

演示账号：`agent@demo.local` / `admin@demo.local`（密码仅 `.env` 的 `DEMO_*_PASSWORD`）。

## 步骤与结果

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| 0 | Gateway health + landings 200 | PASS | `gateway.log.txt` |
| 0b | Tunnel 注册 trycloudflare | PASS | `cloudflared-excerpt.txt` `PUBLIC_URL.txt` |
| 1 | 公网 HTTPS 进线 intake（合成线索） | PASS | `e2e-logs/02-intake.json` |
| 2 | 线索可见 stage=NEW + UTM/invite | PASS | `e2e-logs/04-case-detail.json` |
| 3 | 分配 | PASS | `e2e-logs/06-assign.json` |
| 4 | 跟进活动 | PASS | `e2e-logs/07-activity.json` |
| 5 | MOCK 触达 → 确认预约 | PASS | `e2e-logs/08-attempt.json` `10-confirm.json` |
| 6 | 漏斗 appointed≥1 | PASS | `e2e-logs/11-funnel.json` |
| 7 | **仅**重启 sales-os API 后持久化 | PASS | `e2e-logs/12a-health-after-restart.json` `12-after-restart.json` |
| + | 同手机去重 merged=true | PASS | `e2e-logs/13-dedup.json` |
| + | 落地页经隧道仍 200 | PASS | curl ticket/usgate/root |

`e2e-logs/PASS.txt`: `E2E_PUBLIC_HTTPS_OK`

## 前端同源

Web 使用相对路径 `VITE_API_BASE` 默认 `/api`，经 gateway 同域转发，无需浏览器直连 localhost:3100。

## 隧道时效

trycloudflare URL **临时**：进程退出或重新 `scripts/deploy-public-https.sh` 会换新域名。矩阵中的链接以当时核验 URL 为准；重跑部署脚本后请更新矩阵行。

复现：

```bash
# API :3100 + Web :5174 已运行；端口 18180 空闲
bash scripts/deploy-public-https.sh
# 然后：
API_BASE="$(cat docs/acceptance/public-https/PUBLIC_URL.txt)/api" \
  OUT_DIR=docs/acceptance/public-https/e2e-logs \
  bash scripts/e2e-acquisition.sh
# 持久化：仅重启 sales-os API（勿杀其他端口服务）后再跑脚本 step 7 / 重拉 case
```
