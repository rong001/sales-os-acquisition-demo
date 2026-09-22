# 项目矩阵（Demo 索引）

> 统一索引：抢票 · USGate · 获客。  
> 规则：链接仅在**实际可访问**后标「已交付」；否则「待发布」。  
> 不收录：凭据、订阅/付费链接、真实客户数据。

| 项目 | 仓库 | 线上演示 | 部署方式 | 当前能力 | 验收状态 | 阻塞 / 未通过项 |
|---|---|---|---|---|---|---|
| 抢票 | 待发布（`rong001/ticket-grab-cloud` 仍私有） | [已交付 HTTPS](https://159.75.71.192:18444/)（2026-09-22 核验 HTTP/2 200；旧 HTTP :18090 会 308 跳转） | 腾讯云轻量 Docker Compose + Caddy | 查票/盯票/定时/协助登录+官方支付跳转；非授权代售；live≠自动购票 | **未通过**完整 ToC：公网自助注册、真实购买闭环等仍有缺口 | 仓库未公开；公网注册/真实购买验收缺口；合法边界 |
| USGate | [已交付 demo](https://github.com/rong001/usgate-demo) · [已交付 client](https://github.com/rong001/usgate-client) | 待发布（勿将 VPS IP/面板口当公开 demo；Bot 称 IP 证书已签发，**门户 URL 待对方提供可核验地址后再标已交付**） | 预期：VPS + 3X-UI + Compose/Caddy + Android APK | 隧道/重连/流量已测；门户可本地 mock；Android 源码仓已公开 | 隧道 PASS；真机 Android E2E BLOCKED；门户公网 MIXED | 无已核验对公门户 URL；真机安装；面板/商用凭据用户侧 |
| 获客（本仓库） | [已交付](https://github.com/rong001/sales-os-acquisition-demo) | [已交付](https://shoes-midnight-reload-noted.trycloudflare.com)（cloudflared quick tunnel；**临时域名**） | 本机 npm + `deploy/public-gateway.mjs` :18180 + cloudflared；Compose 文件有、本机构建引擎未装故 Compose 未实测 | 落地页（抢票+USGate）、UTM/邀请码、同意留资、去重、分配、跟进、预约、漏斗、管理导出；触达标 MOCK | 本机 E2E **PASS**；公网 HTTPS E2E **PASS**（见 `docs/acceptance/public-https/E2E.md`） | trycloudflare 临时；自定义域名需用户 DNS；Compose 引擎 |

## 更新记录

- 2026-09-22：获客公网 HTTPS E2E PASS；矩阵标已交付 `https://shoes-midnight-reload-noted.trycloudflare.com`（临时隧道，重跑 `scripts/deploy-public-https.sh` 换新 URL）。  
- 2026-09-22：抢票演示改为核验通过的 `https://159.75.71.192:18444/`；明确 ToC 注册/真实购买等未通过项。  
- 2026-09-22：USGate 增加 `usgate-client`；仓库已交付；演示仍待发布（证书声称≠已交付 URL；仍无对公门户 URL）。  
- 2026-09-22：获客标明「本机 E2E≠公网可用」；公网 HTTPS 部署中 → 已完成。
