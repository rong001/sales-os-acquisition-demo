# 需要人工用户完成的步骤

## 域名与 DNS/Cloudflare（条件待用户确认）— 本环境无法代办

> **禁止**替用户断言「暂无域名 / 没有域名 / 固定域名待用户」。  
> 正确表述：**域名与 DNS/Cloudflare 条件待用户确认**。固定域名未启用；Named Tunnel 占位已备，启用前须用户确认域名与 DNS/Cloudflare。

以下为**条件待确认时的步骤清单**（按用户实际持有情况勾选执行）：

| # | 条件 | 若成立则执行 |
|---|---|---|
| 1 | **若持有域名** | 选定用于公网 HTTPS 的主机名（例：`leads.example.com`）；记下拟映射的 `DOMAIN` |
| 2 | **若 DNS 在 Cloudflare** | 在 Cloudflare 控制台创建 Named Tunnel；将主机名 **CNAME** 到 `<TUNNEL_ID>.cfargotunnel.com`（或以控制台提示为准） |
| 3 | **若 DNS 不在 Cloudflare** | 先将域名 NS 迁入 Cloudflare，或在现有 DNS 提供商按 Cloudflare Tunnel 文档配置 CNAME/路由；仍须 Cloudflare 账号登录以创建 Tunnel |
| 4 | **若已创建 Named Tunnel** | 下载凭证 JSON 到本机**私有**路径（勿提交 git）；设置 `DOMAIN` / `TUNNEL_ID` / `CRED_PATH` 后执行 `bash scripts/deploy-named-tunnel.sh`（见 `docs/PROD_HTTPS.md`） |
| 5 | **若暂不启用固定域名** | 继续使用临时 trycloudflare 演示（`docs/acceptance/toc-prod/PUBLIC_URL.txt`）；**不得**在矩阵声称已有固定生产域名 |

在域名与 DNS/Cloudflare **条件未由用户确认并完成启用**前：临时 URL 仅以 `PUBLIC_URL.txt` 为准；整体验收结论须写 **「临时演示可维护；固定域名与独立端到端验收未通过」**。

---

1. **确认 GitHub 仓库可见性为 Public**  
   Settings → General → Visibility = Public。

2. **固定域名公网 HTTPS（上表条件清单）**  
   当前公网演示使用 **cloudflared quick tunnel**（`*.trycloudflare.com`），URL **临时**。Named Tunnel 占位已备，启用前须用户确认域名与 DNS/Cloudflare。

3. **真实短信 / 外呼 / 邮件供应商密钥（可选）**  
   私有 `.env`：`REAL_SMS_ENABLED` / `REAL_CALL_ENABLED` / `REAL_EMAIL_ENABLED` + 对应 Key/`SMTP_*`。  
   未开启一律 MOCK；邮件无 SMTP → **未送达**（非成功 MOCK）。**勿**提交密钥。演示勿对真实客户发送。

4. **修改演示密码（必做）**  
   `DEMO_AGENT_PASSWORD` / `DEMO_ADMIN_PASSWORD` / `DEMO_VIEWER_PASSWORD` / `JWT_SECRET`。  
   公开文档只写邮箱：`agent@demo.local` / `admin@demo.local` / `viewer@demo.local`。

5. **（可选）本机安装 Docker 引擎**

6. **抢票 / USGate**  
   - 抢票仓 tip `9ee80b0`；现网 `/intake`；机票与邮件阻塞见矩阵。  
   - USGate MOCK 门户可访问；真面板/真机仍需用户侧验收；demo`809bf29` / client`53a9afb`。
