#Requires -Version 5.1
<#
.SYNOPSIS
  Stop Windows-native Sales OS trial processes (API/gateway/Redis/Postgres).
  Keeps .data/native by default. -WipeData removes trial data dirs (destructive).
#>
param(
  [switch]$WipeData
)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$DataRoot = Join-Path $Root ".data\native"
$RunDir = Join-Path $DataRoot "run"
$PgData = Join-Path $DataRoot "pg"
$MarkerFile = Join-Path $DataRoot "SALES_OS_NATIVE_TRIAL.marker"

function Stop-PidFile([string]$Name) {
  $f = Join-Path $RunDir "$Name.pid"
  if (-not (Test-Path $f)) { return }
  $pidText = (Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pidText -match '^\d+$') {
    $procId = [int]$pidText
    try {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($p) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $Name pid=$procId"
      }
    } catch { }
  }
  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
}

Stop-PidFile "gateway"
Stop-PidFile "api"
Stop-PidFile "redis"

# Postgres via pg_ctl if available
$pgCtl = $null
$cmd = Get-Command pg_ctl -ErrorAction SilentlyContinue
if ($cmd) { $pgCtl = $cmd.Source }
$vendor = Join-Path $Root "vendor\windows\pgsql\bin\pg_ctl.exe"
if (-not $pgCtl -and (Test-Path $vendor)) { $pgCtl = $vendor }
if ($pgCtl -and (Test-Path $PgData)) {
  Write-Host "Stopping Postgres (pg_ctl)..."
  & $pgCtl -D $PgData stop -m fast 2>$null | Out-Null
}

if ($WipeData) {
  if (-not (Test-Path $MarkerFile)) {
    Write-Host "FAIL: refusing wipe — marker missing (foreign or unknown data dir)" -ForegroundColor Red
    exit 1
  }
  Write-Host "WARNING: wiping .data/native (destructive)..." -ForegroundColor Yellow
  Start-Sleep -Seconds 1
  Remove-Item -LiteralPath $DataRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "OK." -ForegroundColor Green
