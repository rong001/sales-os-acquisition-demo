# 预约确认鉴权前置 — E2E 复测

> 合成账号；密码仅从本地 `.env` 的 `DEMO_*` 读取，**禁止**打印/提交密码、JWT、手机号明文。  
> 自动化：`npm run e2e:confirm-appt`（`scripts/e2e-confirm-appointment-rbac.sh`）。  
> **禁止** manager→admin 回退：若 `manager@demo.local` 登录失败或角色非 `supervisor`/`manager`，套件直接 FAIL，并记 `manager_role: PENDING_VERIFY`。

## 前置

1. 已应用 `confirmAppointment` 鉴权前置补丁（案件存在性 + 租户 + `assertCaseAccess(write)` 在幂等返回/写库/事件之前）
2. `npm run build -w @sales-os/api && bash scripts/supervise.sh restart`（勿动 4173/8080/8765/3000/3001/5173）
3. `bash scripts/supervise.sh status` — API :3100 RUNNING

## 步骤与字段比对

| # | 操作 | 期望 HTTP | 字段比对 | 结果 |
|---|---|---|---|---|
| 1 | `manager@` 登录，断言 role=supervisor/manager | 2xx | role | ☐ |
| 2 | 经理建线索 → 合格 → 分配给 sales2；sales2 建 draft 预约 | 2xx | status=draft | ☐ |
| 3 | 经理 GET case → BEFORE 快照 | 200 | appt `{id,status,valid,confirmed_at}`；case `stage`；ownership `protect_until`；events `appointment.confirmed` + `conversion.appointment_valid` 计数 | ☐ |
| 4 | sales1 POST `/appointments/:id/confirm`（draft） | **403** | AFTER vs BEFORE：**全部不变** | ☐ |
| 5 | sales2（归属人）confirm | 2xx | status=confirmed；valid=true；confirmed_at 有值；stage=APPOINTED；protect_until 可推进；两事件计数 +1 | ☐ |
| 6 | sales1 再 confirm（已 confirmed） | **403**（不得幂等成功） | vs 步骤5 快照：**不变**；响应无 `idempotent:true` | ☐ |
| 7 | sales2（或经理）再 confirm | 2xx | `idempotent: true` | ☐ |
| 8 | （可选）经理为 sales1 建案，sales1 draft，经理 confirm | 2xx | status=confirmed | ☐ |
| 9 | （可选）psql 插入 case_id 不存在的预约再 confirm | **404** | 行仍 draft/valid=false/无 confirmed_at | ☐ |

## 一键复测

```bash
cd /path/to/sales-os-app
set -a && source .env && set +a   # 勿打印
npm run build -w @sales-os/api
bash scripts/supervise.sh restart
npm run e2e:confirm-appt
# 产物：docs/acceptance/internal-trial/confirm-appointment-rbac/
#   results.json · snapshot-*-redacted.json · diff-*-redacted.json · E2E.md
```

## 产物说明

- `results.json`：逐步 PASS/FAIL + 比对字段说明
- `snapshot-before-redacted.json` / `snapshot-after-*-redacted.json`：脱敏前后快照
- `diff-*-redacted.json`：字段级 diff（期望不变的步骤 diffs 应为空）
- `.raw/`：含 JWT 的原始响应，**已 gitignore，勿提交**
