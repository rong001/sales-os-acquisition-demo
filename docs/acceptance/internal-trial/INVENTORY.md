# 内部试用盘点（Inventory）

> 验收焦点：**销售公司内部**线索获客与跟进闭环。  
> ToC 落地页（抢票/USGate）仅为演示进线渠道，**不是**本轮整体验收标准。  
> 域名与 DNS/Cloudflare 条件**待用户确认** — 不阻塞本轮内部闭环。

## 1. 公司 / 行业背景

| 项 | 状态 |
|---|---|
| 具体客户公司名 | **未知** |
| 具体垂直行业 | **未知**（历史演示曾用抢票 + USGate，但本验收按**通用销售流程**） |
| 目标客群 | 通用销售公司，尤其电销/线上获客：T1 投放电销 / T2 纯外呼 / T3 私域 / T4 B2B |
| 本轮验收 | 内部 CRM 闭环：录入→去重→分配→跟进/下次提醒→商机结果→经理查看 + RBAC |

## 2. 角色 ↔ 现有账号（仅 demo 邮箱；密码见本地 `.env` 的 `DEMO_*`，**本文不写密码**）

| 业务角色 | 系统 role | Demo 邮箱 | 说明 |
|---|---|---|---|
| 管理员 | `admin` | `admin@demo.local` | 全量权限、导出、漏斗 |
| 经理 | `supervisor`（RolesGuard 与 admin 同等管理能力） | `manager@demo.local` | 分配给指定销售、查看全部线索与结果 |
| 销售1 | `agent` | `agent@demo.local` | 仅未分配 + 本人名下 |
| 销售2 | `agent` | `agent2@demo.local` | 同上（负面用例对照） |
| 只读访客 | `viewer` | `viewer@demo.local` | 可读漏斗/案件；不可写（既有） |

密码环境变量：`DEMO_ADMIN_PASSWORD` / `DEMO_MANAGER_PASSWORD` / `DEMO_AGENT_PASSWORD` / `DEMO_AGENT2_PASSWORD` / `DEMO_VIEWER_PASSWORD` — **见本地 `.env`，勿提交**。

## 3. 仓库 / 分支 / 提交

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/rong001/sales-os-acquisition-demo （公开） |
| 分支 | `main` |
| 本轮前 tip | `cc848f9` |
| 本轮交付 tip | 见 push 后 SHA（本文件随提交更新于 REPORT） |

## 4. 运行入口

| 项 | 值 |
|---|---|
| API | `http://127.0.0.1:3100`（`API_PORT`/`PORT`） |
| Gateway（静态 Web + `/api` 反代） | `http://127.0.0.1:18180` |
| 登录页 | `http://127.0.0.1:18180/login` |
| 作战台 | `http://127.0.0.1:18180/`（需登录） |
| 公网 | 临时 trycloudflare，见 `docs/acceptance/toc-prod/PUBLIC_URL.txt`；**固定域名未启用（条件待用户确认）** |
| 进程 | `bash scripts/supervise.sh {start\|stop\|restart\|status}` |
| 冒烟 / 获客 E2E | `npm run smoke` / `npm run e2e` |
| **内部销售 E2E** | `npm run e2e:internal` → `scripts/e2e-internal-sales.sh` |

**如何登录（不写密码）**：用上表 demo 邮箱 + 本地 `.env` 对应 `DEMO_*_PASSWORD`；或 UI `/login`。

## 5. 本机可执行环境（box）

| 组件 | 状态 |
|---|---|
| Node | v20.x（实测可用） |
| PostgreSQL | 本机 :5432 可用 |
| Redis | 本机 :6379 可用（`PONG`） |
| Docker Compose | 仓库有 `docker-compose.yml`；本机无引擎则用本地 PG/Redis（当前即此模式） |

## 6. 已完成能力 vs 桩（stub）

### 已完成（本轮可演示）

- 线索手工录入 `POST /leads/intake` + 公开落地页 `POST /public/leads/intake`
- 真实获客字段：`source_type` / `source_channel` / UTM* / `invite_code` / `landing_url` / `form_id`（**非**随机假「获客」）
- 手机/邮箱 merge_key **去重**（`merged=true`）
- 合格 `qualify` → 经理/管理员 **分配** `assign`（指定 `agent_seat_id`）
- 跟进时间线 `activities`（`meta.next_follow_at`）+ **预约** `appointments`（下次提醒/到访）
- 商机/成交结果 `mark-result`：`won` / `lost` / `invalid` / `nurture` / `blocked`
- 经理工作台 / 漏斗 / 来源转化
- RBAC：销售不可读其他销售已分配客户（`403 无权访问其他销售的客户`）
- 备份脚本 `scripts/backup-db.sh` / `restore-db.sh`（既有）

### 桩 / 未实达（诚实边界）

- SMS/Call：**MOCK**（默认）
- 邮件：无 SMTP → **未送达**（非成功 MOCK）
- Order 支付成交全链路：**stub**
- 固定域名 / Named Tunnel：**条件待用户确认**
- 本轮 **持久化重启检查**：E2E 标记 `SKIPPED_time_tight`（既有 `e2e-acquisition.sh` 含重启校验可另跑）

## 7. 内部试用最小阻塞

1. **域名与 DNS/Cloudflare 条件待用户确认**（不阻塞内网/本机试用）
2. 真实触达凭据未配（试用可用 MOCK）
3. 具体客户公司名/行业未知 → 用通用销售流程话术即可

## 8. API / UI 闭环映射（摘要）

| 步骤 | API | UI |
|---|---|---|
| 录入 | `POST /leads/intake` 或 `/public/leads/intake` | 作战台录入 / 落地页 |
| 去重 | intake 返回 `merged` | — |
| 合格 | `POST /leads/:id/qualify` | 案件详情 |
| 分配 | `POST /leads/:id/assign` `{agent_seat_id}` | 案件「管理员分配」 |
| 坐席列表 | `GET /agents` | 分配下拉 |
| 跟进 | `POST /leads/:id/activities` | 案件跟进 |
| 下次提醒 | activity `meta.next_follow_at` + `POST .../appointments/draft` + confirm | 预约 |
| 结果 | `POST /leads/:id/mark-result` | 案件结果 |
| 经理查看 | `GET /workbench/today`、`GET /leads/:id`、`GET /admin/funnel` | 作战台 / 漏斗 |
