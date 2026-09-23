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

## Commits (pushed to main)
- `189657ef73a4db81146217fa32a3b620c612c57e` — fix: native PS1 parser/Host/argv/Redis INFO
- `4b3f3ba2d163644531fa72e22b9077b194953c7d` — chore: ship followup1016 pack + SHA256
- `1cc88195edcf19bfb2c875ba7a3281667a5dc565` — chore: retarget local.tar.gz symlink (tip)

## Pack
- `sales-os-internal-trial-local-20260923-followup1016.tar.gz`
- bytes: 4822875
- SHA256: `868ab1f2b1782f0459291cf8b0afa2b0cf07e4e4dfa54fc115c0b137b692b97b`
- Also at `/workspace/` and `releases/`; symlink `sales-os-internal-trial-local.tar.gz` → followup1016
