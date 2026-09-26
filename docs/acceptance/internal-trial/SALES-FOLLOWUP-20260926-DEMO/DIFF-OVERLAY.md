# DIFF-OVERLAY · SALES-FOLLOWUP-20260926-DEMO

Prefer overlaying onto P0P1 / followup1331 tree. Keep `.env.native` / `.data`.

## Changed / added

### Web
- `apps/web/src/components/AppNav.vue` — shared nav (含企微侧栏)
- `apps/web/src/views/*` — AppNav on all auth pages

### API
- `apps/api/src/finance/finance.service.ts` — `GET /contracts` without case_id
- `apps/api/src/finance/finance.controller.ts`
- `apps/api/src/seed/run-seed.ts` — optional demo packs after account seed

### Scripts
- `scripts/seed-demo-packs.mjs` — `--pack=all|tele|b2b|finance`
- `scripts/smoke-demo-walkthrough.mjs` — E2E smoke, JWT memory-only
- `package.json` — `seed:demo*` / `smoke:demo` / `demo:ready`

### Docs
- `docs/acceptance/internal-trial/SALES-FOLLOWUP-20260926-DEMO/**`
- `START_INTERNAL.md` — demo section

## Do NOT overlay
- `.env` / `.env.native` / `.data` / `node_modules` / `var/` / Sub2API

## Apply
1. Overlay or unpack full pack
2. `npm run build -w @sales-os/api && npm run build -w @sales-os/web`
3. `npm run seed && npm run seed:demo && npm run smoke:demo`
