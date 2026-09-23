# SALES-FOLLOWUP-20260923-1040 — notes

## Real Windows blocker
Spaced Windows path: Start printed "Starting PostgreSQL" then hung minutes.
User: PG17 ready ~10:30:23 on `127.0.0.1:55433`; short-lived `pg_ctl` already exited;
parent Start never reached Redis/API/worker/Web.

## Root cause — CONFIRMED
`& $pgCtl … 2>&1 | Out-Null` (also `initdb`) creates a PowerShell pipeline.
Long-lived postgres inherits pipe handles; Out-Null waits for EOF forever.
Bot mock: pipe hang observed; file-redirect starter finished ~0.6s without waiting on daemon.

## Fix
`Invoke-NativeToolProcess` (Start-Process + separate log files + WaitForExit timeout on tool PID).
Then poll readiness. Redis already file-redirected via `Start-LoggedProcess`.
Port defaults → 55433/56380/39300/19280 (Sub2API/Garnet occupy 15432/16379).
Port collision: FAIL + hint; never kill; never rewrite foreign DBs.

## Bot boundary
Linux parse + harness only. **No Windows PASS.**
