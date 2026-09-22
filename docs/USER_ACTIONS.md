# 需要人工用户完成的步骤

## 最终阻塞（固定生产域名）— 本环境无法代办

| # | 阻塞项 | 说明 |
|---|---|---|
| 1 | **Cloudflare 登录** | 本环境无 1Password Cloudflare、无用户会话；无法代建 Named Tunnel |
| 2 | **域名 DNS CNAME** | 用户持有域名后，将主机名 CNAME 到 `<TUNNEL_ID>.cfargotunnel.com`（或按控制台提示） |
| 3 | **Named Tunnel 凭证安装** | 控制台下载凭证 JSON → 本机私有路径；设置 `DOMAIN` / `TUNNEL_ID` / `CRED_PATH` 后执行 `bash scripts/deploy-named-tunnel.sh`（见 `docs/PROD_HTTPS.md`） |

在以上三项完成前：**不得**在矩阵或对外文案声称已有固定生产域名；临时 URL 仅以 `PUBLIC_URL.txt` 为准。

---

1. **确认 GitHub 仓库可见性为 Public**  
   Settings → General → Visibility = Public。

2. **自定义域名 / 稳定公网 HTTPS（上表）**  
   当前公网演示使用 **cloudflared quick tunnel**（`*.trycloudflare.com`），URL **临时**。

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
