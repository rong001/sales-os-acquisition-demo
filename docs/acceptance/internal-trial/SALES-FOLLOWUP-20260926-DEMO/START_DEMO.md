# 演示启动（内部试用）

## Bot / Linux 本机

```bash
cd /workspace/sales-os-app
# 确认未占用 Sub2API：不要启动到 15432/16379
test -f .env || cp .env.example .env   # 将 CHANGE_ME 换成本地演示口令
npm run build -w @sales-os/api
# 启动 API（若未在跑）: node apps/api/dist/main.js 或 npm run dev:api
# 启动 Web: npm run dev:web
# 启动 Worker（回收闲置）: npm run dev:worker

npm run seed
npm run seed:demo
npm run smoke:demo   # 期望 exit 0
```

浏览器打开 Web 根路径 → 登录页。密码只来自 `.env` / `.env.native` 的 `DEMO_*_PASSWORD`。

## Windows native

见 `START_WINDOWS.md` / `scripts/windows/native/Start-InternalTrial-Native.ps1`。  
额外：

```powershell
node scripts/seed-demo-packs.mjs --pack=all
node scripts/smoke-demo-walkthrough.mjs --base=http://127.0.0.1:39300
```

（端口以 `.env.native` 的 `NATIVE_API_PORT` 为准。）

## 切换故事包

```bash
node scripts/seed-demo-packs.mjs --pack=tele
node scripts/seed-demo-packs.mjs --pack=b2b
node scripts/seed-demo-packs.mjs --pack=finance
# 或一次全有：
node scripts/seed-demo-packs.mjs --pack=all
```

## 诚实开关

```
CALL_PROVIDER=mock   # 默认；REAL 无密钥 fail-closed
WECOM_MODE=mock      # 默认；REAL 需 WECOM_CORP_ID/AGENT_ID/SECRET
```
