# 项目矩阵（Demo 索引）

> 统一索引：抢票 · USGate · 获客。  
> 规则：链接仅在**实际可访问**后标「已交付」；否则「待发布」。  
> 不收录：凭据、订阅/付费链接、真实客户数据。  
> trycloudflare / quick tunnel **一律标临时**，不得写成稳定域名。

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 / 未通过项 |
|---|---|---|---|---|---|---|
| 抢票 | `rong001/ticket-grab-cloud` **仍私有** | [已交付 HTTPS](https://159.75.71.192:18444/)（2026-09-22 核验；旧 HTTP :18090 → 308） | 腾讯云轻量 Docker Compose + Caddy | **查票 live**；盯票/定时/协助登录+官方支付跳转；非授权代售；live≠自动购票 | **未通过**完整 ToC：公网自助注册、**真实成交/购票仍 stub/未通过** | 仓库未公开；真实购买闭环；合法边界 |
| USGate | [已交付 demo](https://github.com/rong001/usgate-demo) · [已交付 client](https://github.com/rong001/usgate-client) | [已交付 MOCK 门户](https://117.55.227.224:8443/)（Let’s Encrypt IP；**不连真 3X-UI**） | VPS + Caddy/门户 Compose；真面板为生产预期、演示未接 | 隧道/重连/流量已测；MOCK 门户公网可开；Android 源码仓已公开 | 门户公网 HTTPS 可访问；**真实面板/订阅未交付** | 真机安装；面板/商用凭据用户侧 |
| 获客（本仓库） | [已交付](https://github.com/rong001/sales-os-acquisition-demo) | 公网仍为 **临时** trycloudflare（以 `docs/acceptance/public-https/PUBLIC_URL.txt` 为准；重部署会换 URL） | **生产静态构建** + 受管进程（API :3100 / gateway :18180 托管 `web/dist`）+ 可选 cloudflared；Compose 文件有、本机无引擎则未实测 | 落地页（抢票+USGate）、UTM/邀请码、同意留资、去重、分配、跟进、预约、漏斗、管理导出；**触达/成单 MOCK/stub**；viewer 只读演示账号 | 本机 E2E + 负面用例；公网 HTTPS E2E（临时隧道） | 隧道临时；自定义域名需用户 DNS；Compose 引擎；真实触达/成交 |

## 更新记录

- 2026-09-22：获客推进「稳定可展示」ToC — 生产静态 gateway、supervise 受管进程、DB 备份/恢复、viewer 只读、负面验收；公网仍临时 trycloudflare。  
- 2026-09-22：抢票演示 `https://159.75.71.192:18444/`；仓仍私有；真实购票 stub。  
- 2026-09-22：USGate 两仓已交付 + MOCK 门户已交付；不连真 3X-UI。
