#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only health gate for Windows-native trial.
  Never dumps .env.native values. Never prints SUCCESS if health fails.
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $Root
$EnvFile = Join-Path $Root ".env.native"

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  exit 1
}

function Parse-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      if ($val.Length -ge 2) { $val = $val.Substring(1, $val.Length - 2) }
    }
    if ($key -ne "") { $map[$key] = $val }
  }
  return $map
}

function Test-ApiHealthJson([string]$Body) {
  if ([string]::IsNullOrWhiteSpace($Body)) { return $false }
  $trim = $Body.TrimStart()
  if (-not ($trim.StartsWith("{") -or $trim.StartsWith("["))) { return $false }
  try { $j = $Body | ConvertFrom-Json -ErrorAction Stop } catch { return $false }
  $ok = $false
  if ($null -ne $j.ok) {
    if ($j.ok -is [bool]) { $ok = [bool]$j.ok }
    elseif ("$($j.ok)" -eq "True" -or "$($j.ok)" -eq "true" -or "$($j.ok)" -eq "1") { $ok = $true }
  }
  $svc = ""
  if ($null -ne $j.service) { $svc = [string]$j.service }
  return ($ok -and $svc -eq "sales-os-api")
}

if (-not (Test-Path $EnvFile)) { Fail "missing .env.native (run Start-InternalTrial-Native.ps1 first)" }
$envMap = Parse-DotEnv $EnvFile
$WebPort = "19280"
if ($envMap.ContainsKey("NATIVE_WEB_PORT") -and $envMap["NATIVE_WEB_PORT"] -match '^\d+$') {
  $WebPort = $envMap["NATIVE_WEB_PORT"]
}
$ApiPort = "39300"
if ($envMap.ContainsKey("NATIVE_API_PORT") -and $envMap["NATIVE_API_PORT"] -match '^\d+$') {
  $ApiPort = $envMap["NATIVE_API_PORT"]
}

$healthUrl = "http://127.0.0.1:$WebPort/api/health"
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  $body = [string]$resp.Content
  if ([int]$resp.StatusCode -ge 200 -and [int]$resp.StatusCode -lt 300 -and (Test-ApiHealthJson $body)) {
    Write-Host "OK. http://127.0.0.1:$WebPort  (web /api/health = ok + sales-os-api)" -ForegroundColor Green
    exit 0
  }
  Fail "api-or-db-not-ready: unexpected health body (not printed)"
} catch {
  # classify
  $apiOk = $false
  try {
    $ar = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ((Test-ApiHealthJson ([string]$ar.Content))) { $apiOk = $true }
  } catch { }
  if ($apiOk) { Fail "web-proxy-broken: direct API healthy but web /api/health failed" }
  Fail "api-or-db-not-ready: $($_.Exception.Message)"
}
