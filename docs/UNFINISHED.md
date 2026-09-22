# 未完成 / 有意延后

| 项 | 说明 |
|---|---|
| 真实短信/外呼供应商 | 脚手架：`REAL_SMS_ENABLED` / `REAL_CALL_ENABLED`；默认 **MOCK**；需 Key 才允许实发（演示仍只用合成） |
| 真实邮件 | `REAL_EMAIL_ENABLED` 默认 false；无 `SMTP_HOST` 时邮件尝试标 **UNDELIVERED_NO_SMTP**（阻塞/未送达，**不是**成功 MOCK） |
| 成单 Order 全链路 | `ordered` 漏斗位为 **stub**（无支付/证据闭环）；结果可用 won/lost/invalid 标记 |
| 多租户自助开通 | 演示固定 `slug=demo` |
| **固定域名 / Named Tunnel** | 配置与脚本已备（`docs/PROD_HTTPS.md`）；公网演示仅为 **临时** trycloudflare；**域名与 DNS/Cloudflare 条件待用户确认** — 固定域名未启用；Named Tunnel 占位已备，启用前须用户确认（见 `USER_ACTIONS.md`） |
| GitHub Pages 静态落地页 | 可选；当前以生产 dist + gateway/cloudflared 为主 |
| Worker 运维面板 | outbox + Redis Streams 基础已有 |
| i18n 完整英文 | UI 以中文为主 |
| Compose 实测 | 有 `docker-compose.yml`；本机无 Docker 引擎则未实测 |
| 抢票真实成交 / 自动购票 | stub；机票库存/票价监控不可用；邮件未实达；公开仓 tip `9ee80b0` |
| USGate 真实面板/订阅/真机 | 未交付；MOCK 门户 demo@`809bf29` client@`53a9afb`；不可标可售 |
| **独立端到端验收** | 浏览器表单 / 线索流转 / 备份恢复已提供自助复测与脱敏证据；**整体独立端到端验收未通过**（见 `docs/acceptance/toc-prod/INDEPENDENT_CHECKLIST.md`） |
