# 内部试用 · Windows 启动

两条路径（二选一）：

| 条件 | 路径 | 入口 |
|---|---|---|
| 已安装并运行 **Docker Desktop** | **A. Docker Compose（推荐）** | `.\scripts\windows\Start-InternalTrial.ps1` |
| **无 Docker / 无 WSL**（或 Desktop 不可用） | **B. Windows 原生 Node + 隔离 PG/Redis** | `.\scripts\windows\native\Start-InternalTrial-Native.ps1` |

本机验收以 **本机** `http://127.0.0.1:…` 为准；Bot Linux ≠ 你的 Windows，勿把远端 bot 端口当试用入口。

脚本**不会**打印 SUCCESS/OK，除非 `GET /api/health`（经 Web 端口）返回 JSON `ok: true` 且 `service: sales-os-api`。静态 SPA 的 200 **不算**就绪。

---

## A. Docker Desktop + PowerShell（推荐）

### 依赖

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安装且托盘 Running  
2. PowerShell 5.1+

若 `docker` 不存在或 `docker info` 失败：改走 **B. 原生路径**，或先装好 Desktop。

### 最短步骤

```powershell
cd sales-os-app
copy .env.internal-trial.example .env
# 编辑 .env：把所有 CHANGE_ME 改成本地密码（勿提交、勿外传）

.\scripts\windows\Start-InternalTrial.ps1
```

成功后浏览器：

```text
http://127.0.0.1:18180
```

自检：`.\scripts\windows\Test-InternalTrial.ps1`  
停止（保留数据）：`.\scripts\windows\Stop-InternalTrial.ps1`  
清空数据：`.\scripts\windows\Stop-InternalTrial.ps1 -WipeVolumes`（危险）

Postgres/Redis **不**映射到宿主机（仅容器内网）。发布端口仅 `127.0.0.1`。

演示账号邮箱见 `.env.internal-trial.example` 注释；密码仅在本地 `.env`。

### Linux 破网兜底（仅 Linux bot / 破 bridge；非 Windows Desktop）

若容器间 TCP 超时，Linux 可用：

```bash
docker compose -f docker-compose.internal-trial.yml \
  -f docker-compose.internal-trial.linux-hostnet.yml \
  --env-file .env up -d --build
```

该 overlay 把 PG/Redis **仅**绑到 `127.0.0.1` 高位端口，api/web 用 host 网络回环访问。**不要**用于把数据库暴露到公网。

---

## B. Windows 原生（无 Docker）

详见 [`scripts/windows/native/README.md`](./scripts/windows/native/README.md)。

```powershell
cd sales-os-app
# 一次性：Redis 5+ → vendor\windows\redis\（Postgres 见 native README）
.\scripts\windows\native\Fetch-NativeDeps.ps1
.\scripts\windows\native\Start-InternalTrial-Native.ps1
# 浏览器默认: http://127.0.0.1:19280
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Stop-InternalTrial-Native.ps1
```

隔离约定：

- 端口默认 **55433 / 56380 / 39300 / 19280**（拒绝 5432/6379；避免 Sub2API/Garnet 的 **15432 / 16379**；可在 `.env.native` 改为例如 **55432 / 56379** 若空闲）
- **API_HOST=127.0.0.1**（原生强制 loopback；Docker 不设则默认 `0.0.0.0`）
- **Redis 5+**（worker 需要 Streams；3.0.x 会 FAIL；用 `Fetch-NativeDeps.ps1` 拉 tporadowski 5.0.14.1 到 `vendor/windows/redis/`）
- 数据目录：仓库内 `.data/native/`（带 marker；不覆盖外来数据目录）
- 日志：`.data/native/logs/`；Stop 前校验 PID 属于本仓库路径
- 密钥：本地 `.env.native`（gitignored；启动脚本可自动生成随机值）
- Node：官方 MSI（含 npm）。曾出现 `npm-missing` 时请装官方 Node 后重开终端

**切勿**复用已有 Sub2API/Garnet 的数据目录或端口（常见 **15432 / 16379**）。端口占用时 Start **明确 FAIL**，不杀占用进程、不改写外来库。解压覆盖源码时保留 `.env.native` 与 `.data/`。校验和：未钉扎上游 SHA256 时只记本地 hash，不宣称 upstream verified。

---

## Codex / 自动化反馈环（给本地代理）

1. 先跑健康门禁（Docker：`Test-InternalTrial.ps1`；原生：`Test-InternalTrial-Native.ps1`）。  
2. 门禁失败 → **禁止**宣称可用；按脚本分类（`docker-not-running` / `api-or-db-not-ready` / `web-proxy-broken` / `port-collision`）修复后重试。  
3. 门禁通过后再做浏览器登录（在 `/login` **键入**账号，禁止 localStorage 注入）。  
4. 业务回归可参考 `docs/acceptance/internal-trial/SALES-MASTER-20260923/`；本轮修复证据见 `SALES-FOLLOWUP-20260923-1000/`（Linux bot hostnet；Windows 需本机复测）。

---

## 说明

- **不要**用 `bash scripts/supervise.sh`（依赖 `/proc`/`ss`/`pkill`，不适用于 Windows PowerShell）。  
- 不买新付费服务；不群发邮件/电话/私信；不买线索。  
- 不含真实客户数据；合成线索与 `source_type=public_web_sample` 公开样例已区分标注。
