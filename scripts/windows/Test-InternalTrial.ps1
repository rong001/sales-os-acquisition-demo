#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only self-check for internal trial: GET web /api/health must return JSON ok + sales-os-api.
  Never dumps compose config or raw .env values.
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

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
  try {
    $j = $Body | ConvertFrom-Json -ErrorAction Stop
  } catch {
    return $false
  }
  $ok = $false
  if ($null -ne $j.ok) {
    if ($j.ok -is [bool]) { $ok = [bool]$j.ok }
    elseif ("$($j.ok)" -eq "True" -or "$($j.ok)" -eq "true" -or "$($j.ok)" -eq "1") { $ok = $true }
  }
  $svc = ""
  if ($null -ne $j.service) { $svc = [string]$j.service }
  return ($ok -and $svc -eq "sales-os-api")
}

function Redact-Snippet([string]$Text, [int]$Max = 120) {
  if ($null -eq $Text) { return "" }
  $s = $Text -replace '(?i)(password|secret|token|authorization|bearer)\s*[:=]\s*\S+', '$1=***'
  $s = $s -replace '\s+', ' '
  if ($s.Length -gt $Max) { $s = $s.Substring(0, $Max) + "..." }
  return $s
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "docker-not-running: Docker 未安装或不在 PATH。"
}
try {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
  Fail "docker-not-running: Docker 守护进程未运行。"
}

$EnvFile = Join-Path $Root ".env"
$ComposeFile = Join-Path $Root "docker-compose.internal-trial.yml"
if (-not (Test-Path $ComposeFile)) { Fail "缺少 docker-compose.internal-trial.yml" }
if (-not (Test-Path $EnvFile)) { Fail "缺少 .env（不打印内容）。请先配置后再测。" }

$envMap = Parse-DotEnv $EnvFile
# Key presence only — do not print values
$required = @(
  "POSTGRES_PASSWORD", "JWT_SECRET",
  "DEMO_AGENT_PASSWORD", "DEMO_AGENT2_PASSWORD",
  "DEMO_ADMIN_PASSWORD", "DEMO_MANAGER_PASSWORD", "DEMO_VIEWER_PASSWORD"
)
$bad = @()
foreach ($k in $required) {
  if (-not $envMap.ContainsKey($k)) { $bad += $k; continue }
  $v = $envMap[$k]
  if ([string]::IsNullOrWhiteSpace($v) -or $v -eq "CHANGE_ME") { $bad += $k }
}
if ($bad.Count -gt 0) {
  Fail ("Required .env keys empty or CHANGE_ME: " + ($bad -join ", "))
}

$WebPort = "18180"
$ApiPort = "3100"
if ($envMap.ContainsKey("HOST_WEB_PORT") -and $envMap["HOST_WEB_PORT"] -match '^\d+$') { $WebPort = $envMap["HOST_WEB_PORT"] }
if ($envMap.ContainsKey("HOST_API_PORT") -and $envMap["HOST_API_PORT"] -match '^\d+$') { $ApiPort = $envMap["HOST_API_PORT"] }

$healthUrl = "http://127.0.0.1:$WebPort/api/health"
Write-Host "Checking $healthUrl ..."

$lastStatus = $null
$lastBody = $null
$passed = $false
try {
  $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
  $lastStatus = [int]$resp.StatusCode
  $lastBody = [string]$resp.Content
  if ($lastStatus -ge 200 -and $lastStatus -lt 300 -and (Test-ApiHealthJson $lastBody)) {
    $passed = $true
  }
} catch {
  $lastBody = $_.Exception.Message
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    try { $lastStatus = [int]$_.Exception.Response.StatusCode } catch { }
  }
}

if ($passed) {
  Write-Host "OK. http://127.0.0.1:$WebPort  (web /api/health = ok + sales-os-api)" -ForegroundColor Green
  exit 0
}

# Redacted classify
$apiDirectOk = $false
$apiSnippet = ""
try {
  $ar = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  $apiSnippet = Redact-Snippet ([string]$ar.Content)
  if ([int]$ar.StatusCode -ge 200 -and [int]$ar.StatusCode -lt 300 -and (Test-ApiHealthJson ([string]$ar.Content))) {
    $apiDirectOk = $true
  }
} catch {
  $apiSnippet = Redact-Snippet ($_.Exception.Message)
}

$class = "api-or-db-not-ready"
if ($apiDirectOk) { $class = "web-proxy-broken" }

$diag = @()
try {
  $raw = & docker compose -f $ComposeFile --env-file $EnvFile ps --format "{{.Name}} {{.Status}}" 2>$null
  if ($LASTEXITCODE -eq 0 -and $raw) { foreach ($r in @($raw)) { if ($r) { $diag += $r } } }
} catch { }

Write-Host "FAIL: $class" -ForegroundColor Red
if ($null -ne $lastStatus) { Write-Host "Last HTTP: $lastStatus" } else { Write-Host "Last HTTP: (no response)" }
Write-Host "Last body snippet: $(Redact-Snippet $lastBody)"
Write-Host "Direct API healthy: $apiDirectOk  snippet: $apiSnippet"
if ($diag.Count -gt 0) {
  Write-Host "Containers (name/status only):"
  $diag | ForEach-Object { Write-Host "  $_" }
}
Write-Host "服务不可用。"
exit 1
