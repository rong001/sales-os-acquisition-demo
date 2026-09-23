#Requires -Version 5.1
<#
.SYNOPSIS
  Download Windows Postgres + Redis binaries into vendor/windows/ with SHA256 checks.
  User must approve outbound downloads. Does not install system-wide services.
  Sources (chocolatey-free):
    - PostgreSQL: EDB zip binaries (https://www.enterprisedb.com/download-postgresql-binaries)
      OR official installer documented below if zip URL changes.
    - Redis: tporadowski/redis GitHub releases (Windows port).
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$Vendor = Join-Path $Root "vendor\windows"
$Cache = Join-Path $Vendor "_cache"
New-Item -ItemType Directory -Force -Path $Vendor, $Cache | Out-Null

# Pinned URLs — update intentionally. Hashes filled after first successful fetch on a trusted machine.
# If hash is empty, script computes and writes vendor/windows/SHA256SUMS.txt for review.
$Deps = @(
  @{
    Name = "redis"
    # tporadowski Redis 5.0.14.1 Win64 zip (verify on GitHub Releases page before bumping)
    Url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    Sha256 = ""  # filled into SHA256SUMS.txt after download
    DestDir = (Join-Path $Vendor "redis")
    Kind = "zip-flatten"
  }
)

Write-Host @"
Fetch-NativeDeps
----------------
This script downloads third-party Windows binaries into vendor\windows\.
PostgreSQL: please download the Windows x86-64 binaries ZIP from
  https://www.enterprisedb.com/download-postgresql-binaries
(select PostgreSQL 16 or 15, Windows x86-64) and extract so that
  vendor\windows\pgsql\bin\pg_ctl.exe exists.
Or install PostgreSQL from https://www.postgresql.org/download/windows/
and ensure initdb/pg_ctl/psql are on PATH (still use ports 15432/16379).

Redis: will attempt download from tporadowski/redis GitHub release below.
"@

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

foreach ($dep in $Deps) {
  $outZip = Join-Path $Cache ($dep.Name + ".zip")
  Write-Host "Downloading $($dep.Name) from $($dep.Url) ..."
  try {
    Invoke-WebRequest -Uri $dep.Url -OutFile $outZip -UseBasicParsing
  } catch {
    Write-Host "FAIL: download failed for $($dep.Name): $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual: place redis-server.exe under vendor\windows\redis\"
    exit 1
  }
  $hash = Get-Sha256 $outZip
  Write-Host ("SHA256 " + $dep.Name + " = " + $hash)
  if ($dep.Sha256 -and $dep.Sha256.ToLowerInvariant() -ne $hash) {
    Write-Host "FAIL: hash mismatch for $($dep.Name)" -ForegroundColor Red
    exit 1
  }
  if (Test-Path $dep.DestDir) { Remove-Item -LiteralPath $dep.DestDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dep.DestDir | Out-Null
  Expand-Archive -LiteralPath $outZip -DestinationPath $dep.DestDir -Force
  # Flatten one nested folder if present
  $subs = Get-ChildItem -LiteralPath $dep.DestDir -Directory
  if ($subs.Count -eq 1 -and -not (Test-Path (Join-Path $dep.DestDir "redis-server.exe"))) {
    Get-ChildItem -LiteralPath $subs[0].FullName | Move-Item -Destination $dep.DestDir -Force
  }
  Add-Content -LiteralPath (Join-Path $Vendor "SHA256SUMS.txt") -Value "$hash  $($dep.Name).zip  $($dep.Url)"
}

Write-Host "OK. Redis vendor tree ready. Ensure vendor\windows\pgsql\bin\pg_ctl.exe exists before Start-InternalTrial-Native.ps1." -ForegroundColor Green
