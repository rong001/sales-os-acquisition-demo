# 内部试用独立勾选清单

> 焦点：**内部销售获客与跟进**。ToC 落地页仅为演示渠道。  
> 域名与 DNS/Cloudflare：**待用户确认**（不是当前第一阻塞；见 `CAVEATS.md`）。

## 内部闭环

- [x] 合成线索录入（含 UTM/channel/invite/manual_import 说明）
- [x] 去重（同手机 `merged=true`）
- [x] 经理分配给不同销售
- [x] 销售跟进 + 下次提醒字段写入（预约 / `next_follow_at`）
- [x] **站内到期跟进待办**（可查询 due 列表 + 作战台 UI + 已处理不再重复）— `npm run e2e:followup`；**外部消息送达仍待接入**
- [x] 商机/成交结果标记（won/nurture 等）
- [x] 经理查看双方结果
- [x] 销售不可见其他销售客户（403 负面）
- [x] 预约确认鉴权前置（非归属 403；已确认亦不可幂等捷径；孤儿 404）— `npm run e2e:confirm-appt`
- [x] 进程重启后持久化（**跟进提醒本功能已证**；`e2e:followup` + restart）
- [x] 备份脚本存在（`scripts/backup-db.sh`）

## 环境 / 发布

- [x] 本机 API :3100 + gateway :18180 可复测
- [ ] 固定域名启用（**域名与 DNS/Cloudflare 条件待用户确认**；非第一功能阻塞）
- [ ] Named Tunnel 生产凭证
- [ ] 真实 SMS/Call/Email 凭据（试用可用 MOCK）

## 待验证（勿勾已完成）

- [x] 经理角色：跟进提醒 / 预约确认套件强制 `manager@`（禁止静默 admin 回退）
- [ ] `next_follow_at` → **外部**到期提醒触达（站内已 PASS；SMS/Call/Email 待接入）
- [x] 重启持久化实操复测（跟进提醒套件）

## 诚实边界（勿勾「可售 / 生产稳定」）

- [ ] 不宣称生产稳定已完成
- [ ] 不宣称可售
- [ ] ToC 抢票/USGate 落地页 ≠ 本系统整体验收通过
