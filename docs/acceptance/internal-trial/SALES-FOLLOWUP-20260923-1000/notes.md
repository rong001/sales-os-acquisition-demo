# SALES-FOLLOWUP-20260923-1000 — Windows 原生反馈修复

Pack tip parent: `2597920`（SALES-MASTER）。本目录为 **Linux bot 侧**验证与变更说明。
**不宣称**用户 Windows 本机 PASS（需 Codex 在用户 PC 复测）。

## 用户 Windows 反馈（事实）

- 前包 `sales-os-internal-trial-local-20260923-master.tar.gz` 4809719 bytes，SHA256 `46fe4844…0fac` 已独立核验。
- 首次原生 Start：`npm-missing` exit 1；安装官方 Node 24.21.0 / npm 11.19.0 后 `npm ci` + 全量 build exit 0。
- 隔离 PG17 `127.0.0.1:55432`、Redis `56379` AUTH/PING OK；Sub2API 未动。
- **未达验收**：API 硬绑 `0.0.0.0`、Redis 3.x 不足 Streams、Start-Job 日志/无 worker、Stop PID 不安全等。

## 本轮修复根因对照

| # | 问题 | 修复 |
|---|---|---|
| 1 | `main.ts` 硬编码 `listen(port,'0.0.0.0')` | `API_HOST` env；未设默认 `0.0.0.0`（Docker）；原生脚本强制 `127.0.0.1` |
| 2 | Redis 3.0.504 无可靠 Streams | Start/Test 要求 Redis **5+**；`Fetch-NativeDeps` 拉 tporadowski 5.0.14.1；校验和诚实策略 |
| 3 | `Start-Job` 传 Process 无法可靠重定向；未启 worker | 独立 `.data/native/logs/*.log`；`Start-Process` Hidden；启动 worker + PID + 就绪检查 |
| 4 | 路径空格 / Stop 仅靠陈旧 PID | redis conf `dir` 引号；Stop 校验 CommandLine/路径属本仓库；Wipe 仅限项目树 |
| 5 | 交付 | 后继包 `…-followup1000` + 本证据树 |

## Bot 侧已做（非 Windows）

- `API_HOST` 源码/dist 检查 + Node listen 探针（`0.0.0.0` 与 `127.0.0.1`）
- Redis 版本门禁逻辑（3.0.504 → FAIL；5+/6+/7 → OK）
- PowerShell 脚本括号/结构检查；**未**在 bot 上执行 Windows `.ps1` 全文
- 既有 Linux hostnet 栈 `GET /api/health` 仍返回 `ok` + `sales-os-api`（本 bot；非用户 Windows）

## 仍需 Codex Windows 复测

1. `Fetch-NativeDeps.ps1` 下载 Redis 5+ 到 `vendor\windows\redis\`
2. Postgres 二进制 PATH 或 `vendor\windows\pgsql`
3. `.env.native` 可用用户试验端口 `55432/56379`（或默认 15432/16379）
4. `Start` → worker PID → `Test` → 浏览器 → `Stop` → 第二次 `Start`
5. 确认 API 仅监听 `127.0.0.1`；确认旧 Redis 3.x 被明确 FAIL
6. 确认 Stop 不会误杀 Sub2API/其它 PID

## public_web_sample vs synthetic

延续 MASTER 约定：公开样例 `source_type=public_web_sample` 与合成线索区分标注；本 followup 未改业务种子语义。
