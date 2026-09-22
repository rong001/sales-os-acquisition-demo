#Requires -Version 5.1
<#
.SYNOPSIS
  Stop Sales OS internal trial Compose stack.
.PARAMETER WipeVolumes
  If set, also remove named volumes (DESTROYS DB/Redis data). Default: keep volumes.
#>
param(
  [switch]$WipeVolumes
)
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
请先安装并启动 Docker Desktop。本脚本不会自动安装 Docker Desktop。
"@
}

$EnvFile = Join-Path $Root ".env"
$ComposeFile = Join-Path $Root "docker-compose.internal-trial.yml"
if (-not (Test-Path $ComposeFile)) { Fail "缺少 docker-compose.internal-trial.yml" }

$EnvArgs = @()
if (Test-Path $EnvFile) { $EnvArgs = @("--env-file", $EnvFile) }

if ($WipeVolumes) {
  Write-Host "WARNING: 将删除 Compose 卷（数据库/Redis 数据不可恢复）..." -ForegroundColor Yellow
  docker compose -f $ComposeFile @EnvArgs down -v
} else {
  Write-Host "Stopping containers; volumes kept (data retained)..."
  docker compose -f $ComposeFile @EnvArgs down
}

if ($LASTEXITCODE -ne 0) { Fail "docker compose down 失败（exit $LASTEXITCODE）" }
Write-Host "OK." -ForegroundColor Green
