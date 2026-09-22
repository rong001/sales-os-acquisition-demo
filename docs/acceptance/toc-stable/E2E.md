# ToC 稳定可展示验收（获客 OS）

**日期**: 2026-09-22  
**结果**: **PASS**（本机生产静态 + 公网临时隧道 + 负面用例）  
**公网 URL（临时 trycloudflare）**: https://cons-make-empire-treaty.trycloudflare.com

## 环境

| 组件 | 地址 | 说明 |
|---|---|---|
| Public HTTPS | https://cons-make-empire-treaty.trycloudflare.com | cloudflared quick tunnel → 127.0.0.1:18180（**临时**） |
| Gateway | http://127.0.0.1:18180 | `deploy/public-gateway.mjs` **static** 托管 `apps/web/dist`；`/api/*`→:3100 |
| API | http://127.0.0.1:3100 | Nest 生产 dist；supervise 自动拉起 |
| Worker | supervise | 生产 dist |
| Web | gateway static | **已停** Vite :5174 |
| Docker | 不可用 | 未使用；未动其他项目 |

**隔离**: 未杀/未重启 4173、8080、8765、3000、3001、5173 及非 sales-os cloudflared。

## 入口

| 入口 | URL |
|---|---|
| 抢票落地页 | https://cons-make-empire-treaty.trycloudflare.com/p/ticket-grab |
| USGate 落地页 | https://cons-make-empire-treaty.trycloudflare.com/p/usgate |
| 登录 / 作战台 | https://cons-make-empire-treaty.trycloudflare.com/ |
| 漏斗 | https://cons-make-empire-treaty.trycloudflare.com/admin/funnel（admin / viewer 只读） |
| API health | https://cons-make-empire-treaty.trycloudflare.com/api/health |
| Gateway health | https://cons-make-empire-treaty.trycloudflare.com/__gateway_health |
| Ready | https://cons-make-empire-treaty.trycloudflare.com/__ready |

演示账号：`agent@demo.local` / `admin@demo.local` / `viewer@demo.local`（只读）。  
密码仅 `.env` 的 `DEMO_*_PASSWORD`。

## 验收表

| # | 步骤 | 结果 | 证据 |
|---|---|---|---|
| 0 | `npm run build` 产出 api/worker/web dist | PASS | 构建日志 |
| 0b | supervise 拉起 api+worker+gateway(static) | PASS | `scripts/supervise.sh status` |
| 0c | 落地页/health 经 gateway 200 | PASS | curl local |
| 1 | 公网 HTTPS intake（合成） | PASS | `public-https/e2e-logs/` |
| 2 | UTM/邀请码可见 | PASS | e2e |
| 3 | 分配 / 跟进 / MOCK 触达 / 预约 | PASS | e2e |
| 4 | 漏斗 appointed≥1 | PASS | e2e |
| 5 | 重启 API 持久化 | PASS | e2e step7 |
| 6 | 同手机 dedup merged | PASS | e2e |
| N1 | 缺字段 → 400 | PASS | `toc-stable/negative/` |
| N2 | consent_accepted=false → 400 | PASS | negative |
| N3 | agent 调 admin 导出 → 403 | PASS | negative |
| N4 | viewer 写操作/导出 → 403；可读列表/详情/漏斗 | PASS | negative |
| N5 | 公网负面用例 | PASS | `toc-stable/negative-public/` |

## 未通过 / 有意 stub

- 公网域名 **临时**（trycloudflare）；稳定域名需用户 Named Tunnel（见 USER_ACTIONS）
- 真实触达 / 成单：**MOCK/stub**
- Compose 引擎本机未装：未实测

## 复现

```bash
npm run build
bash scripts/supervise.sh restart
bash scripts/supervise.sh start-cloudflared   # 临时 URL
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-acquisition.sh
API_BASE=http://127.0.0.1:3100 bash scripts/e2e-negative.sh
```
