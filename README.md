# 销售获客 OS 演示（Sales Acquisition OS）

## 项目矩阵

完整表见 **[docs/PROJECT_MATRIX.md](./docs/PROJECT_MATRIX.md)**。摘要：

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 |
|---|---|---|---|---|---|---|
| 抢票 | 待发布（`rong001/ticket-grab-cloud` 仍私有） | [已交付](http://159.75.71.192:18090/)（HTTP 200，非 HTTPS） | 腾讯云轻量 Compose + Caddy | 查票/盯票/定时/协助登录+官方支付跳转；非代售；live≠自动购票 | 未通过 ToC 自助闭环 | 私有仓；HTTPS/域名；法律边界；访客闭环 |
| USGate | 待发布（本地 `usgate-demo` 已备，未公开） | 待发布（**勿**将 VPS IP/面板口当公开 demo） | 预期：VPS + 3X-UI + Compose/Caddy + Android APK | 隧道/重连/流量已测；门户本地 mock；Android APK 已构建 | 隧道 PASS；真机 E2E BLOCKED；HTTPS MIXED | 公开仓未推；无域名/证书；真机安装；面板凭据用户侧 |
| 获客（本仓库） | [已交付](https://github.com/rong001/sales-os-acquisition-demo) | 本地 npm/Compose，无公网演示 | npm / compose | 获客全切片（见下） | E2E 见 docs/acceptance | Docker 可选；公网需人工 |


面向 **抢票产品（ticket-grab）** 与 **USGate** 的获客经营垂直切片：公开落地页留资 → 同意证据 → UTM/邀请码归因 → 去重建档 → 技能组负载分配 → 跟进时间线 → 预约披露确认 → 转化漏斗。

设计对齐见同级目录 `../sales-os/`（00–06）。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite（克制中文 UI） |
| API | NestJS + TypeORM + PostgreSQL |
| Worker | Redis Streams / outbox（可选） |
| 编排 | Docker Compose（本仓库已齐备；若本机无 Docker 用本地 Postgres） |

## 目录

```
sales-os-app/
  apps/api       NestJS API（含公开 /public 进线）
  apps/worker    事件消费者
  apps/web       落地页 + 作战台 + 漏斗
  docs/          未完成项、用户操作、验收证据
  scripts/       冒烟 / E2E
```

## 快速启动

```bash
cp .env.example .env
# 编辑 .env：设置 DEMO_AGENT_PASSWORD / DEMO_ADMIN_PASSWORD / JWT_SECRET / DATABASE_URL
npm install
npm run start:dev -w @sales-os/api    # 默认 :3100
npm run dev -w @sales-os/web          # :5173，/api 代理到 API
```

Docker（若可用）：

```bash
cp .env.example .env   # 填入非 CHANGE_ME 的密码
docker compose up --build
# Web http://localhost:5173  API http://localhost:3000/health
```

## 演示入口

| 入口 | URL |
|---|---|
| 抢票落地页 | http://127.0.0.1:5174/p/ticket-grab?utm_source=demo&utm_medium=readme&invite=INV01 |
| USGate 落地页 | http://127.0.0.1:5174/p/usgate?utm_source=demo&utm_medium=readme&invite=INV02 |
| 坐席作战台 | http://127.0.0.1:5174/ （登录后；默认 Vite 端口 5173，本机若占用可改） |
| 转化漏斗 | http://127.0.0.1:5174/admin/funnel （管理员） |

演示账号邮箱：`agent@demo.local` / `admin@demo.local`。  
**密码仅来自本地 `.env` 的 `DEMO_*_PASSWORD`，勿写入公开 README。**

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

见 `docs/acceptance/E2E.md`、`docs/acceptance/COMPOSE.md`。

```bash
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-acquisition.sh
```

## 非目标

真实短信/外呼默认关闭；不做违规逆向；不做虚高自动化率宣传。

## 相关文档

- `docs/UNFINISHED.md` — 未完成项
- `docs/USER_ACTIONS.md` — 需人工完成的步骤
- `docs/screenshots/` — 界面截图


## 可访问地址

- **GitHub（公开制品）**: https://github.com/rong001/sales-os-acquisition-demo
- **本机落地页**（当前演示机）: http://127.0.0.1:5174/p/ticket-grab 、 http://127.0.0.1:5174/p/usgate
- **本机 API**: http://127.0.0.1:3100/health
- **公网隧道**: 无（demo 本地运行；GitHub 为公开制品）
