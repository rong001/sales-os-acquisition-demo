# SALES-FOLLOWUP-20260926-DEMO

获客 / Sales OS — **demo-ready**：全模块导航打通、≥3 套可区分演示故事包、端到端 smoke 走通。

## Baseline (DO NOT REDO)

- P0P1 tip `2c72f26` / pack `20260926-p0p1` SHA256 `ec546299…`
- Ordinary typed UI still **UI待测** → `product_green=NO`

## What this pack adds

| Item | Status |
|------|--------|
| AppNav on all auth pages (工作台/老板/公海/外呼/话术/导入/企微/漏斗/案件) | **SHIPPED** |
| Demo packs A电销班 / B B2B跟进 / C 成交回款 | **SHIPPED** (`npm run seed:demo`) |
| Smoke walkthrough (login→pool→claim→follow→boss→contract→payment→dial→scripts→wecom) | **SHIPPED** (`npm run smoke:demo`) |
| Finance `GET /contracts` without case_id lists tenant contracts | **SHIPPED** |
| Honest UI-PENDING + MOCK\|REAL WeCom/Call | **unchanged honesty** |

## Demo packs

| Pack | CLI | Visible markers |
|------|-----|-----------------|
| A 电销班 | `--pack=tele` | 公司名「…演示*」；公海可领；任务「【演示A·电销班】早班外呼包」；话术标题含【电销】；通话 `mode=mock` |
| B B2B跟进 | `--pack=b2b` | 私海案件；今日/逾期待办；预约 confirmed + draft；含闲置待回收案 |
| C 成交回款 | `--pack=finance` | 公司名「【成交】…」；WON+signed 合同；逾期计划+部分实收 → 老板屏3 |

Distinguish via `lead_cases.flags.demo_pack` ∈ `tele|b2b|finance` and company_name prefixes.

## How to run (bot local)

```bash
# 1) stack already on :3100 API + :5173/:8080 web + PG/Redis (do NOT touch 15432/16379)
cd /workspace/sales-os-app
# 2) accounts + growth seed
npm run seed
# 3) story packs
npm run seed:demo          # or --pack=tele|b2b|finance via node scripts/seed-demo-packs.mjs
# 4) smoke (JWT memory-only)
npm run smoke:demo
# one-shot:
npm run demo:ready
```

Open URLs:

- Web: `http://127.0.0.1:5173/`（或网关 `http://127.0.0.1:19280/` / `8080` 以本机为准）
- API health: `http://127.0.0.1:3100/health/live`

Accounts (passwords **only** from local `.env` / `.env.native` / `.env.example` placeholders — never invent production secrets):

| Email | Role |
|-------|------|
| `manager@demo.local` | supervisor（老板三屏/建任务/导入） |
| `agent@demo.local` | agent |
| `agent2@demo.local` | agent |
| `admin@demo.local` | admin |
| `viewer@demo.local` | viewer 只读 |

Keys: `DEMO_AGENT_PASSWORD` / `DEMO_AGENT2_PASSWORD` / `DEMO_MANAGER_PASSWORD` / `DEMO_ADMIN_PASSWORD` / `DEMO_VIEWER_PASSWORD`.

## Gaps (honest)

- Windows typed UI login still pending → see `UI-PENDING.md`；`product_green=NO` while `ui=SKIP`
- REAL WeCom / REAL Call need user tenant official keys；MOCK demo-complete；fail-closed without keys
- Sub2API ports 15432/16379 untouched

## Pack

- `sales-os-internal-trial-local-20260926-demo-ready.tar.gz`
- bytes: 5018643
- SHA256: `edb37e8ab25df2f8ff3992bdbfa25d429b65b9a3fae8d9997367d074c3d859b5`
- Overlay: `sales-os-internal-trial-local-20260926-demo-ready-overlay.tar.gz` (32919 bytes, SHA256 `00a12e9520d14157d3ca8abc45499fa6ec8bca0e440f66cd04ba083457beeaad`)
- Symlink `sales-os-internal-trial-local.tar.gz` → demo-ready under `/workspace` and `releases/`

## Smoke (bot local)

- `npm run smoke:demo` → **exit 0** · pass=20 fail=0
- Idle recycle on demo b2b case: `POST /pool/recycle` recycled=1

## Commits

- `9a00a3e` — feat(demo): AppNav + 3 packs + smoke
- (pack ship + tip pin follow)

## Tip
_(filled after tip pin)_
