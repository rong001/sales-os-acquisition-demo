#Requires -Version 5.1
<#
.SYNOPSIS
  Download Windows Redis (5+) binaries into vendor/windows/ with honest SHA256 policy.
  User must approve outbound downloads. Does not install system-wide services.
  Does NOT touch Redis/Postgres on other ports (e.g. Sub2API).

  Checksum policy:
    - If a known published/pinned Sha256 is set in $Deps: compare and only then say "matched pinned checksum".
    - If Sha256 is empty: compute LOCAL hash only — MUST NOT claim upstream verified / matched upstream.
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Vendor = Join-Path $Root "vendor\windows"
$Cache = Join-Path $Vendor "_cache"
New-Item -ItemType Directory -Force -Path $Vendor, $Cache | Out-Null

# Pinned URL: tporadowski Redis 5.0.14.1 (Windows x64) — supports streams (XGROUP/XADD).
# Upstream GitHub release page does not publish a SHA256 asset digest as of pin time,
# so Sha256 stays empty → local hash only (honest). If you obtain a published checksum,
# paste it into Sha256 (lowercase hex) to enable "matched pinned checksum" verification.
$Deps = @(
  @{
    Name = "redis"
    Url = "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
    Sha256 = ""  # empty = local hash only; do NOT claim upstream verified
    DestDir = (Join-Path $Vendor "redis")
    Kind = "zip-flatten"
    MinMajor = 5
  }
)

Write-Host @"
Fetch-NativeDeps
----------------
Downloads third-party Windows binaries into vendor\windows\ (project-local).
Does not replace or stop Redis/Postgres services on other ports.

PostgreSQL: download Windows x86-64 binaries ZIP from
  https://www.enterprisedb.com/download-postgresql-binaries
(select PostgreSQL 16/15/17) and extract so vendor\windows\pgsql\bin\pg_ctl.exe exists.
Or install from https://www.postgresql.org/download/windows/ and put bin on PATH
(still use dedicated NATIVE_* ports — never 5432/6379 Sub2API defaults).

Redis: downloads tporadowski/redis 5.0.14.1 (Redis 5+ required for worker streams).
Redis 3.0.x (e.g. 3.0.504) is NOT sufficient.
"@

function Get-Sha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$sumsFile = Join-Path $Vendor "SHA256SUMS.txt"
$stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
Add-Content -LiteralPath $sumsFile -Value "# Fetch-NativeDeps $stamp"

foreach ($dep in $Deps) {
  $outZip = Join-Path $Cache ($dep.Name + ".zip")
  Write-Host "Downloading $($dep.Name) from $($dep.Url) ..."
  try {
    Invoke-WebRequest -Uri $dep.Url -OutFile $outZip -UseBasicParsing
  } catch {
    Write-Host "FAIL: download failed for $($dep.Name): $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Manual: place Redis 5+ redis-server.exe under vendor\windows\redis\"
    exit 1
  }
  $hash = Get-Sha256 $outZip
  Write-Host ("SHA256 (local compute) " + $dep.Name + " = " + $hash)

  $pinned = [string]$dep.Sha256
  if ($pinned -and $pinned.Trim() -ne "") {
    if ($pinned.ToLowerInvariant() -ne $hash) {
      Write-Host "FAIL: hash mismatch for $($dep.Name) (pinned=$($pinned.ToLowerInvariant()) local=$hash)" -ForegroundColor Red
      exit 1
    }
    Write-Host "SHA256 matched pinned checksum for $($dep.Name)." -ForegroundColor Green
    Add-Content -LiteralPath $sumsFile -Value "$hash  $($dep.Name).zip  PINNED-MATCH  $($dep.Url)"
  } else {
    Write-Host "NOTE: no pinned/published upstream checksum configured for $($dep.Name)." -ForegroundColor Yellow
    Write-Host "Recorded LOCAL hash only — NOT upstream-verified / NOT claiming matched upstream." -ForegroundColor Yellow
    Add-Content -LiteralPath $sumsFile -Value "$hash  $($dep.Name).zip  LOCAL-ONLY-NOT-UPSTREAM-VERIFIED  $($dep.Url)"
  }

  if (Test-Path -LiteralPath $dep.DestDir) {
    # Only remove project vendor dest, never paths outside vendor
    $vNorm = (Resolve-Path $Vendor).Path
    $dFull = [System.IO.Path]::GetFullPath($dep.DestDir)
    if (-not ($dFull.StartsWith($vNorm, [System.StringComparison]::OrdinalIgnoreCase))) {
      Write-Host "FAIL: refusing to clear DestDir outside vendor\windows" -ForegroundColor Red
      exit 1
    }
    Remove-Item -LiteralPath $dep.DestDir -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dep.DestDir | Out-Null
  Expand-Archive -LiteralPath $outZip -DestinationPath $dep.DestDir -Force
  $subs = Get-ChildItem -LiteralPath $dep.DestDir -Directory -ErrorAction SilentlyContinue
  if ($subs.Count -eq 1 -and -not (Test-Path -LiteralPath (Join-Path $dep.DestDir "redis-server.exe"))) {
    Get-ChildItem -LiteralPath $subs[0].FullName | Move-Item -Destination $dep.DestDir -Force
  }
  if (-not (Test-Path -LiteralPath (Join-Path $dep.DestDir "redis-server.exe"))) {
    Write-Host "FAIL: redis-server.exe missing after extract" -ForegroundColor Red
    exit 1
  }
}

Write-Host "OK. Redis 5+ vendor tree ready under vendor\windows\redis\." -ForegroundColor Green
Write-Host "Ensure vendor\windows\pgsql\bin\pg_ctl.exe exists before Start-InternalTrial-Native.ps1."
Write-Host "Checksum policy: LOCAL-ONLY unless Sha256 pinned in script."
