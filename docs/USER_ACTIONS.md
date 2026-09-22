# 需要人工用户完成的步骤

1. **确认 GitHub 仓库可见性为 Public**  
   Settings → General → Visibility = Public。

2. **自定义域名 / 稳定公网 HTTPS（可选，Agent 无法代办）**  
   当前公网演示使用 **cloudflared quick tunnel**（`*.trycloudflare.com`），URL **临时**：重跑 `scripts/deploy-public-https.sh` 或隧道退出后会更换。  
   若要挂自有域名，请在用户侧 Cloudflare 账号完成：
   1. 开通 **Named Tunnel**（非 quick tunnel），记下 Tunnel ID 与凭证文件（勿提交到 git）。  
   2. 配置 Public Hostname：例如 `sales-demo.example.com` → 服务 `http://127.0.0.1:18180`。  
   3. DNS：为该主机名添加 CNAME 到 `<tunnel-id>.cfargotunnel.com`（或按控制台提示）。  
   4. 本机用 `cloudflared tunnel run <name>`（或等价服务）替代 quick tunnel。  
   5. 更新 `docs/PROJECT_MATRIX.md` 获客「线上演示」链接为该稳定域名，并去掉「临时」标注。  
   Agent **无法**代办：域名购买、DNS 所有权验证、长期 Named Tunnel 凭证保管。

3. **真实短信 / 外呼供应商密钥（可选）**  
   私有 `.env` 设置供应商 Key，并 `REAL_SMS_ENABLED=true` / `REAL_CALL_ENABLED=true`。未开启一律 MOCK。**勿**把密钥提交到 Git。

4. **修改演示密码（必做）**  
   克隆后务必改 `.env`：`DEMO_AGENT_PASSWORD`、`DEMO_ADMIN_PASSWORD`、`DEMO_VIEWER_PASSWORD`、`JWT_SECRET`。  
   公开文档只写邮箱：`agent@demo.local` / `admin@demo.local` / `viewer@demo.local`。

5. **（可选）本机安装 Docker 引擎**  
   无引擎时用本地 Postgres + npm 生产构建。

6. **（可选）Cursor Pro / Origin**  
   本演示不依赖。
