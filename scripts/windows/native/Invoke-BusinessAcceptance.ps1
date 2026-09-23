#Requires -Version 5.1
<#
.SYNOPSIS
  Windows-friendly wrapper for scripts/acceptance/business-acceptance.mjs
  Reads credentials only from repo-root .env.native (never echoed).
  Requires Node 20+/24 on PATH. Run after Start-InternalTrial-Native.ps1.
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $Root

$EnvFile = Join-Path $Root ".env.native"
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Write-Error "missing .env.native — run Start-InternalTrial-Native.ps1 first"
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "node-missing: install Node.js 20+ / 24 and reopen PowerShell"
  exit 1
}

$script = Join-Path $Root "scripts\acceptance\business-acceptance.mjs"
if (-not (Test-Path -LiteralPath $script)) {
  Write-Error "missing business-acceptance.mjs"
  exit 1
}

Write-Host "Running business acceptance (desensitized PASS/FAIL only; JWT in memory)..."
& node $script @args
exit $LASTEXITCODE
