# Windows 原生内部试用（无 Docker / 无 WSL）

适用于 Windows 11 **没有 Docker Desktop** 的场景。使用仓库内隔离的
Postgres + Redis（仅 `127.0.0.1`，默认端口 **15432 / 16379**；可在
`.env.native` 改为例如 **55432 / 56379**），数据在 `.data/native/` —
**绝不**复用 Sub2API 的 `5432` / `6379`。

## 快速开始

```powershell
cd sales-os-app
.\scripts\windows\native\Fetch-NativeDeps.ps1   # 一次性：Redis 5+
.\scripts\windows\native\Start-InternalTrial-Native.ps1
# 浏览器: http://127.0.0.1:19280
.\scripts\windows\native\Test-InternalTrial-Native.ps1
.\scripts\windows\native\Stop-InternalTrial-Native.ps1
```

`Start` 若缺少 `.env.native` 会生成随机密钥（已 gitignore）。
**只有**经 Web 端口的 `GET /api/health` 返回 JSON `ok` + `sales-os-api`
才打印 OK。静态 SPA 的 200 **不算**就绪。

## 依赖

1. **Node.js 20+**（官方 MSI；含 npm）。Node 24.x / npm 11 亦可。
   若出现 `npm-missing`：安装官方 Node 后**重新打开** PowerShell。
2. **PostgreSQL 15/16/17** Windows 二进制：
   - PATH 上有 `pg_ctl` / `initdb` / `psql`，或
   - `vendor/windows/pgsql/bin/`（见 `Fetch-NativeDeps.ps1` 说明）
3. **Redis 5+**（worker 需要 Streams：`XGROUP` / `XADD`）：
   - **优先** `vendor/windows/redis/redis-server.exe`（`Fetch-NativeDeps.ps1`
     拉取 [tporadowski/redis](https://github.com/tporadowski/redis) **5.0.14.1**）
   - Redis **3.0.x**（如 3.0.504）**不够用**，Start/Test 会明确 FAIL
   - 不安装/不替换其它端口上的 Redis 服务

### 校验和策略（诚实）

`Fetch-NativeDeps.ps1`：若脚本内 **未钉扎**已知上游 SHA256，则只计算并记录
**本地 hash**，文案为 `LOCAL-ONLY-NOT-UPSTREAM-VERIFIED`，**不会**声称
“upstream verified” 或 “matched upstream”。仅当钉扎了已知校验和且比对相等时，
才说 “matched pinned checksum”。

## 隔离约定

| 项 | 行为 |
|---|---|
| 端口 | 默认 15432 / 16379 / 39300 / 19280；占用则 FAIL；可改 `.env.native` |
| 绑定 | Postgres/Redis/`API_HOST` → `127.0.0.1`（原生强制） |
| Docker | 容器不设 `API_HOST` 时 API 默认 `0.0.0.0`（与 bridge 兼容） |
| 数据 | `.data/native/pg` + `redis`；带 `SALES_OS_NATIVE_TRIAL.marker` |
| 日志 | `.data/native/logs/*.log`（独立文件，无 Start-Job 跨进程重定向） |
| 进程 | Hidden 窗口；Stop 前校验 PID 命令行/路径属于本仓库绝对路径 |
| Worker | Start 会启动 worker 并写入 `run/worker.pid`；Test 检查存活 |

## 与 Docker 路径关系

若已安装并可运行 Docker Desktop，优先用
`..\Start-InternalTrial.ps1` + `docker-compose.internal-trial.yml`。

## Parser / quality gate (maintainer)

Before shipping native script changes, parse **every** `.ps1` under `scripts/windows/`:

```powershell
Get-ChildItem .\scripts\windows -Recurse -Filter *.ps1 | ForEach-Object {
  $t=$null; $e=$null
  [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$t, [ref]$e)
  if ($e.Count) { "FAIL $($_.FullName)"; $e | ForEach-Object { $_.Message } } else { "PASS $($_.Name)" }
}
```

Optional harness (PS 5.1 / pwsh 7):

```powershell
.\scripts\windows\native\tests\Test-NativeCommon-Harness.ps1
```

Covers: no bare `Test-Path A -or Test-Path B`, no `$Host`/`$PID` params, Redis INFO
multi-line join before `-match`, `Start-Process` ArgumentList quoting for paths with spaces.
