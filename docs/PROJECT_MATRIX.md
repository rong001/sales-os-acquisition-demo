# 项目矩阵（Demo 索引）

> 统一索引：抢票 · USGate · 获客。  
> 规则：链接仅在**实际可访问**后标「已交付」；否则「待发布」。  
> 不收录：凭据、订阅/付费链接、真实客户数据。

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 |
|---|---|---|---|---|---|---|
| 抢票 | 待发布（`rong001/ticket-grab-cloud` 仍私有，对外 404） | [已交付](http://159.75.71.192:18090/)（HTTP 200，非 HTTPS；2026-09-22 核验） | 腾讯云轻量 Docker Compose（api/worker/web/postgres/redis + Caddy） | 多通道查票/盯票；定时抢票任务；站内协助登录与官方支付跳转。非授权代售；live≠自动购票 | **未通过** ToC 自助闭环（修复中） | 仓库未公开；HTTPS/域名；合法边界；访客闭环复测 |
| USGate | 待发布（本地 `usgate-demo` 已备，尚未 push 公开） | 待发布（无对公门户；勿将 VPS IP/面板口当公开 demo） | 预期：VPS Ubuntu + 3X-UI（VLESS Reality）；门户 Docker Compose/deploy.sh + Caddy；Android 本地 APK | 服务端隧道可用（出口 IP/重连/流量计数已测）；门户+管理端可本地 mock；Android 品牌 APK 已构建；限速依赖面板 | 隧道/重连/流量 PASS；真机 Android E2E BLOCKED；HTTPS MIXED | 公开仓未推；无域名/LE 证书；真机安装；面板改密与商用凭据需用户侧 |
| 获客（本仓库） | 待发布（公开仓推送中） | 本地可跑；公网演示待发布 | Docker Compose / 本地 npm（见 README） | 落地页（抢票+USGate）、UTM/邀请码、同意留资、去重、分配、跟进、预约、漏斗、管理导出；触达标 MOCK | E2E **PASS**（本地重启持久化，见 docs/acceptance/E2E.md） | 公网 URL；Compose 视环境 |

## 更新记录

- 2026-09-22：抢票演示 URL HTTP 200 核验后标「已交付」；仓库待发布。  
- 2026-09-22：美国VPS/USGate 回传 — 仓与演示均「待发布」；能力与验收按对方声明摘要，不含凭据。
- 2026-09-22：获客本地 E2E + API 重启持久化 PASS；公开仓推送后更新仓库列。
