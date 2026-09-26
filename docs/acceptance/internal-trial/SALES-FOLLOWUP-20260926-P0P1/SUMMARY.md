# SALES-FOLLOWUP-20260926-P0P1

获客 / Sales OS — **P0+P1 完整落地**：公海规则引擎、强制下次跟进、老板三屏、CSV 导入打磨、UI 克制、企微侧栏 MOCK、合同回款、外呼任务包 MOCK、话术库。

## Baseline (DO NOT REDO)

- followup1331 tip `b9d0303` / pack SHA256 `ea578dbe…`
- User-verified prior: concurrent dedupe; health live vs ready; SSRF pin; source honesty; Sub2API untouched
- Ordinary typed UI still **UI待测**

## PRD checklist

| ID | Item | Status |
|----|------|--------|
| P0-1 | 公海/私海规则引擎 claim/release/recycle/audit/UI | **SHIPPED** (API+UI+race assert) |
| P0-2 | 极简跟进强制 next_follow_at | **SHIPPED** (API 400 + UI block) |
| P0-3 | 老板三屏 | **SHIPPED** (`/boss`) |
| P0-4 | 批量导入打磨 | **SHIPPED** (template/source/failed export/中文合并) |
| P0-5 | UI 克制重构 | **SHIPPED** (workbench/case/new pages) |
| P0-6 | 登录可测 + product_green 诚实 | **SHIPPED** (testid + harness ui=SKIP → product_green=NO) |
| P1-1 | 企微侧边栏 MVP MOCK | **SHIPPED** (`/wecom/sidepanel`) |
| P1-2 | 合同最小对象 | **SHIPPED** |
| P1-3 | 回款计划/实收 → 老板屏3 | **SHIPPED** |
| P1-4 | 外呼任务包 + CALL_PROVIDER | **SHIPPED** (MOCK demo-complete; REAL fail-closed) |
| P1-5 | 话术库 + 标星推荐 | **SHIPPED** |

## Bot harness

| Layer | Result |
|---|---|
| api_subsuite | **PASS** |
| real_source_gate | **PASS** |
| ui | **SKIP** |
| **product_green** | **NO** (UI未测) |
| harness OVERALL | PASS (fail=0 skip=3) |

Offline units: pool-claim-race, followup-requires-next, payment-risk, dial-mock-call, wecom-mock (+ prior SSRF/outbox).

## Gaps (honest)

- REAL WeCom / REAL Call need user tenant official keys — product fails closed with config hints; MOCK is demo-complete
- Windows typed UI login still pending (`UI-PENDING.md`)
- Gateway on legacy 19280 may still point at old API in some bot environments; pack uses native scripts; verify `/api/health/live` after restart

## Pack

See SHA256SUMS after ship. Symlink `sales-os-internal-trial-local.tar.gz` → this pack.
