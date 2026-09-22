# 销售获客 OS · 内部本地启动包（持有人自用）

**主交付：本目录 / 同级 `sales-os-internal-trial-local.tar.gz`。请在你自己的电脑上启动。**  
Bot 机器上的 `http://127.0.0.1:18180` **不能**当作你的试用入口。

## 按操作系统选择

| 系统 | 推荐方式 | 文档 |
|---|---|---|
| **Windows（推荐内部试用）** | Docker Desktop + PowerShell | **[START_WINDOWS.md](./START_WINDOWS.md)** |
| **Linux / macOS** | 同一套 Docker Compose，或本机 Node + `supervise.sh` | 见下方 |

### Windows（推荐）

见 **START_WINDOWS.md**：复制 `.env.internal-trial.example` → `.env`，运行 `scripts/windows/Start-InternalTrial.ps1`（成功条件含 Web `/api/health`），打开 `http://127.0.0.1:18180`。自检：`Test-InternalTrial.ps1`。

### Linux / macOS — Docker Compose（与 Windows 同栈）

```bash
cd sales-os-app
cp .env.internal-trial.example .env   # 填写 CHANGE_ME
docker compose -f docker-compose.internal-trial.yml --env-file .env up -d --build
# 浏览器: http://127.0.0.1:18180
# 停止保留数据: docker compose -f docker-compose.internal-trial.yml --env-file .env down
# 清空数据: ... down -v   （危险）
```

### Linux / macOS bash only — supervise.sh（非 Windows）

`scripts/supervise.sh` 依赖 `/proc`、`ss`、`pkill`、`nohup`，**不适用于 Windows PowerShell**。

```bash
cd sales-os-app
cp .env.example .env          # 由持有人本地填写；勿提交 .env
npm ci                       # 或 npm install
npm run build                # 若包内已有 apps/*/dist 可先跳过
bash scripts/supervise.sh restart
# 浏览器: http://127.0.0.1:18180
```

依赖（supervise 路径）：Node.js 20+、本机 PostgreSQL、Redis。

## 演示账号

见 `.env.internal-trial.example` / `.env.example` 中的 `DEMO_*`（`agent@demo.local` / `manager@demo.local` 等）；密码只存在你本地的 `.env`。

## 临时演示（非稳定、非用户本机）

跑本交付时仍可访问（HTTP 200），**仅二次参考**：

`https://cons-make-empire-treaty.trycloudflare.com`

不稳定、随时可能失效；**不是**用户本机入口。未新建 tunnel / 未购买服务。主路径永远是本启动包。

## 不含内容

- 不含 `.env`、真实密码、真实客户数据
- 不含 `node_modules`（Compose 路径由镜像构建；supervise 路径需本地 `npm ci`）
- 未新建 Cloudflare Named Tunnel / 付费服务
