# 未完成 / 有意延后

| 项 | 说明 |
|---|---|
| 真实短信/外呼供应商 | 仅脚手架：`REAL_SMS_ENABLED` / `REAL_CALL_ENABLED`；默认 **MOCK** |
| 成单 Order 全链路 | `ordered` 漏斗位为 **stub**（无支付/证据闭环） |
| 多租户自助开通 | 演示固定 `slug=demo` |
| 自定义域名 / Named Tunnel | 公网演示仅为 **临时** trycloudflare；稳定域名见 `USER_ACTIONS.md` |
| GitHub Pages 静态落地页 | 可选；当前以生产 dist + gateway/cloudflared 为主 |
| Worker 运维面板 | outbox + Redis Streams 基础已有 |
| 细粒度 RBAC | 现 agent / admin / **viewer（只读）**（supervisor 映射 admin） |
| i18n 完整英文 | UI 以中文为主 |
| Compose 实测 | 有 `docker-compose.yml`；本机无 Docker 引擎则未实测 |
| 抢票真实成交 / 自动购票 | stub / 未通过；公开仓 [ticket-grab-cloud-demo](https://github.com/rong001/ticket-grab-cloud-demo)（`88f93f3`）已交付演示边界 |
| USGate 真实面板/订阅 | 未交付；演示为 MOCK 门户 |
