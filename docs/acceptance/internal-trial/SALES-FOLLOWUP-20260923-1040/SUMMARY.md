# SALES-FOLLOWUP-20260923-1040

Windows native Start hang after "Starting PostgreSQL" — pipeline handle inheritance fix + port default move off Sub2API/Garnet.

## Root cause
**Confirmed** (code inspection + bot mock): PowerShell `& pg_ctl … 2>&1 | Out-Null` (and `initdb` the same) leaves stdout/stderr pipes inherited by long-lived postgres; PowerShell waits forever after short-lived `pg_ctl` exits. Matches user facts (PG ready on 127.0.0.1:55433, pg_ctl already exited, Start never continued).

Bot harness (Linux pwsh): BAD pipe probe `observed_hang=True`; GOOD `Invoke-NativeToolProcess` (file redirects + WaitForExit on starter only) returned exit 0 in ~0.6s.

## Fixes
1. **`Invoke-NativeToolProcess`** in `NativeCommon.ps1` — Start-Process file redirects + timeout WaitForExit (never pipeline for daemon starters).
2. **`Get-PortOccupierHint`** — best-effort OwningProcess identity for FAIL messages (never kills).
3. **Start** — `initdb` / `pg_ctl start|status` via helper; then TCP + `pg_isready` poll; Redis already `Start-LoggedProcess` + PING/version≥5 gate.
4. **Stop** — `pg_ctl stop` via same helper.
5. **Port defaults** — **55433 / 56380 / 39300 / 19280** (avoid Sub2API/Garnet **15432 / 16379**; classic 5432/6379 refused; prior **55432 / 56379** OK if free).
6. **port-collision** — FAIL with process hint; never kill occupier; never attach to foreign DBs.
7. Harness — AST ban on Out-Null/Out-String after pg_ctl/initdb/redis-server; pipe-vs-file hang probe; default-port asserts.

## Quality gate (bot Linux)
- `Parser.ParseFile` all `scripts/windows/**/*.ps1` → **TOTAL_PARSE_ERRORS=0** (9 files)
- `Test-NativeCommon-Harness.ps1` → **HARNESS RESULT=PASS**
- Grep/AST: no `| Out-Null` after pg_ctl/initdb/redis-server start in production scripts

## NOT claimed
**No Windows end-to-end PASS.** Bot boundary: Linux parse + unit/mock hang tests only. Codex retest on user PC required (see `codex-retest.md`).

## Unpack over existing build
Unzip/tar over source; **keep your private `.env.native` and `.data/`** (pack does not ship secrets; Start does not wipe `.data` by default).

## Evidence files
- `parser-parsefile.txt`
- `harness-output.txt`
- `pipe-hang-audit.txt`
- `notes.md`
- `codex-retest.md`
- `results.json`

## Commits (pushed to main)
- `276f46e07625fc3b8b5209d43c754f8cc510cefb` — fix: native Start hang — no pipe Out-Null on pg_ctl/initdb; ports off Sub2API
- `9948203acea73ed815d5467cbf4bb8f9ab6fe596` — chore: ship followup1040 pack + SHA256
- `1b6d5d8668575fe57e38edc3a0e71355c2954d05` — docs: pin summary to pack SHAs
- `e612b588e85eb3c0cbd6aa5fcfc3436f0f71059a` — docs: correct SUMMARY SHAs to match pack (tip)

## Pack
- `sales-os-internal-trial-local-20260923-followup1040.tar.gz`
- bytes: 4849146
- SHA256: `4b208a20c798366094f84caa4ee2d1b1cbaa5a601006010e9c54d3d8427b981c`
- Also at `/workspace/` and `releases/`; symlink `sales-os-internal-trial-local.tar.gz` → followup1040
