# 到期跟进（站内提醒）— E2E 与用户试用

> 合成账号；密码仅从本地 `.env` 的 `DEMO_*` 读取，**禁止**打印/提交密码、JWT、手机号明文。  
> 自动化：`npm run e2e:followup`（`scripts/e2e-followup-reminders.sh`）。  
> **禁止** manager→admin 回退：若 `manager@demo.local` 登录失败或角色非 `supervisor`/`manager`，套件直接 FAIL。
>
> **范围说明：站内提醒；外部消息送达仍待接入**（无 SMS/Call/SMTP/固定域名要求）。

## 实现要点

- `LeadCase.next_follow_at` + `follow_up_status`（`open`/`handled`）持久化，不仅是 activity meta。
- 添加跟进时可传 `next_follow_at`（顶层或 meta）。
- `GET /workbench/today` 返回 `due_follow_ups`（`due_at <= now` 且 `open`；销售仅本人名下）。
- `POST /leads/:caseId/follow-up/handle` 标记已处理，不再出现在到期列表。
- 作战台 UI：`/` → 区块「到期跟进」→「已处理」。

## 前置

1. `npm run build`（api + web）
2. `bash scripts/supervise.sh restart`（勿动 4173/8080/8765/3000/3001/5173）
3. `bash scripts/supervise.sh status` — API :3100 / gateway :18180 RUNNING

## 自动化步骤

| # | 操作 | 期望 |
|---|---|---|
| 1 | `manager@` 登录，断言 supervisor/manager | PASS，禁止 admin 回退 |
| 2 | 经理建案 → 合格 → 分配 sales1 | owner=sales1 |
| 3 | sales1 设 **未来** `next_follow_at` | 作战台 `due_follow_ups` **不含**该案 |
| 4 | sales1 改设 **已到期** `next_follow_at` | sales1 到期列表可见 |
| 5 | sales2 看到期列表 | **不含** sales1 的项 |
| 6 | `supervise.sh restart` 后再读 | 归属、时间、open 待办仍在 |
| 7 | sales1「已处理」 | 列表不再出现 |

## 一键复测

```bash
cd /path/to/sales-os-app
set -a && source .env && set +a   # 勿打印
npm run build
bash scripts/supervise.sh restart
npm run e2e:followup
# 产物：docs/acceptance/internal-trial/followup-reminders/
```

## 用户试用一步（浏览器）

1. 用 `agent@demo.local` 登录 → 打开 **今日作战台** `/`。
2. 在 **「到期跟进」** 区块查看到期待办（含案件短号与到期时间）→ 点 **「已处理」**，该项消失；刷新页面不应再出现。
3. （可选）进入案件详情，用「下次跟进时间」设定时间后，到期才会进入该列表。

浏览器路径：**`/`（今日作战台）→「到期跟进」**。

## 产物

- `results.json`：含实际 ISO 时间戳（设定前/到期后/重启前后/已处理）
- `*-redacted.json`：脱敏快照
- `browser/workbench-due-follow.png`：若本机有 Chrome + puppeteer 则截图
- `.raw/`：含 JWT，**已 gitignore，勿提交**
