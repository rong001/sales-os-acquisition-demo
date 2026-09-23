# 本侧 UI 未测 — SALES-FOLLOWUP-20260923-1217

API / business-acceptance PASS ≠ typed browser UI PASS.

## Codex / Windows checklist (password from `.env.native`; no token injection)

1. Open `http://127.0.0.1:${NATIVE_WEB_PORT}`
2. Typed login: manager / agent / agent2 (correct password)
3. Wrong password → error; logged-out redirect
4. Manager: authorized-public-import form visible; import shows verification statuses
5. Sales1 / Sales2: list UI isolation (no cross-owner cases)
6. Due follow-ups appear after wall-clock; handle removes from list
7. Do **not** mark UI PASS from API harness alone

`product_green` stays **NO** until this checklist passes.
