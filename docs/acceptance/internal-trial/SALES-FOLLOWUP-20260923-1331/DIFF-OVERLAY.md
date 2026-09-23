# Overlay DIFF list — followup1331 on top of followup1217

User preference: 「只叠变化」. Minimum changed/new files:

## Required overlay (code)

1. `apps/api/src/common/public-fetch.ts` — title honesty + IP/DNS pin
2. `apps/api/src/common/outbox-enqueue.ts` — **NEW** enqueue/recovery
3. `apps/api/src/events/events.service.ts` — use enqueue helper
4. `apps/api/src/leads/leads.service.ts` — current vs historical verification
5. `apps/worker/src/outbox-enqueue.ts` — **NEW** (same helper for worker)
6. `apps/worker/src/main.ts` — recovery poll via helper
7. `apps/web/src/views/CaseDetailView.vue` — provenance / explanation UI
8. `apps/web/src/views/WorkbenchView.vue` — import msg shows verification
9. `scripts/acceptance/business-acceptance.mjs` — new assertions + pack id 1331

## Also include (tests/docs)

10. `scripts/acceptance/unit/public-fetch-ssrf.test.mjs` — **NEW**
11. `scripts/acceptance/unit/outbox-enqueue-recovery.test.mjs` — **NEW**
12. `docs/acceptance/internal-trial/SALES-FOLLOWUP-20260923-1331/**` — this folder

Keep: `.env.native`, `.data/`, Start scripts from prior packs if already present.
Rebuild dist after overlay (`dist` is gitignored).
