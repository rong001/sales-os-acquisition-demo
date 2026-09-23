# 本侧 UI 未测 — SALES-FOLLOWUP-20260923-1331

API / business-acceptance PASS ≠ typed browser UI PASS.
`product_green=NO` while this checklist is open.

## Codex / Windows checklist

1. Open `http://127.0.0.1:${NATIVE_WEB_PORT}`
2. Typed login manager / agent / agent2; wrong password → error
3. Manager import: verification statuses + explanation visible on case detail (`data-testid=source-verification-provenance`)
4. After a later failed/skip-fetch reimport: UI shows historically verified + current not trustworthy warning
5. Sales1/Sales2 list isolation
6. Due follow-ups wall-clock
7. Do **not** mark UI PASS from API harness alone
