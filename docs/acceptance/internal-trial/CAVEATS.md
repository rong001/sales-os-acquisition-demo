# 内部试用 — 诚实边界与待验证项

> 本文件列出**不能**仅凭当前自动化勾选为已证明的事项。域名不是当前第一阻塞。

## 待验证（PENDING_VERIFY）

| 项 | 为何不能勾已证明 | 建议复测 |
|---|---|---|
| **经理角色独立证明** | 旧版 `e2e-internal-sales.sh` 曾静默 `manager→admin` 回退，用 admin 跑通不能独立证明 `manager@` 的 supervisor 鉴权路径。本轮已去掉静默回退；预约确认套件**强制** manager 登录成功。若经理登录失败，记 `manager_role: PENDING_VERIFY` 并 FAIL。 | `npm run e2e:confirm-appt`（强制 manager）；或人工用 `manager@demo.local` 登录看 role |
| **进程重启持久化** | 内部试用 E2E 将 `persist_restart` 标为跳过/待验证，未在本轮做 stop→start 后再读案。 | `bash scripts/supervise.sh restart` 后 GET 同一 case，核对 stage/activities |
| **到期跟进提醒已触发** | 写入 `meta.next_follow_at` 或确认预约，**只证明字段/阶段落库**，不证明 worker 到点发出提醒/触达。 | 查 worker 日志/计划任务/reach attempt；或构造已到期 `next_follow_at` 观察调度 |

## 主阻塞排序（内部试用）

1. **预约确认鉴权前置（本轮已修并 E2E 字段级验证）** — 非归属销售不得通过幂等捷径确认他人预约；孤儿 case 返回 404。
2. 上表三项 **待验证**（经理角色独立性、重启持久化、到期提醒实触发）。
3. **固定域名 / DNS / Cloudflare** — **待用户确认**，不是当前第一功能阻塞；本机 `:3100` + gateway `:18180` 可复测。

## 明确未声称

- 未声称生产稳定、可售、真实 SMS/Call/Email 已接通。
- ToC 落地页演示渠道 ≠ 内部销售闭环整体验收通过。
