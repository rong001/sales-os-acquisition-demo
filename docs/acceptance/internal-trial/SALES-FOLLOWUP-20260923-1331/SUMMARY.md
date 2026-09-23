# SALES-FOLLOWUP-20260923-1331

获客 / Sales OS — patch pack over followup1217: title honesty, DNS/IP pin, verification current vs historical, Redis enqueue recovery.

## Baseline (DO NOT REDO)

- followup1217 pack 4896460 / SHA256 `8bd71d117505f617883ea7d68cbb450b34f1b0f81b8a6175275e4ac2cc2f65a6` tip `938b6a4` (+ docs pins)
- User-verified: concurrent synthetic dedupe; reimport `source_provided`; PG55433 → health503/business503/live200; Redis56380 → health503/live200; restore business200; Sub2API PIDs unchanged
- Ordinary typed UI still **UI待测**

## Bot harness (this delivery)

| Layer | Result |
|---|---|
| api_subsuite | **PASS** |
| real_source_gate | **PASS** (fetch_verified≥3; Cloudflare title honesty verified) |
| ui | **SKIP** |
| **product_green** | **NO** (UI未测) |
| harness OVERALL | PASS (fail=0 skip=3) |

Artifacts: `business-acceptance-results.json`, `bot-harness-console.txt`, `results.json`.

Offline units (also embedded in runner):
- `scripts/acceptance/unit/public-fetch-ssrf.test.mjs`
- `scripts/acceptance/unit/outbox-enqueue-recovery.test.mjs`

## Codex overlay checklist

See `DIFF-OVERLAY.md` — prefer overlaying the listed changed files onto an existing tree that already has followup1217; keep `.env.native` / `.data`.

1. Overlay files OR unpack `sales-os-internal-trial-local-20260923-followup1331.tar.gz`
2. `npm run build -w @sales-os/api && npm run build -w @sales-os/worker && npm run build -w @sales-os/web`
3. Restart native stack; gates on readiness `/api/health`
4. `Invoke-BusinessAcceptance.ps1` — expect api_subsuite PASS, product_green=NO while UI SKIP
5. Optional offline: `node --test scripts/acceptance/unit/*.test.mjs`
6. Typed UI still in `UI-PENDING.md` — never claim API PASS = product green
7. Never touch Sub2API 15432/16379

## Pack

- `sales-os-internal-trial-local-20260923-followup1331.tar.gz`
- bytes: 5305227
- SHA256: `ea578dbe1b5393f20d07f01d55d41870da351b1b0f17cf457f489d8b552efab5`
- Overlay (changed files only): `sales-os-internal-trial-local-20260923-followup1331-overlay.tar.gz` (57254 bytes, SHA256 `105b1687d483f2a972d05644cc38c19fcf2cb52518b7f6017cc654dc34148421`)
- Symlink `sales-os-internal-trial-local.tar.gz` → followup1331 under `/workspace` and `releases/`

## Commits

- `8497186` — feat(api): title honesty, DNS/IP pin, verification current vs historical, outbox recovery
- (ship + tip pins follow)

## Tip
(pending ship commit)
