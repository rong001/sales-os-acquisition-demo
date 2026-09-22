#Requires -Version 5.1
<#
.SYNOPSIS
  Start Sales OS internal trial via Docker Compose (Windows / Docker Desktop).
  Validates .env (key names only on fail), brings stack up, then gates on GET /api/health
  through the web port (JSON ok + sales-os-api). Never prints secret values.
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

function Get-ContainerDiag([string]$ComposeFile, [string]$EnvFile) {
  $lines = @()
  try {
    $raw = & docker compose -f $ComposeFile --env-file $EnvFile ps --format "{{.Name}} {{.Status}}" 2>$null
    if ($LASTEXITCODE -eq 0 -and $raw) {
      foreach ($r in @($raw)) { if ($r) { $lines += $r } }
    }
  } catch { }
  if ($lines.Count -eq 0) {
    try {
      $raw2 = & docker compose -f $ComposeFile --env-file $EnvFile ps 2>$null
      if ($raw2) {
        foreach ($r in @($raw2)) {
          if ($r -match 'NAME|----') { continue }
          if ($r -match '^(\S+)\s+.*?\s+(\w[\w\s\(\)]*?)\s*$') { }
          $parts = ($r -split '\s{2,}')
          if ($parts.Count -ge 2) { $lines += ($parts[0] + " " + $parts[-1]) }
        }
      }
    } catch { }
  }
  return $lines
}

# --- Docker present + running ---
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail @"
docker-not-running: Docker 未安装或不在 PATH。
请先安装并启动 Docker Desktop（https://www.docker.com/products/docker-desktop/），然后重新打开 PowerShell 再运行本脚本。
本脚本不会自动安装 Docker Desktop。
"@
}

try {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
  Fail "docker-not-running: Docker 已安装但守护进程未运行。请启动 Docker Desktop，等待其就绪后再试。"
}

$EnvFile = Join-Path $Root ".env"
$Example = Join-Path $Root ".env.internal-trial.example"
if (-not (Test-Path $EnvFile)) {
  if (Test-Path $Example) {
    Copy-Item $Example $EnvFile
    Write-Host "已从 .env.internal-trial.example 复制生成 .env — 请编辑其中 CHANGE_ME 后再启动。" -ForegroundColor Yellow
    Fail "请先填写 .env 中的密码/JWT，然后重新运行 Start-InternalTrial.ps1"
  }
  Fail "缺少 .env。请复制 .env.internal-trial.example 为 .env 并填写 CHANGE_ME。"
}

$ComposeFile = Join-Path $Root "docker-compose.internal-trial.yml"
if (-not (Test-Path $ComposeFile)) {
  Fail "缺少 docker-compose.internal-trial.yml"
}

$envMap = Parse-DotEnv $EnvFile
$required = @(
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "DEMO_AGENT_PASSWORD",
  "DEMO_AGENT2_PASSWORD",
  "DEMO_ADMIN_PASSWORD",
  "DEMO_MANAGER_PASSWORD",
  "DEMO_VIEWER_PASSWORD"
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
if ($envMap.ContainsKey("HOST_WEB_PORT") -and $envMap["HOST_WEB_PORT"] -match '^\d+$') {
  $WebPort = $envMap["HOST_WEB_PORT"]
}
if ($envMap.ContainsKey("HOST_API_PORT") -and $envMap["HOST_API_PORT"] -match '^\d+$') {
  $ApiPort = $envMap["HOST_API_PORT"]
}

# Ensure compose interpolation uses .env file values (process env wins over --env-file).
foreach ($k in $envMap.Keys) {
  Set-Item -Path "Env:$k" -Value $envMap[$k]
}

Write-Host "Building and starting internal trial (data volumes retained across restarts)..."
docker compose -f $ComposeFile --env-file $EnvFile up -d --build
if ($LASTEXITCODE -ne 0) {
  $diag = Get-ContainerDiag $ComposeFile $EnvFile
  Write-Host "FAIL: compose-up (docker compose up exit $LASTEXITCODE)" -ForegroundColor Red
  if ($diag.Count -gt 0) {
    Write-Host "Containers (name/status only):"
    $diag | ForEach-Object { Write-Host "  $_" }
  }
  Write-Host "服务不可用。请根据分类排查后重试。"
  exit 1
}

$healthUrl = "http://127.0.0.1:$WebPort/api/health"
$deadline = (Get-Date).AddSeconds(120)
$lastStatus = $null
$lastBody = $null
$passed = $false

Write-Host "Waiting for web /api/health (up to 120s): $healthUrl"
while ((Get-Date) -lt $deadline) {
  try {
    $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    $lastStatus = [int]$resp.StatusCode
    $lastBody = [string]$resp.Content
    if ($lastStatus -ge 200 -and $lastStatus -lt 300 -and (Test-ApiHealthJson $lastBody)) {
      $passed = $true
      break
    }
  } catch {
    $lastStatus = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      try { $lastStatus = [int]$_.Exception.Response.StatusCode } catch { }
    }
    $lastBody = $_.Exception.Message
  }
  Start-Sleep -Seconds 2
}

if ($passed) {
  Write-Host ""
  Write-Host "OK. 浏览器打开: http://127.0.0.1:$WebPort" -ForegroundColor Green
  Write-Host "健康检查通过: GET $healthUrl (ok + sales-os-api)"
  Write-Host "API 也可经 Web /api 访问；可选直连 http://127.0.0.1:$ApiPort （若 HOST_API_PORT 未改）。"
  Write-Host "自检: .\scripts\windows\Test-InternalTrial.ps1"
  Write-Host "停止（保留数据）: .\scripts\windows\Stop-InternalTrial.ps1"
  Write-Host "清空数据仅当 Stop 时加 -WipeVolumes（危险）。"
  exit 0
}

# --- Failure diagnostics (redacted) ---
$diag = Get-ContainerDiag $ComposeFile $EnvFile
$apiDirectOk = $false
$apiDirectSnippet = ""
$apiUrl = "http://127.0.0.1:$ApiPort/health"
try {
  $ar = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
  $apiDirectSnippet = Redact-Snippet ([string]$ar.Content)
  if ([int]$ar.StatusCode -ge 200 -and [int]$ar.StatusCode -lt 300 -and (Test-ApiHealthJson ([string]$ar.Content))) {
    $apiDirectOk = $true
  }
} catch {
  $apiDirectSnippet = Redact-Snippet ($_.Exception.Message)
}

$class = "api-or-db-not-ready"
if ($apiDirectOk) { $class = "web-proxy-broken" }

Write-Host ""
Write-Host "FAIL: $class — web /api/health gate did not pass within 120s" -ForegroundColor Red
Write-Host "URL: $healthUrl"
if ($null -ne $lastStatus) { Write-Host "Last HTTP: $lastStatus" } else { Write-Host "Last HTTP: (no response)" }
Write-Host "Last body snippet: $(Redact-Snippet $lastBody)"
Write-Host "Direct API $apiUrl healthy: $apiDirectOk  snippet: $apiDirectSnippet"
if ($diag.Count -gt 0) {
  Write-Host "Containers (name/status only):"
  $diag | ForEach-Object { Write-Host "  $_" }
}
Write-Host "服务不可用。切勿当作已可用；请排查后重试。"
exit 1
