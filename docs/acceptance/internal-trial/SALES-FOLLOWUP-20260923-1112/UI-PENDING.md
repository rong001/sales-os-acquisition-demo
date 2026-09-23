# UI待测 — SALES-FOLLOWUP-20260923-1112

**Status: NOT PASS on bot.** Requires Codex/user on Windows with typed browser login.

1. Login page branding: 企业 AI 定制销售 OS / AI客服 · 知识库/CRM · 销售智能体（无「抢票/USGate」主文案）
2. Typed login manager@demo.local → workbench (no localStorage/token injection)
3. Typed login agent@ + agent2@ isolation in UI
4. Wrong password + unauthenticated redirect
5. Funnel/workbench strings match enterprise trial context
6. Due-follow section visible when cases have open next_follow_at

Do **not** claim UI PASS via API-only or token injection.
