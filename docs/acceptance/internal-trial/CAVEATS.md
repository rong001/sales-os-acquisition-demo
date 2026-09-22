# 内部试用 — 诚实边界与待验证项

> 本文件列出**不能**仅凭当前自动化勾选为已证明的事项。域名不是当前第一阻塞。

## 已本轮证明（站内）

| 项 | 说明 |
|---|---|
| **站内到期跟进待办** | `LeadCase.next_follow_at` + 作战台 `due_follow_ups` +「已处理」；见 `followup-reminders/`。**外部消息送达仍待接入**。 |
| **本功能重启持久化** | `e2e:followup` 在 `supervise.sh restart` 后仍保留归属、跟进时间与 open 待办。 |

## 待验证（PENDING_VERIFY）

| 项 | 为何不能勾已证明 | 建议复测 |
|---|---|---|
| **经理角色独立证明（全套件）** | 预约确认与跟进提醒套件已强制 manager；旧内部闭环痕迹需以最新 `e2e:internal`（已禁 admin 回退）为准。 | `npm run e2e:confirm-appt` / `e2e:followup` / `e2e:internal` |
| **外部到期提醒触达** | 站内待办 ≠ SMS/Call/Email/worker 到点外发。 | 查 worker/计划任务/reach attempt；接通真实凭据后另测 |
| **全库任意字段重启** | 跟进提醒套件已证本功能；未声称对历史所有表做完整 stop→start 审计。 | 按需扩大 |

## 主阻塞排序（内部试用）

1. **外部消息送达**（SMS/Call/Email）仍待接入 — 站内提醒已可用。
2. 上表待验证项。
3. **固定域名 / DNS / Cloudflare** — **待用户确认**，不是当前第一功能阻塞；本机 `:3100` + gateway `:18180` 可复测。

## 明确未声称

- 未声称生产稳定、可售、真实 SMS/Call/Email 已接通。
- ToC 落地页演示渠道 ≠ 内部销售闭环整体验收通过。
