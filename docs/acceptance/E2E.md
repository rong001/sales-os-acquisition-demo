# E2E 验收记录（获客 OS）

**日期**: 2026-09-22  
**结果**: **PASS**  
**证据目录**: `docs/acceptance/e2e-logs/`

## 环境

- API: `http://127.0.0.1:3100`（本地 Nest，Postgres `sales_os` @ 127.0.0.1:5432，数据目录为本机 Postgres，非 Docker volume）
- Web: `http://127.0.0.1:5174`（Vite；5173 被其他项目占用）
- Docker: **不可用**（`docker: command not found`）— 见 `COMPOSE.md`

## 步骤与结果

| # | 步骤 | 命令/操作 | 结果 | 证据文件 |
|---|---|---|---|---|
| 1 | 访客提交落地表单（UTM+邀请码+同意） | `POST /public/leads/intake` product=`ticket-grab` | PASS | `02-intake.json` |
| 2 | 线索出现在工作台/后端 | `GET /leads/:id` stage=`NEW`，含 utm/invite | PASS | `04-case-detail.json` |
| 3 | 分配坐席 | `POST /leads/:id/assign` | PASS | `06-assign.json` |
| 4 | 添加跟进时间线 | `POST /leads/:id/activities` | PASS | `07-activity.json` |
| 5 | 创建/确认预约（含披露字段） | mock 触达（label=`MOCK`）→ confirm → `conversion.appointment_valid` | PASS | `08-attempt.json` `09-receipt.json` `10-confirm.json` |
| 6 | 漏斗统计更新 | admin `GET /admin/funnel` appointed≥1 | PASS | `11-funnel.json` |
| 7 | 重启 API 后数据仍在 | kill API → `npm run start:dev` → 同 case stage=`APPOINTED` activities≥1 consent 证据仍在 | PASS | `12a-health-after-restart.json` `12-after-restart.json` |
| + | 去重 | 同手机再进 USGate → `merged=true` | PASS | `13-dedup.json` |
| + | 无同意拒绝 | `consent_accepted=false` → HTTP 400 | PASS | — |

复现脚本：

```bash
# 前置：API 已启动且 .env 已配置 DEMO_*_PASSWORD
API_BASE=http://127.0.0.1:3100 DEMO_AGENT_PASSWORD=... DEMO_ADMIN_PASSWORD=... \
  bash scripts/e2e-acquisition.sh
# 持久化：脚本中途或之后重启 API，再查同一 CASE_ID
```

本机实测 PASS 标记：`e2e-logs/PASS.txt` → `E2E_ACQUISITION_OK case=0d98406a-5ccc-4524-a8cf-9103da5e3361`

## 结论

E2E + 重启持久化：**通过**。
