# 项目矩阵（Demo 索引）

> 统一索引：抢票 · USGate · 获客。  
> 规则：链接仅在**实际可访问**后标「已交付」；否则「待发布」。  
> 不收录：凭据、订阅/付费链接、真实客户数据。  
> trycloudflare / quick tunnel **一律标临时**，不得写成稳定域名。  
> **不虚称可售**：产品能力以现网 health/capabilities 与下文诚实句为准。  
> **域名措辞**：写「域名与 DNS/Cloudflare 条件待用户确认」；禁止「暂无域名 / 用户没有域名 / 固定域名待用户」等替用户断言所有权的措辞。

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 / 未通过项 |
|---|---|---|---|---|---|---|
| 抢票 | [已交付](https://github.com/rong001/ticket-grab-cloud-demo)（公开仓 tip **`9ee80b0`**；历史基线曾引用 `88f93f3`） | [已交付 HTTPS](https://159.75.71.192:18444/) · [/intake](https://159.75.71.192:18444/intake) · [/capabilities](https://159.75.71.192:18444/capabilities)（2026-09-22 核验） | 腾讯云轻量 Docker Compose + Caddy | **火车**公开余票 live 可用（京南→沪虹桥 liveOk；provider=train12306；trainRealSubmit=false）；**机票实时可售/票价监控不可用**（flightInventoryLive=false / flightFareMonitor=false；OpenSky≠票源）；**邮件通知未实达**（SMTP→127.0.0.1:587 ECONNREFUSED；emailed=false — 阻塞，非成功 MOCK）；非未授权代购；真实成交 stub | **未通过**完整 ToC / 产品端到端独立验收；不虚称自动购票 | 机票库存 Key；SMTP 实达；真实购票闭环；合法边界 |
| USGate | [demo](https://github.com/rong001/usgate-demo) tip **`809bf29`** · [client](https://github.com/rong001/usgate-client) tip **`53a9afb`** | [已交付 MOCK 门户](https://117.55.227.224:8443/)（Let’s Encrypt IP；**mock_xui:true**；**不连真 3X-UI**） | VPS + Caddy/门户 Compose；真面板为生产预期、演示未接 | MOCK 门户公网可开；隧道/重连/流量已测（演示）；脱敏源码已公开 | 门户 HTTPS 可访问；**真实面板/订阅/真机未交付** — **不可标 ToC 真实可用/可售** | 真面板验收；真订阅；真机出口证据；GH Actions CI；商用凭据用户侧 |
| 获客（本仓库） | [已交付](https://github.com/rong001/sales-os-acquisition-demo) | 公网仍为 **临时** trycloudflare（以 `docs/acceptance/toc-prod/PUBLIC_URL.txt` 或 `toc-stable/PUBLIC_URL.txt` / `public-https/PUBLIC_URL.txt` 为准；重部署会换 URL）。**固定域名未启用（条件待用户确认）** | 生产静态 dist + gateway :18180 + supervise；Named Tunnel 配置/脚本已备（`docs/PROD_HTTPS.md`），启用前须用户确认域名与 DNS/Cloudflare；Compose 有、本机无引擎则未实测 | **内部销售获客与跟进可用（本机可复测）** + 临时公网演示：落地页（演示≠正式合同 + 抢票/USGate 诚实边界）、SEO `/c/:slug`、UTM/邀请码/渠道短链 `/r/:code`、同意证据（含 hash/IP/UA/渠道）、限流 429、去重、分配/跟进/预约/**结果标记**、漏斗+来源转化、活动/渠道/邀请码管理、审计只读列表、viewer RBAC；触达 SMS/Call **MOCK**；邮件无 SMTP → **未送达**标签 | **内部销售闭环**（录入→去重→分配→跟进/提醒→结果→经理查看 + 跨销售 403）有 `docs/acceptance/internal-trial/` 复测证据。ToC 落地页仅为演示进线渠道，**非**整体 Done。不依赖域名的公开页切片见 `toc-prod/SELF_RETEST.md`。**整体：临时演示可维护；固定域名与独立端到端未通过** — 勿写「生产稳定」或「可售」 | 域名与 DNS/Cloudflare 条件待用户确认；Named Tunnel 凭证；真实触达凭据；Compose 引擎；用户侧独立端到端勾选 |

## 更新记录

- 2026-09-22：验收焦点澄清为 **内部销售获客与跟进**（录入→去重→分配→跟进/提醒→结果→经理查看 + RBAC）；ToC 落地页为演示渠道非整体 Done；补 `docs/acceptance/internal-trial/` 与 `e2e:internal`；销售跨坐席直读返回 403。域名条件仍待用户确认。  
- 2026-09-22：措辞修正 — 域名条件待确认；整体未通过固定域名与独立端到端；补充自助复测与脱敏证据。  
- 2026-09-22：获客 ToC 增量 — 限流、内容页、渠道/邀请/活动、结果标记、来源转化、审计 API、Named Tunnel 占位；矩阵抢票 tip `9ee80b0`（机票不可用、邮件未实达）；USGate tip demo`809bf29` / client`53a9afb`。  
- 2026-09-22：获客「稳定可展示」切片 — 生产静态 gateway、supervise、viewer、负面验收；公网仍临时。  
- 2026-09-22：抢票/USGate 诚实边界写入落地页与矩阵。
