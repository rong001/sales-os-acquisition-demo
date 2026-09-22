# 内部销售闭环 — 人工复测步骤（合成线索）

> 仅用合成数据。密码从本地 `.env` 的 `DEMO_*` 读取，**不要**写入本文或截图明文。  
> 自动化：`npm run e2e:internal`（`scripts/e2e-internal-sales.sh`）。  
> 预约确认鉴权专项：`npm run e2e:confirm-appt`（见 `confirm-appointment-rbac/E2E.md`）。

## 前置

1. `bash scripts/supervise.sh status` — API :3100、gateway :18180 为 RUNNING  
2. 浏览器打开 `http://127.0.0.1:18180/login`  
3. 账号见 `INVENTORY.md`（经理 `manager@demo.local`，销售1/2，管理员）

## 步骤与期望

| # | 操作 | 期望 | 结果栏 |
|---|---|---|---|
| 1 | 经理登录 → 录入线索 A：手机合成、`source_type=manual_import`、`utm_source=internal_trial`、邀请码可选 | 建档成功；来源字段可查；**须用 manager 角色，勿用 admin 冒充** | ☐ |
| 2 | 再录线索 B（不同手机，同类来源字段） | 第二案建档 | ☐ |
| 3 | 用 **A 同一手机** 再提交一次 | 返回 `merged=true`（身份去重） | ☐ |
| 4 | 经理对 A/B：合格 → 分配 A→销售1、B→销售2 | `owner_agent_id` 分别为两坐席 | ☐ |
| 5 | 销售1：跟进备注 + `meta.next_follow_at`；建预约并确认；`mark-result=won` | 阶段 WON；预约 event=`conversion.appointment_valid`。**注意：next_follow_at / 确认预约 ≠ 到期提醒已触发（待验证）** | ☐ |
| 6 | 经理打开 A/B 与漏斗 | 可见两边结果（如 WON / NURTURE） | ☐ |
| 7 | 销售1 用案件 ID 打开销售2 的 B | **HTTP 403**，文案「无权访问其他销售的客户」；工作台不泄露 B | ☐ |
| 7b | 销售1 对销售2 的 **draft/已确认** 预约调用 confirm | **HTTP 403**，字段不变（见 `confirm-appointment-rbac/`） | ☐ |
| 8 | （可选）重启 API 后再查 A | 阶段/跟进仍在；本轮自动化仍为 **待验证/跳过** | ☐ |

## 获客来源字段说明（勿用随机假获客）

真实进线应带齐可解释字段，例如：

- `source_type`：`manual_import` / `landing_form` / …
- `source_channel` / `utm_source|medium|campaign|content|term`
- `invite_code`、`landing_url`、`form_id`

公开渠道另有 `/public/leads/intake`（落地页）；本轮内部试用以**认证手工录入**为主。

## 一键复测

```bash
cd /path/to/sales-os-app
set -a && source .env && set +a   # 载入 DEMO_*，勿打印
npm run e2e:internal
npm run e2e:confirm-appt
# 产物：docs/acceptance/internal-trial/results.json · confirm-appointment-rbac/ · CAVEATS.md
```

## 主阻塞（纠正）

内部试用当前**第一阻塞不是固定域名**。排序见 `CAVEATS.md`：预约确认 RBAC（本轮已修）→ 待验证项（经理角色独立性 / 重启持久化 / 到期提醒）→ 域名待用户确认。
