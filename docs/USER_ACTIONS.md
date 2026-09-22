# 需要人工用户完成的步骤

1. **确认 GitHub 仓库可见性为 Public**  
   打开仓库 Settings → General → Danger Zone / Visibility，确认为 Public。

2. **DNS / 公网域名（可选）**  
   若要将落地页挂到自有域名：配置 A/CNAME → 反代到本机或云主机的 5173/80，并申请 TLS。

3. **真实短信 / 外呼供应商密钥（可选）**  
   在私有 `.env` 中设置供应商 API Key，并将 `REAL_SMS_ENABLED=true` 或 `REAL_CALL_ENABLED=true`。  
   **切勿**把密钥提交到 Git。未开启时通道一律 MOCK。

4. **Cursor Pro / Origin（可选）**  
   本演示不依赖 Cursor Origin/Pro；若要用云端 Agent 继续演进，需自行开通。

5. **修改演示密码**  
   克隆后务必改 `.env` 中 `DEMO_AGENT_PASSWORD`、`DEMO_ADMIN_PASSWORD`、`JWT_SECRET`。

6. **（可选）GitHub Pages**  
   若只需静态落地页展示，可另行导出 `/p/*` 为静态页并开启 Pages。
