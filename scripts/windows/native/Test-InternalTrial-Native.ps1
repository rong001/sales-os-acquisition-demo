#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only health gate for Windows-native trial.
  Checks web /api/health, Redis 5+, worker PID alive, redis PING.
  Never dumps .env.native values. Never prints SUCCESS if health fails.
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $Root
. (Join-Path $PSScriptRoot "NativeCommon.ps1")

$EnvFile = Join-Path $Root ".env.native"
$DataRoot = Join-Path $Root ".data\native"
$RunDir = Join-Path $DataRoot "run"
$LogDir = Join-Path $DataRoot "logs"
$VendorWin = Join-Path $Root "vendor\windows"

if (-not (Test-Path -LiteralPath $EnvFile)) { Fail "missing .env.native (run Start-InternalTrial-Native.ps1 first)" }
$envMap = Parse-DotEnv $EnvFile

function PortOr([string]$Key, [string]$Default) {
  if ($envMap.ContainsKey($Key) -and $envMap[$Key] -match '^\d+$') { return $envMap[$Key] }
  return $Default
}

$WebPort = PortOr "NATIVE_WEB_PORT" "19280"
$ApiPort = PortOr "NATIVE_API_PORT" "39300"
$RedisPort = [int](PortOr "NATIVE_REDIS_PORT" "16379")

# Redis 5+ gate
$redisServer = $null
foreach ($c in @(
  (Join-Path $VendorWin "redis\redis-server.exe"),
  (Join-Path $VendorWin "Redis\redis-server.exe")
)) { if (Test-Path -LiteralPath $c) { $redisServer = $c; break } }
if (-not $redisServer) {
  $cmd = Get-Command redis-server -ErrorAction SilentlyContinue
  if ($cmd) { $redisServer = $cmd.Source }
}
$redisCli = Find-RedisCliNear $redisServer
if (-not $redisCli) {
  Fail "redis-cli-missing: cannot verify Redis version/PING. Ensure vendor\windows\redis\ from Fetch-NativeDeps.ps1"
}
if (-not (Invoke-RedisPing -RedisCli $redisCli -HostName "127.0.0.1" -Port $RedisPort)) {
  Fail "redis-ping-failed: 127.0.0.1:$RedisPort — is native stack started?"
}
$redisVer = Get-RedisVersionString -RedisCli $redisCli -HostName "127.0.0.1" -Port $RedisPort -RedisServerPath $redisServer
Assert-RedisVersionOk -Version $redisVer -MinMajor 5
Write-Host "Redis $redisVer (>=5) PING OK on 127.0.0.1:$RedisPort"

# Worker process
$workerPidFile = Join-Path $RunDir "worker.pid"
if (-not (Test-Path -LiteralPath $workerPidFile)) {
  Fail "worker-pid-missing: worker not started (Start must launch worker)"
}
$wPidText = Get-Content -LiteralPath $workerPidFile | Select-Object -First 1
if ($wPidText -notmatch '^\d+$') { Fail "worker-pid-invalid" }
$wPid = [int]$wPidText
try {
  $wp = Get-Process -Id $wPid -ErrorAction Stop
} catch {
  Fail "worker-not-running: pid $wPid dead"
}
if (-not (Test-ProcessBelongsToProject -ProcId $wPid -Root $Root)) {
  Fail "worker-pid-foreign: pid $wPid does not appear owned by this project"
}
$workerOut = Join-Path $LogDir "worker.out.log"
$workerErr = Join-Path $LogDir "worker.err.log"
if (Test-LogLooksFatal $workerErr) {
  Fail "worker-log-fatal: see .data/native/logs/worker.err.log"
}
Write-Host "Worker pid=$wPid alive (project-owned)"

$healthUrl = "http://127.0.0.1:$WebPort/api/health"
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  $body = [string]$resp.Content
  if ([int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 300 -and (Test-ApiHealthJson $body)) {
    Write-Host "OK. http://127.0.0.1:$WebPort  (web /api/health = ok + sales-os-api; Redis $redisVer; worker alive)" -ForegroundColor Green
    exit 0
  }
  Fail "api-or-db-not-ready: unexpected health body (not printed)"
} catch {
  $apiOk = $false
  try {
    $ar = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ((Test-ApiHealthJson ([string]$ar.Content))) { $apiOk = $true }
  } catch { }
  if ($apiOk) { Fail "web-proxy-broken: direct API healthy but web /api/health failed" }
  Fail "api-or-db-not-ready: $($_.Exception.Message)"
}
