# SALES-FOLLOWUP-20260923-1016

Real Windows native trial PowerShell failure fixes (not docs-only).

## Fixes
1. **Test-Path -or ParserError** — `Start-InternalTrial-Native.ps1` prior PID check:
   each `Test-Path` call separately parenthesized: `(Test-Path A) -or (Test-Path B)`.
2. **`$Host` read-only** — `Get-RedisVersionString` param renamed `$Host` → `$HostName`;
   call sites in Start/Test updated. Full reserved-name ParameterAst audit: 0 hits.
3. **ArgumentList spaces** — `Format-ProcessArgumentListString` + single-string
   `Start-Process -ArgumentList` (PS 5.1-safe). Space-path harness PASS (bot Linux pwsh).
4. **Redis INFO multi-line** — join `string[]` to one string before `-match` so `$Matches` sets.

Also: `-WindowStyle Hidden` only on Windows (PS 5.1 always; PS 6+ when `$IsWindows`).

## Quality gate
- `Parser.ParseFile` on **all** `scripts/windows/**/*.ps1` → **TOTAL_PARSE_ERRORS=0**
- Harness: reserved names, multi-line INFO, space-path Start-LoggedProcess, no bare Test-Path -or AST

## Defaults
Isolated ports remain **15432 / 16379 / 39300 / 19280** (env-overridable). No Sub2API touch.

## Evidence files
- `parser-parsefile.txt`
- `reserved-name-audit.txt`
- `space-path-test-note.txt`
- `harness-output.txt`

## NOT claimed
No Windows end-to-end PASS. Codex retest on real Windows still required.
