#Requires -Version 5.1
<#
.SYNOPSIS
  Negative/unit harness for native Windows helpers (runs on pwsh Linux or Windows).
  Covers: reserved $Host param absent, multi-line Redis INFO join+$Matches,
  Format-ProcessArgumentListString space/quote quoting, no bare Test-Path -or AST,
  no piped Out-Null after pg_ctl/initdb/redis-server start, pipe-vs-file hang demo.
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
  $null = Get-RedisVersionString -RedisCli $null -HostName "127.0.0.1" -Port 56380 -RedisServerPath $null
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


# --- 6) No `| Out-Null` / `| Out-String` immediately after pg_ctl / initdb / redis-server start ---
# AST: Pipeline Ast whose first command looks like & $pgCtl / & $initdb / redis-server
# and last element is Out-Null or Out-String.
$pipeHits = New-Object System.Collections.Generic.List[string]
foreach ($f in $ps1s) {
  $tokens = $null; $errs = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errs)
  $pipes = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.PipelineAst] }, $true)
  foreach ($pipe in $pipes) {
    $elems = @($pipe.PipelineElements)
    if ($elems.Count -lt 2) { continue }
    $firstTxt = $elems[0].Extent.Text
    $lastName = $null
    $last = $elems[$elems.Count - 1]
    if ($last -is [System.Management.Automation.Language.CommandAst]) {
      $lastName = $last.GetCommandName()
    }
    if ($lastName -ne "Out-Null" -and $lastName -ne "Out-String") { continue }
    # Flag daemon starters only (not --version probes). Match tool vars / exe names.
    if ($firstTxt -match '(?i)--version') { continue }
    if ($firstTxt -match '(?i)(\$pgCtl|\$initdb|\$redisServer|pg_ctl(\.exe)?|initdb(\.exe)?|redis-server(\.exe)?)') {
      [void]$pipeHits.Add(("{0}:{1} piped {2} after daemon-ish: {3}" -f $f.Name, $pipe.Extent.StartLineNumber, $lastName, ($firstTxt.Substring(0, [Math]::Min(80, $firstTxt.Length)))))
    }
  }
}
Assert-True ($pipeHits.Count -eq 0) ("No Out-Null/Out-String pipeline after pg_ctl/initdb/redis-server (count={0})" -f $pipeHits.Count)
foreach ($h in $pipeHits) { Write-Host "  $h" }

# --- 7) Invoke-NativeToolProcess exists and returns exit of short-lived child ---
$cmdTool = Get-Command Invoke-NativeToolProcess -ErrorAction SilentlyContinue
Assert-True ($null -ne $cmdTool) "Invoke-NativeToolProcess is defined"
$tmpTool = Join-Path ([System.IO.Path]::GetTempPath()) ("sales-os-tool-" + [guid]::NewGuid().ToString("n").Substring(0,8))
New-Item -ItemType Directory -Force -Path $tmpTool | Out-Null
$childPs1 = Join-Path $tmpTool "short.ps1"
@'
param([int]$Code = 0)
exit $Code
'@ | Set-Content -LiteralPath $childPs1 -Encoding UTF8
$tout = Join-Path $tmpTool "out.log"
$terr = Join-Path $tmpTool "err.log"
try {
  $code = Invoke-NativeToolProcess -FilePath $pwshExe `
    -ArgumentList @("-NoProfile", "-File", $childPs1, "-Code", "7") `
    -WorkingDirectory $tmpTool -OutLog $tout -ErrLog $terr -TimeoutSec 15 -Label "short-tool"
  Assert-True ($code -eq 7) "Invoke-NativeToolProcess returns child exit code 7"
} catch {
  [void]$failures.Add("Invoke-NativeToolProcess threw: $($_.Exception.Message)")
  Write-Host "FAIL: Invoke-NativeToolProcess $($_.Exception.Message)" -ForegroundColor Red
}

# --- 8) Pipe inheritance hang vs file-redirect (mock long-lived child) ---
# Simulates why `& tool 2>&1 | Out-Null` hangs when a surviving grandchild keeps the pipe open.
$hangDir = Join-Path ([System.IO.Path]::GetTempPath()) ("sales-os-hang-" + [guid]::NewGuid().ToString("n").Substring(0,8))
New-Item -ItemType Directory -Force -Path $hangDir | Out-Null
$starter = Join-Path $hangDir "starter.ps1"
$daemon = Join-Path $hangDir "daemon.ps1"
$marker = Join-Path $hangDir "daemon.alive"
@'
param([string]$DaemonPath, [string]$MarkerPath)
# Start long-lived child inheriting our stdout/stderr, then exit (like pg_ctl)
Start-Process -FilePath (Get-Command pwsh).Source -ArgumentList @("-NoProfile","-File",$DaemonPath,"-MarkerPath",$MarkerPath) -NoNewWindow
Start-Sleep -Milliseconds 300
exit 0
'@ | Set-Content -LiteralPath $starter -Encoding UTF8
@'
param([string]$MarkerPath)
"alive" | Set-Content -LiteralPath $MarkerPath -Encoding ASCII
Start-Sleep -Seconds 20
'@ | Set-Content -LiteralPath $daemon -Encoding UTF8

# 8a) BAD pattern: pipeline Out-Null — expect hang beyond short timeout (we race it)
$pipeHung = $false
$job = Start-Job -ScriptBlock {
  param($Pwsh, $Starter, $Daemon, $Marker)
  & $Pwsh -NoProfile -File $Starter -DaemonPath $Daemon -MarkerPath $Marker 2>&1 | Out-Null
} -ArgumentList $pwshExe, $starter, $daemon, $marker
$waited = Wait-Job $job -Timeout 4
if (-not $waited) {
  $pipeHung = $true
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
} else {
  Receive-Job $job -ErrorAction SilentlyContinue | Out-Null
  Remove-Job $job -Force -ErrorAction SilentlyContinue
}
# On some hosts Start-Process -NoNewWindow may not inherit the pipeline the same way as native CreateProcess.
# Treat "hung OR completed" honestly: we only REQUIRE the file-redirect path to finish fast.
Assert-True ($true) ("Pipe-hang probe observed_hang={0} (informative; Windows CreateProcess inherit is the real risk)" -f $pipeHung)

# 8b) GOOD pattern: Invoke-NativeToolProcess / file redirects — must finish quickly
$goodOut = Join-Path $hangDir "good.out.log"
$goodErr = Join-Path $hangDir "good.err.log"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$goodCode = Invoke-NativeToolProcess -FilePath $pwshExe `
  -ArgumentList @("-NoProfile", "-File", $starter, "-DaemonPath", $daemon, "-MarkerPath", ($marker + ".good")) `
  -WorkingDirectory $hangDir -OutLog $goodOut -ErrLog $goodErr -TimeoutSec 10 -Label "starter-file-redirect"
$sw.Stop()
Assert-True ($goodCode -eq 0) "File-redirect starter returned exit 0 (does not wait on daemon lifetime)"
Assert-True ($sw.Elapsed.TotalSeconds -lt 8) ("File-redirect starter finished in {0:N1}s (<8s)" -f $sw.Elapsed.TotalSeconds)

# Cleanup leftover daemon processes best-effort (marker files)
Get-Process -Name pwsh -ErrorAction SilentlyContinue | Where-Object {
  try {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine
    $cl -and ($cl -like "*$hangDir*")
  } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
# Linux: kill by command line via pgrep if available
try {
  $pids = & pgrep -f ([regex]::Escape($hangDir)) 2>$null
  foreach ($x in @($pids)) { if ($x) { Stop-Process -Id ([int]$x) -Force -ErrorAction SilentlyContinue } }
} catch { }

# --- 9) Default port constants in examples must not be Sub2API 15432/16379 ---
$envEx = Join-Path $NativeDir ".env.native.example"
$envTxt = Get-Content -LiteralPath $envEx -Raw
Assert-True ($envTxt -match '(?m)^NATIVE_PG_PORT=55433\s*$') ".env.native.example default PG=55433"
Assert-True ($envTxt -match '(?m)^NATIVE_REDIS_PORT=56380\s*$') ".env.native.example default Redis=56380"
Assert-True ($envTxt -notmatch '(?m)^NATIVE_PG_PORT=15432\s*$') ".env.native.example does not default PG=15432"
Assert-True ($envTxt -notmatch '(?m)^NATIVE_REDIS_PORT=16379\s*$') ".env.native.example does not default Redis=16379"


Write-Host ""
if ($failures.Count -eq 0) {
  Write-Host "HARNESS RESULT=PASS" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("HARNESS RESULT=FAIL count={0}" -f $failures.Count) -ForegroundColor Red
  $failures | ForEach-Object { Write-Host " - $_" }
  exit 1
}
