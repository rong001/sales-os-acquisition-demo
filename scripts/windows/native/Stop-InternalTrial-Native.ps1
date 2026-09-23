#Requires -Version 5.1
<#
.SYNOPSIS
  Stop Windows-native Sales OS trial processes (gateway/API/worker/Redis/Postgres).
  Keeps .data/native by default. -WipeData removes trial data dirs (destructive).
  Stop MUST NOT kill by stale PID alone: verifies command line / image path
  belongs to THIS project absolute path before Stop-Process.
  Delete/Move only within this project's real absolute path tree.
#>
param(
  [switch]$WipeData
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
. (Join-Path $PSScriptRoot "NativeCommon.ps1")

$DataRoot = Join-Path $Root ".data\native"
$RunDir = Join-Path $DataRoot "run"
$PgData = Join-Path $DataRoot "pg"
$MarkerFile = Join-Path $DataRoot "SALES_OS_NATIVE_TRIAL.marker"
$VendorWin = Join-Path $Root "vendor\windows"

# Stop app processes first (owned-PID verification)
Stop-OwnedPidFile -RunDir $RunDir -Name "gateway" -Root $Root
Stop-OwnedPidFile -RunDir $RunDir -Name "worker" -Root $Root
Stop-OwnedPidFile -RunDir $RunDir -Name "api" -Root $Root
Stop-OwnedPidFile -RunDir $RunDir -Name "redis" -Root $Root

# Postgres via pg_ctl scoped to THIS project's data dir only
$pgCtl = $null
$vendor = Join-Path $VendorWin "pgsql\bin\pg_ctl.exe"
if (Test-Path -LiteralPath $vendor) { $pgCtl = $vendor }
if (-not $pgCtl) {
  $cmd = Get-Command pg_ctl -ErrorAction SilentlyContinue
  if ($cmd) { $pgCtl = $cmd.Source }
}
if ($pgCtl -and (Test-Path -LiteralPath $PgData)) {
  if (-not (Test-PathUnderRoot -Candidate $PgData -Root $Root)) {
    Write-Host "FAIL: refusing pg_ctl stop — PG data path outside project root" -ForegroundColor Red
    exit 1
  }
  if (-not (Test-Path -LiteralPath $MarkerFile)) {
    Write-Host "WARN: marker missing — still stopping only via -D project pg data dir" -ForegroundColor Yellow
  }
  Write-Host "Stopping Postgres (pg_ctl -D project .data/native/pg)..."
  $LogDir = Join-Path $DataRoot "logs"
  if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
  $stOut = Join-Path $LogDir "pg_ctl_stop.out.log"
  $stErr = Join-Path $LogDir "pg_ctl_stop.err.log"
  try {
    $null = Invoke-NativeToolProcess -FilePath $pgCtl `
      -ArgumentList @('-D', $PgData, 'stop', '-m', 'fast') `
      -WorkingDirectory (Split-Path -Parent $pgCtl) `
      -OutLog $stOut -ErrLog $stErr -TimeoutSec 45 -Label "pg_ctl-stop"
  } catch {
    Write-Host "WARN: pg_ctl stop: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

if ($WipeData) {
  if (-not (Test-Path -LiteralPath $MarkerFile)) {
    Write-Host "FAIL: refusing wipe — marker missing (foreign or unknown data dir)" -ForegroundColor Red
    exit 1
  }
  if (-not (Test-PathUnderRoot -Candidate $DataRoot -Root $Root)) {
    Write-Host "FAIL: refusing wipe — data path outside project root" -ForegroundColor Red
    exit 1
  }
  # Extra safety: path must contain .data\native under root
  $norm = Normalize-PathLoose $DataRoot
  $expect = Normalize-PathLoose (Join-Path $Root ".data\native")
  if ($norm -ne $expect) {
    Write-Host "FAIL: refusing wipe — path mismatch for .data/native" -ForegroundColor Red
    exit 1
  }
  Write-Host "WARNING: wiping .data/native (destructive, project-local only)..." -ForegroundColor Yellow
  Start-Sleep -Seconds 1
  Remove-Item -LiteralPath $DataRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "OK." -ForegroundColor Green
