# 内部试用 · Windows 启动（Docker Desktop + PowerShell）

**推荐路径。** 本机需已安装并运行 **Docker Desktop**；脚本**不会**替你安装。

## 依赖

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装且托盘图标显示 Running  
2. PowerShell 5.1+（Windows 自带即可）

若 `docker` 命令不存在或 `docker info` 失败：**到此停止**，先装好/启动 Docker Desktop，再继续。

## 最短步骤

```powershell
cd sales-os-app
copy .env.internal-trial.example .env
# 用记事本编辑 .env：把所有 CHANGE_ME 改成你的本地密码（勿提交、勿外传）

.\scripts\windows\Start-InternalTrial.ps1
# 等价手动：
# docker compose -f docker-compose.internal-trial.yml --env-file .env up -d --build
```

浏览器打开：

```text
http://127.0.0.1:18180
```

（API 经 Web 的 `/api`；可选直连 `http://127.0.0.1:3100`。）

演示账号邮箱见 `.env.internal-trial.example` 注释（`manager@demo.local` / `agent@demo.local` 等）；密码仅在你本地的 `.env`。

## 首次初始化

- Postgres / Redis 使用 Docker **命名卷**；首次 `up` 会执行 `scripts/sql/001_schema.sql`，API `SEED_ON_BOOT=true` 写入演示账号。
- 之后 **stop / start（不加 `-v`）会保留数据**。

## 停止 / 清空

```powershell
# 停止容器，保留卷（推荐）
.\scripts\windows\Stop-InternalTrial.ps1
# 或: docker compose -f docker-compose.internal-trial.yml --env-file .env down

# 危险：连同卷删除（清空库）——仅当你明确要 wipe
.\scripts\windows\Stop-InternalTrial.ps1 -WipeVolumes
# 或: docker compose -f docker-compose.internal-trial.yml --env-file .env down -v
```

## 说明

- Postgres / Redis **不**映射到宿主机端口（仅容器内网）。
- 发布端口仅绑定 `127.0.0.1`。
- **不要**用 `bash scripts/supervise.sh`（依赖 `/proc`、`ss`、`pkill`、`nohup`，**不适用于 Windows PowerShell**）。
