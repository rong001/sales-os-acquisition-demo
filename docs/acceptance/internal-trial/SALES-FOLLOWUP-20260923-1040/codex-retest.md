# Codex / Windows retest (apply over existing build)

1. Unpack `sales-os-internal-trial-local-20260923-followup1040.tar.gz` over the existing tree.
   **Keep** `.env.native` and `.data/` (do not overwrite secrets or DB files).
2. Prefer ports in `.env.native`:
   `NATIVE_PG_PORT=55433` `NATIVE_REDIS_PORT=56380` `NATIVE_API_PORT=39300` `NATIVE_WEB_PORT=19280`
   Prior `55432/56379` OK if free. Avoid `15432/16379` (Sub2API/Garnet) and `5432/6379`.
3. If a prior hung Start left Postgres on your port: run
   `.\scripts\windows\native\Stop-InternalTrial-Native.ps1` (ownership-checked)
   **or** change ports. Do **not** kill Sub2API/Garnet/unrelated PIDs.
4. From repo root (path may contain spaces):
   ```powershell
   .\scripts\windows\native\Start-InternalTrial-Native.ps1
   ```
   Expect: "Starting Postgres…" returns within seconds → Redis → API → worker → Web → OK.
5. ```powershell
   .\scripts\windows\native\Test-InternalTrial-Native.ps1
   .\scripts\windows\native\Stop-InternalTrial-Native.ps1
   ```
6. Negative: foreign listener on chosen PG port → Start FAIL `port-collision` with process hint; must not kill it.
