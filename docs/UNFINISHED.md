# 未完成 / 有意延后

| 项 | 说明 |
|---|---|
| 真实短信/外呼供应商 | 仅脚手架：`REAL_SMS_ENABLED` / `REAL_CALL_ENABLED` + 密钥环境变量；默认 MOCK |
| 成单 Order 全链路 | `ordered` 漏斗位为 stub（表已有，无支付/证据闭环） |
| 多租户自助开通 | 演示固定 `slug=demo` 租户 |
| 自定义域名 / 稳定隧道 | 公网 HTTPS 演示已用 trycloudflare 交付（临时）；Named Tunnel + 自有域名需用户 DNS/凭证，见 `USER_ACTIONS.md` |
| GitHub Pages 静态落地页 | 可选；当前以 Vite SPA + gateway/cloudflared 为主 |
| Worker 全量回放与死信 | outbox + Redis Streams 基础已有，运维面板未做 |
| 细粒度 RBAC | 现仅 agent / admin（supervisor 映射 admin） |
| i18n 完整英文 | 落地页含少量英文产品名，UI 以中文为主 |
| Compose 实测 | 仓库含 `docker-compose.yml`；本机无 Docker 引擎故未实测 |
