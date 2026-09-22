#Requires -Version 5.1
<#
.SYNOPSIS
  Start Sales OS internal trial via Docker Compose (Windows / Docker Desktop).
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

function Fail([string]$Msg) {
  Write-Host "ERROR: $Msg" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail @"
Docker 未安装或不在 PATH。
请先安装并启动 Docker Desktop（https://www.docker.com/products/docker-desktop/），然后重新打开 PowerShell 再运行本脚本。
本脚本不会自动安装 Docker Desktop。
"@
}

try {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
  Fail "Docker 已安装但守护进程未运行。请启动 Docker Desktop，等待其就绪后再试。"
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

Write-Host "Building and starting internal trial (data volumes retained across restarts)..."
docker compose -f $ComposeFile --env-file $EnvFile up -d --build
if ($LASTEXITCODE -ne 0) { Fail "docker compose up 失败（exit $LASTEXITCODE）" }

$WebPort = "18180"
if (Test-Path $EnvFile) {
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*HOST_WEB_PORT\s*=' } | Select-Object -First 1
  if ($line -match '=\s*(\d+)') { $WebPort = $Matches[1] }
}

Write-Host ""
Write-Host "OK. 浏览器打开: http://127.0.0.1:$WebPort" -ForegroundColor Green
Write-Host "API 也可经 Web /api 访问；可选直连 http://127.0.0.1:3100 （若 HOST_API_PORT 未改）。"
Write-Host "停止（保留数据）: .\scripts\windows\Stop-InternalTrial.ps1"
Write-Host "清空数据仅当 Stop 时加 -WipeVolumes（危险）。"
