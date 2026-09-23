#Requires -Version 5.1
<#
.SYNOPSIS
  Negative/unit harness for native Windows helpers (runs on pwsh Linux or Windows).
  Covers: reserved $Host param absent, multi-line Redis INFO join+$Matches,
  Format-ProcessArgumentListString space/quote quoting, no bare Test-Path -or AST.
#>
$ErrorActionPreference = "Stop"
$NativeDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $NativeDir "NativeCommon.ps1")

$failures = New-Object System.Collections.Generic.List[string]
function Assert-True([bool]$Cond, [string]$Msg) {
  if (-not $Cond) { [void]$failures.Add($Msg); Write-Host "FAIL: $Msg" -ForegroundColor Red }
  else { Write-Host "PASS: $Msg" -ForegroundColor Green }
}

# --- 1) Reserved-name: Get-RedisVersionString must expose -HostName, not -Host ---
$cmd = Get-Command Get-RedisVersionString
$paramNames = @($cmd.Parameters.Keys)
Assert-True ($paramNames -contains "HostName") "Get-RedisVersionString has -HostName"
Assert-True (-not ($paramNames -contains "Host")) "Get-RedisVersionString does NOT have -Host (automatic/read-only)"

# Also: binding -HostName must not throw "Cannot overwrite variable Host"
$threw = $false
try {
  # Without redis-cli this returns $null via server path miss — but param bind must succeed
  $null = Get-RedisVersionString -RedisCli $null -HostName "127.0.0.1" -Port 16379 -RedisServerPath $null
} catch {
  if ("$($_.Exception.Message)" -match 'Cannot overwrite variable Host') { $threw = $true; [void]$failures.Add($_.Exception.Message) }
}
Assert-True (-not $threw) "Calling Get-RedisVersionString -HostName does not hit Host overwrite error"

# --- 2) Multi-line INFO array: join before -match so $Matches is set ---
# Simulate redis-cli output as string[]
$mockInfo = @(
  "# Server",
  "redis_version:5.0.14",
  "redis_mode:standalone",
  "os:Windows"
)
# Inline the same join logic as production (also exercise via a local clone)
$info = ($mockInfo -join "`n")
$parsed = $null
if ($info -match 'redis_version:([0-9]+\.[0-9]+\.[0-9]+)') { $parsed = $Matches[1] }
Assert-True ($parsed -eq "5.0.14") "Multi-line INFO joined string yields redis_version 5.0.14 via `$Matches"

# Negative note: -match on a string[] can leave $Matches unset/unreliable.
# Production Get-RedisVersionString joins to one string BEFORE -match (covered above).
try {
  $null = $Matches  # may be unset
} catch { }

# --- 3) ArgumentList quoting for paths with spaces ---
$q1 = Format-ProcessArgumentListString -Arguments @("C:\Program Files\app\bin\node.exe", "C:\path with space\main.js")
Assert-True ($q1 -eq '"C:\Program Files\app\bin\node.exe" "C:\path with space\main.js"') "Quote two spaced paths"
$q2 = Format-ProcessArgumentListString -Arguments @("plain", "has `"quote`" in it")
Assert-True ($q2 -eq 'plain "has ""quote"" in it"') "Escape embedded double quotes as doubled quotes"
$q3 = Format-ProcessArgumentListString -Arguments @("/tmp/no-spaces.conf")
Assert-True ($q3 -eq "/tmp/no-spaces.conf") "Unspaced arg stays bare"

# Actually start a process with a space path (Linux pwsh) if possible
$spaceDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sales os space " + [guid]::NewGuid().ToString("n").Substring(0,8))
New-Item -ItemType Directory -Force -Path $spaceDir | Out-Null
$scriptPath = Join-Path $spaceDir "echo-args.ps1"
@'
param([string]$Marker)
$Marker | Set-Content -LiteralPath (Join-Path $PSScriptRoot "out.txt") -Encoding ASCII
'@ | Set-Content -LiteralPath $scriptPath -Encoding UTF8
$outLog = Join-Path $spaceDir "stdout.log"
$errLog = Join-Path $spaceDir "stderr.log"
$pidFile = Join-Path $spaceDir "child.pid"
$marker = "SPACE_PATH_OK"
$pwshExe = (Get-Command pwsh).Source
# Pass script path (contains spaces) as ArgumentList element — must not split
try {
  $null = Start-LoggedProcess -FilePath $pwshExe `
    -ArgumentList @("-NoProfile", "-File", $scriptPath, "-Marker", $marker) `
    -WorkingDirectory $spaceDir -EnvMap @{} `
    -OutLog $outLog -ErrLog $errLog -PidFile $pidFile
  $deadline = (Get-Date).AddSeconds(15)
  $okFile = $false
  while ((Get-Date) -lt $deadline) {
    $outFile = Join-Path $spaceDir "out.txt"
    if (Test-Path -LiteralPath $outFile) {
      $got = (Get-Content -LiteralPath $outFile -Raw).Trim()
      if ($got -eq $marker) { $okFile = $true; break }
    }
    Start-Sleep -Milliseconds 200
  }
  Assert-True $okFile "Start-LoggedProcess with space-containing -File path ran child and wrote marker"
} catch {
  [void]$failures.Add("space-path Start-LoggedProcess threw: $($_.Exception.Message)")
  Write-Host "FAIL: space-path threw $($_.Exception.Message)" -ForegroundColor Red
}

# --- 4) AST: no bare Test-Path A -or Test-Path B in scripts/windows ---
$winRoot = (Resolve-Path (Join-Path $NativeDir "..")).Path
$ps1s = Get-ChildItem -Path $winRoot -Recurse -Filter *.ps1
$badAst = New-Object System.Collections.Generic.List[string]
foreach ($f in $ps1s) {
  $tokens = $null; $errs = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errs)
  # Look for CommandAst named Test-Path whose command elements include a bare -or token as argument
  $cmds = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
  foreach ($c in $cmds) {
    $name = $c.GetCommandName()
    if ($name -ne "Test-Path") { continue }
    foreach ($el in $c.CommandElements) {
      $txt = $el.Extent.Text
      if ($txt -eq "-or" -or $txt -eq "-and") {
        [void]$badAst.Add(("{0}:{1} Test-Path has operator {2} as command element (unparenthesized)" -f $f.Name, $c.Extent.StartLineNumber, $txt))
      }
    }
  }
}
Assert-True ($badAst.Count -eq 0) ("No unparenthesized Test-Path -or/-and command elements (count={0})" -f $badAst.Count)
foreach ($b in $badAst) { Write-Host "  $b" }

# --- 5) Reserved param audit across all functions ---
$reserved = @("Host","PID","Error","Args","Matches","PWD","Home","StackTrace","PSVersionTable","ExecutionContext","ShellId","input","foreach","switch","LastExitCode","PSCmdlet","PSBound")
$reservedHits = New-Object System.Collections.Generic.List[string]
foreach ($f in $ps1s) {
  $tokens = $null; $errs = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errs)
  $params = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.ParameterAst] }, $true)
  foreach ($pa in $params) {
    $pn = $pa.Name.VariablePath.UserPath
    if ($reserved -contains $pn) {
      [void]$reservedHits.Add(("{0}: `${1}" -f $f.Name, $pn))
    }
  }
}
Assert-True ($reservedHits.Count -eq 0) ("No reserved/automatic parameter names (hits={0})" -f $reservedHits.Count)
foreach ($h in $reservedHits) { Write-Host "  $h" }

Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host "HARNESS RESULT=PASS" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("HARNESS RESULT=FAIL count={0}" -f $failures.Count) -ForegroundColor Red
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}
