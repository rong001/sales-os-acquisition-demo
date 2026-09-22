# 内部试用独立勾选清单

> 焦点：**内部销售获客与跟进**。ToC 落地页仅为演示渠道。  
> 域名与 DNS/Cloudflare：**待用户确认**（本清单固定域名项保持未勾选）。

## 内部闭环

- [x] 合成线索录入（含 UTM/channel/invite/manual_import 说明）
- [x] 去重（同手机 `merged=true`）
- [x] 经理分配给不同销售
- [x] 销售跟进 + 下次提醒（预约 / `next_follow_at`）
- [x] 商机/成交结果标记（won/nurture 等）
- [x] 经理查看双方结果
- [x] 销售不可见其他销售客户（403 负面）
- [ ] 进程重启后持久化（本轮 E2E 时间紧跳过；可用 `npm run e2e` 覆盖）
- [x] 备份脚本存在（`scripts/backup-db.sh`）

## 环境 / 发布

- [x] 本机 API :3100 + gateway :18180 可复测
- [ ] 固定域名启用（**域名与 DNS/Cloudflare 条件待用户确认**）
- [ ] Named Tunnel 生产凭证
- [ ] 真实 SMS/Call/Email 凭据（试用可用 MOCK）

## 诚实边界（勿勾「可售 / 生产稳定」）

- [ ] 不宣称生产稳定已完成
- [ ] 不宣称可售
- [ ] ToC 抢票/USGate 落地页 ≠ 本系统整体验收通过
