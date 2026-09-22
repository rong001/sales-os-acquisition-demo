# 需要人工用户完成的步骤

1. **确认 GitHub 仓库可见性为 Public**  
   打开仓库 Settings → General → Danger Zone / Visibility，确认为 Public。

2. **自定义域名 / 稳定公网 HTTPS（可选）**  
   当前公网演示使用 **cloudflared quick tunnel**（`*.trycloudflare.com`），URL **临时**：重跑 `scripts/deploy-public-https.sh` 或隧道进程退出后会更换。  
   若要挂自有域名：在 Cloudflare（或等价）配置 Named Tunnel / DNS CNAME → 指向本机 gateway `127.0.0.1:18180`（或云主机反代），并更新 `docs/PROJECT_MATRIX.md` 获客「线上演示」链接。  
   Agent **无法**代办：账号下的自定义域名购买、DNS 所有权验证、长期 Named Tunnel 凭证保管。

3. **真实短信 / 外呼供应商密钥（可选）**  
   在私有 `.env` 中设置供应商 API Key，并将 `REAL_SMS_ENABLED=true` 或 `REAL_CALL_ENABLED=true`。  
   **切勿**把密钥提交到 Git。未开启时通道一律 MOCK。

4. **Cursor Pro / Origin（可选）**  
   本演示不依赖 Cursor Origin/Pro；若要用云端 Agent 继续演进，需自行开通。

5. **修改演示密码**  
   克隆后务必改 `.env` 中 `DEMO_AGENT_PASSWORD`、`DEMO_ADMIN_PASSWORD`、`JWT_SECRET`。

6. **（可选）GitHub Pages**  
   若只需静态落地页展示，可另行导出 `/p/*` 为静态页并开启 Pages。

7. **（可选）本机安装 Docker 引擎**  
   Compose 文件已提供；无 Docker CLI/引擎时只能用本地 Postgres + npm。
