# 可自助复测清单（toc-prod）

> **合成数据 only** — 勿填真实客户姓名/手机/邮箱。  
> 密码**仅**来自本地 `.env`（`DEMO_AGENT_PASSWORD` / `DEMO_ADMIN_PASSWORD` / `DEMO_VIEWER_PASSWORD`），**勿**把明文密码写进本仓。  
> **本清单全部勾选通过 ≠ 固定域名通过 ≠ 整体独立端到端验收通过。**  
> 整体结论仍是：**临时演示可维护；固定域名与独立端到端验收未通过**（见 `INDEPENDENT_CHECKLIST.md`）。

## 0. 前置

1. 读取公网临时 URL：

```bash
cat docs/acceptance/toc-prod/PUBLIC_URL.txt
# 例：https://….trycloudflare.com （临时，进程重跑会变）
```

2. 确认本机栈（勿占 4173/8080/8765/3000/3001/5173）：

```bash
curl -sf http://127.0.0.1:3100/health
curl -sf http://127.0.0.1:18180/__ready
bash scripts/supervise.sh status
```

3. 账号（邮箱公开；密码只在 `.env`）：

| 邮箱 | 角色 | 用途 |
|---|---|---|
| `agent@demo.local` | agent | 线索写操作 |
| `admin@demo.local` | admin | 漏斗 / 导出 / 审计 |
| `viewer@demo.local` | viewer | 只读；写操作应 403 |

---

## 1. 浏览器表单

设 `PUB=$(cat docs/acceptance/toc-prod/PUBLIC_URL.txt)`（或本机 `http://127.0.0.1:18180`）。

1. 打开：

   - `$PUB/p/ticket-grab?utm_source=selftest&utm_medium=manual&utm_campaign=retest&invite=SELFTEST1`
   - `$PUB/p/usgate?utm_source=selftest&utm_medium=manual&utm_campaign=retest&invite=SELFTEST1`

2. **未勾选同意**：填写合成姓名 + 手机 `1380000XXXX`（自选后四位）→ 提交按钮应不可用 / 无法成功提交。
3. **勾选同意**后提交 → 应成功；记录页面展示的**案件短号**（UUID 前 8 位）。
4. 可选对照截图：`docs/acceptance/toc-prod/browser/`（合成数据说明见该目录 `README.md`）。

---

## 2. 线索流转（curl 或 UI）

以下以本机 API 为例（公网则把 `API` 换成 `$PUB/api`）。密码从 `.env` 读取，勿回显到公开文档。

```bash
set -a && source .env && set +a
API=http://127.0.0.1:3100
CASE_ID=<完整案件 UUID>   # 由短号在作战台点开，或由 intake 响应获得

# login agent
TOKEN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"agent@demo.local\",\"password\":\"$DEMO_AGENT_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
AUTH="Authorization: Bearer $TOKEN"

# 详情：应见 UTM + invite + consent
curl -sf "$API/leads/$CASE_ID" -H "$AUTH" | python3 -m json.tool | head -80

# 流转
curl -sf -X POST "$API/leads/$CASE_ID/qualify" -H "$AUTH" -H 'Content-Type: application/json' -d '{}'
curl -sf -X POST "$API/leads/$CASE_ID/assign" -H "$AUTH" -H 'Content-Type: application/json' -d '{}'
curl -sf -X POST "$API/leads/$CASE_ID/activities" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"type":"note","content":"selftest follow-up"}'
# mock reach → appoint confirm（步骤与 scripts/e2e-acquisition.sh 一致）
bash -c 'API_BASE='"$API"' OUT_DIR=/tmp/selftest-e2e bash scripts/e2e-acquisition.sh'   # 或手工按脚本步骤

# admin funnel
ATOKEN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@demo.local\",\"password\":\"$DEMO_ADMIN_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -sf "$API/admin/funnel" -H "Authorization: Bearer $ATOKEN"
```

**负例（应失败）：**

```bash
# 无同意
curl -s -o /tmp/no-consent.json -w '%{http_code}\n' -X POST "$API/public/leads/intake" \
  -H 'Content-Type: application/json' \
  -d '{"product_code":"ticket-grab","name":"未同意","phone":"13800008888","consent_accepted":false}'
# 期望 400

# viewer 写操作 403
VTOKEN=$(curl -sf -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"viewer@demo.local\",\"password\":\"$DEMO_VIEWER_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
curl -s -o /tmp/viewer-deny.json -w '%{http_code}\n' -X POST "$API/leads/$CASE_ID/qualify" \
  -H "Authorization: Bearer $VTOKEN" -H 'Content-Type: application/json' -d '{}'
# 期望 403
```

一键负例套件：

```bash
API_BASE=http://127.0.0.1:3100 OUT_DIR=/tmp/selftest-neg bash scripts/e2e-negative.sh
```

---

## 3. 整栈重启后同 case 仍在

```bash
bash scripts/supervise.sh restart
# 等待 health
until curl -sf http://127.0.0.1:3100/health; do sleep 1; done
curl -sf "http://127.0.0.1:3100/leads/$CASE_ID" -H "$AUTH" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d["case"]["id"], d["case"]["stage"], d["source"].get("invite_code"))'
```

期望：同一 `CASE_ID` 仍可拉取；UTM/invite/consent 保留。

---

## 4. 备份 / 恢复（勿覆盖生产）

```bash
bash scripts/backup-db.sh
# → var/backups/sales_os-YYYYMMDD-HHMMSS.dump ；symlink sales_os-latest.dump

# 只读 TOC
pg_restore -l var/backups/sales_os-latest.dump | head

# 可选：恢复到临时库（推荐）
# 使用 .env 中 DATABASE_URL 的用户/主机，库名改为 sales_os_restore_test
# 示例（按你的 DATABASE_URL 改写）：
createdb -h 127.0.0.1 -U sales sales_os_restore_test   # 或 psql postgres -c 'CREATE DATABASE ...'
pg_restore --no-owner --no-acl -d "postgres://sales:***@127.0.0.1:5432/sales_os_restore_test" \
  var/backups/sales_os-latest.dump
psql "postgres://sales:***@127.0.0.1:5432/sales_os_restore_test" \
  -c "SELECT id, stage FROM lead_cases WHERE id='$CASE_ID';"
dropdb -h 127.0.0.1 -U sales sales_os_restore_test
```

**不要**对生产库 `sales_os` 误跑会 `--clean` 覆盖的恢复，除非维护窗口且已有备份。覆盖命令仅见 `docs/STABLE_DEPLOY.md` / `scripts/restore-db.sh`。

---

## 5. 边界声明（必读）

| 本清单通过意味着… | **不**意味着… |
|---|---|
| 临时 trycloudflare 演示在合成数据下可复现关键路径 | 固定域名已启用 / 已通过 |
| agent/本机 API 与脱敏证据可对照 | 用户已完成独立端到端验收 |
| 备份可列出 TOC、可恢复到临时库 | 生产库已做破坏性恢复演练 |

完成后请在 [`INDEPENDENT_CHECKLIST.md`](./INDEPENDENT_CHECKLIST.md) 自行勾选；**固定域名**行与**独立端到端**行默认保持未勾。
