# UI待测 — SALES-FOLLOWUP-20260923-1152

**Status: 本侧 UI 未测 (NOT PASS on bot).** Requires Codex/user on Windows with typed browser login.

1. Login page: 企业 AI 定制销售 OS / AI客服 · 知识库/CRM · 销售智能体
2. Typed login `manager@demo.local` → 作战台 (password from `.env.native`; **no** localStorage/token inject)
3. Manager sees **企业线索导入（公开来源 / 授权名单）** form; import one public URL; confirm UNKNOWN fields / provenance
4. Typed login `agent@` + `agent2@` — list UI isolation visible
5. Due-follow section: tag reads 站内列表轮询 · 非 worker 推送
6. Synthetic happy-path button labeled 新建合成演示线索; WON shows 演示赢单（非客户成交）
7. Funnel filters: ai-cs / kb-crm / sales-agent
8. Wrong password UI + logged-out redirect

Do **not** claim UI PASS via API-only or token injection. API login ≠ UI login.
