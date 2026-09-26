# DIFF-OVERLAY · SALES-FOLLOWUP-20260926-P0P1

Prefer overlaying onto a tree that already has followup1331 / followup1217. Keep `.env.native` / `.data`.

## Changed / added (high signal)

### API
- `apps/api/src/entities/index.ts` — sea fields + pool/finance/dial/scripts/wecom entities
- `apps/api/src/app.module.ts` — register Pool/Boss/Finance/Dial/Scripts/Wecom
- `apps/api/src/pool/**` — rules/claim/release/recycle/audit
- `apps/api/src/boss/**` — three screens
- `apps/api/src/finance/**` — contracts / payment plans / receipts
- `apps/api/src/dial/**` — dial tasks + CALL_PROVIDER mock|real
- `apps/api/src/scripts-lib/**` — 话术 CRUD + recommend
- `apps/api/src/wecom/**` — sidepanel MOCK/REAL
- `apps/api/src/leads/leads.service.ts` — force next_follow_at; CSV import; sea_status
- `apps/api/src/leads/leads.controller.ts` — `/import/csv` + template

### Worker
- `apps/worker/src/main.ts` — idle pool recycle loop

### Web
- `apps/web/src/api/client.js` — Pool/Boss/Finance/Dial/Scripts/Wecom APIs
- `apps/web/src/router/index.js` — /boss /pool /dial /scripts /import /wecom/sidepanel
- `apps/web/src/views/*` — Workbench/CaseDetail refactor + new pages
- `apps/web/src/assets/main.css` — restrained single-accent

### Acceptance
- `scripts/acceptance/business-acceptance.mjs` — P0P1 assertions; pack name; login direct-API fix
- `scripts/acceptance/unit/{pool-claim-race,followup-requires-next,payment-risk,dial-mock-call,wecom-mock}.test.mjs`

### Docs / env
- `docs/product/SALES-OS-PRD-P0-P1-20260926.md`
- `docs/acceptance/internal-trial/SALES-FOLLOWUP-20260926-P0P1/**`
- `.env.example` / `.env.internal-trial.example` — CALL_PROVIDER / WECOM_MODE

## Do NOT overlay
- `.env` / `.env.native` / `.data` / `node_modules` / `var/`
- Sub2API anything (ports 15432/16379)

## Apply
1. Overlay files OR unpack full pack
2. `npm run build -w @sales-os/api && npm run build -w @sales-os/worker && npm run build -w @sales-os/web`
3. Restart native stack; readiness gate `/api/health`
4. `Invoke-BusinessAcceptance.ps1` — expect api_subsuite PASS, product_green=NO while UI SKIP
5. `node --test scripts/acceptance/unit/*.test.mjs`
