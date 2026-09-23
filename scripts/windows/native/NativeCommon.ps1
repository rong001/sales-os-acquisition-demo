#Requires -Version 5.1
<#
.SYNOPSIS
  Shared helpers for Windows-native Sales OS internal trial scripts.
  Dot-source from Start/Stop/Test. Never prints secret values.
#>

function Fail([string]$Msg) {
  Write-Host "FAIL: $Msg" -ForegroundColor Red
  exit 1
}

function Parse-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
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

# Readiness body (followup1217): /health and /api/health return check=readiness.
# Liveness is /health/live only — do not gate Start/Test on liveness alone.
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

function Get-ProjectRootFromNativeScript {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
}

function Normalize-PathLoose([string]$P) {
  if ([string]::IsNullOrWhiteSpace($P)) { return "" }
  try {
    return [System.IO.Path]::GetFullPath($P).TrimEnd('\', '/').ToLowerInvariant()
  } catch {
    return $P.TrimEnd('\', '/').ToLowerInvariant()
  }
}

function Test-PathUnderRoot([string]$Candidate, [string]$Root) {
  $c = Normalize-PathLoose $Candidate
  $r = Normalize-PathLoose $Root
  if ($r -eq "" -or $c -eq "") { return $false }
  return ($c -eq $r -or $c.StartsWith($r + [System.IO.Path]::DirectorySeparatorChar) -or $c.StartsWith($r + "/"))
}

function Get-ProcessOwnershipInfo([int]$ProcId) {
  $info = [ordered]@{ Id = $ProcId; CommandLine = $null; ExecutablePath = $null; Name = $null }
  try {
    $p = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcId" -ErrorAction SilentlyContinue
    if ($p) {
      $info.CommandLine = [string]$p.CommandLine
      $info.ExecutablePath = [string]$p.ExecutablePath
      $info.Name = [string]$p.Name
    }
  } catch { }
  if (-not $info.Name) {
    try {
      $gp = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
      if ($gp) {
        $info.Name = $gp.ProcessName
        try { $info.ExecutablePath = $gp.Path } catch { }
      }
    } catch { }
  }
  return $info
}

function Test-ProcessBelongsToProject([int]$ProcId, [string]$Root) {
  $info = Get-ProcessOwnershipInfo $ProcId
  if (-not $info.Name) { return $false }
  $rootNorm = Normalize-PathLoose $Root
  $hay = @($info.CommandLine, $info.ExecutablePath) | Where-Object { $_ }
  foreach ($h in $hay) {
    $hl = $h.ToLowerInvariant()
    if ($hl.Contains($rootNorm)) { return $true }
    # Also accept forward-slash form of root
    $alt = $rootNorm -replace '\\', '/'
    if ($alt -ne $rootNorm -and $hl.Contains($alt)) { return $true }
  }
  return $false
}

function Stop-OwnedPidFile {
  param(
    [Parameter(Mandatory = $true)][string]$RunDir,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$ForceRemovePidFile
  )
  $f = Join-Path $RunDir "$Name.pid"
  if (-not (Test-Path -LiteralPath $f)) { return }
  $pidText = (Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pidText -match '^\d+$') {
    $procId = [int]$pidText
    $alive = $null
    try { $alive = Get-Process -Id $procId -ErrorAction SilentlyContinue } catch { }
    if ($alive) {
      if (Test-ProcessBelongsToProject -ProcId $procId -Root $Root) {
        try {
          Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
          Write-Host "Stopped $Name pid=$procId (verified project-owned)"
        } catch {
          Write-Host "WARN: could not stop $Name pid=$procId"
        }
      } else {
        Write-Host "SKIP stop $Name pid=$procId — not owned by this project path (refusing stale/foreign PID)" -ForegroundColor Yellow
      }
    }
  }
  Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
}

function Format-ProcessArgumentListString {
  <#
    Build a single ArgumentList string for Start-Process (Windows PowerShell 5.1 safe).
    Passing a string[] to Start-Process -ArgumentList joins with spaces WITHOUT quoting,
    so paths with spaces split. Pass ONE string with Windows argv quoting instead:
    wrap args that contain whitespace or " in double quotes; embed " as "".
  #>
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Arguments
  )
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($a in $Arguments) {
    if ($null -eq $a) { continue }
    $s = [string]$a
    if ($s -match '[ 	"]') {
      $escaped = $s -replace '"', '""'
      [void]$parts.Add('"' + $escaped + '"')
    } else {
      [void]$parts.Add($s)
    }
  }
  return ($parts -join ' ')
}

function Start-LoggedProcess {
  <#
    Start a process with stdout/stderr redirected to independent log files.
    Does NOT use Start-Job + Process object marshalling (unreliable across jobs).
    WindowStyle Hidden / no console popup. Temporarily sets process-level env.

    ArgumentList: prefer string[] of raw args; we convert to a SINGLE quoted string
    for Start-Process (PS 5.1). Do not pass an unquoted array to Start-Process.
  #>
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [hashtable]$EnvMap = @{},
    [Parameter(Mandatory = $true)][string]$OutLog,
    [Parameter(Mandatory = $true)][string]$ErrLog,
    [Parameter(Mandatory = $true)][string]$PidFile
  )
  $outDir = Split-Path -Parent $OutLog
  if ($outDir) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
  # Truncate prior logs so Start-Process can open them
  foreach ($lf in @($OutLog, $ErrLog)) {
    if (Test-Path -LiteralPath $lf) { Remove-Item -LiteralPath $lf -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType File -Force -Path $lf | Out-Null
  }

  $saved = @{}
  foreach ($k in $EnvMap.Keys) {
    $saved[$k] = [Environment]::GetEnvironmentVariable([string]$k, "Process")
    [Environment]::SetEnvironmentVariable([string]$k, [string]$EnvMap[$k], "Process")
  }
  try {
    $argArr = @()
    if ($ArgumentList -is [System.Array]) { $argArr = @($ArgumentList) } else { $argArr = @([string]$ArgumentList) }
    # PS 5.1: single string with proper quoting — array form re-splits on spaces
    $argString = Format-ProcessArgumentListString -Arguments $argArr
    $spParams = @{
      FilePath = $FilePath
      ArgumentList = $argString
      WorkingDirectory = $WorkingDirectory
      RedirectStandardOutput = $OutLog
      RedirectStandardError = $ErrLog
      PassThru = $true
    }
    # -WindowStyle works on Windows only. Parameter metadata exists on Linux pwsh but runtime rejects it.
    # Windows PowerShell 5.1 has no $IsWindows (always Windows); PS 6+ exposes $IsWindows.
    $onWindows = $true
    if ($PSVersionTable.PSVersion.Major -ge 6) { $onWindows = [bool]$IsWindows }
    if ($onWindows) { $spParams["WindowStyle"] = "Hidden" }
    $p = Start-Process @spParams
    if (-not $p) { throw "Start-Process returned null for $FilePath" }
    "$($p.Id)" | Set-Content -LiteralPath $PidFile -Encoding ASCII
    return $p
  } finally {
    foreach ($k in $EnvMap.Keys) {
      [Environment]::SetEnvironmentVariable([string]$k, $saved[$k], "Process")
    }
  }
}

function Find-RedisCliNear([string]$RedisServerPath) {
  if ($RedisServerPath) {
    $dir = Split-Path -Parent $RedisServerPath
    foreach ($n in @("redis-cli.exe", "redis-cli")) {
      $c = Join-Path $dir $n
      if (Test-Path -LiteralPath $c) { return $c }
    }
  }
  $cmd = Get-Command "redis-cli" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Get-RedisVersionString {
  # NOTE: do NOT name a parameter $Host — $Host is a read-only automatic variable in PowerShell.
  param(
    [string]$RedisCli,
    [string]$HostName = "127.0.0.1",
    [int]$Port = 6379,
    [string]$RedisServerPath = $null
  )
  if ($RedisCli) {
    try {
      $infoRaw = & $RedisCli -h $HostName -p $Port INFO server 2>$null
      # redis-cli INFO returns a multi-line string[]; -match on arrays does not set $Matches
      $info = if ($null -eq $infoRaw) { "" } elseif ($infoRaw -is [System.Array]) { ($infoRaw -join "`n") } else { [string]$infoRaw }
      if ($info -match 'redis_version:([0-9]+\.[0-9]+\.[0-9]+)') {
        return $Matches[1]
      }
      if ($info -match 'redis_version:([0-9]+\.[0-9]+)') {
        return $Matches[1]
      }
    } catch { }
  }
  if ($RedisServerPath -and (Test-Path -LiteralPath $RedisServerPath)) {
    try {
      # Short-lived --version: capture without pipeline (avoid Out-String hang class)
      $verRaw = & $RedisServerPath --version 2>$null
      $verOut = if ($null -eq $verRaw) { "" } elseif ($verRaw -is [System.Array]) { ($verRaw -join "`n") } else { [string]$verRaw }
      if ($verOut -match 'v=([0-9]+\.[0-9]+\.[0-9]+)') { return $Matches[1] }
      if ($verOut -match '([0-9]+\.[0-9]+\.[0-9]+)') { return $Matches[1] }
    } catch { }
  }
  return $null
}

function Test-RedisVersionAtLeast {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [int]$MinMajor = 5
  )
  if ($Version -match '^(\d+)') {
    return ([int]$Matches[1] -ge $MinMajor)
  }
  return $false
}

function Assert-RedisVersionOk {
  param(
    [string]$Version,
    [int]$MinMajor = 5
  )
  if (-not $Version) {
    Fail "redis-version-unknown: could not read Redis version. Worker needs Redis 5+ (streams XGROUP/XADD). Install tporadowski Redis 5.x via Fetch-NativeDeps.ps1 into vendor\windows\redis\ (do not use Redis 3.0.x MSOpenTech)."
  }
  if (-not (Test-RedisVersionAtLeast -Version $Version -MinMajor $MinMajor)) {
    Fail "redis-too-old: found Redis $Version — need Redis $MinMajor+ for streams (XGROUP/XADD). Redis 3.0.504 is insufficient. Run Fetch-NativeDeps.ps1 (tporadowski Redis 5.0.14.1) into vendor\windows\redis\ and use dedicated NATIVE_REDIS_PORT (default 56380; prior trial ports 55432/56379 also OK if free). Do not replace other Redis services. Avoid 15432/16379 (Sub2API/Garnet)."
  }
}


function Get-PortOccupierHint {
  <#
    Best-effort listener identity for FAIL messages. Never kills.
    Returns a short string like "pid=1234 name=postgres" or "unknown".
  #>
  param([Parameter(Mandatory = $true)][int]$Port)
  $bits = New-Object System.Collections.Generic.List[string]
  try {
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $Port }
    foreach ($l in @($listeners)) {
      $oid = $null
      try { $oid = [int]$l.OwningProcess } catch { }
      if (-not $oid) { continue }
      $info = Get-ProcessOwnershipInfo $oid
      $nm = if ($info.Name) { $info.Name } else { "?" }
      $hint = "pid=$oid name=$nm"
      if ($info.ExecutablePath) {
        $hint += (" path={0}" -f $info.ExecutablePath)
      } elseif ($info.CommandLine) {
        $cl = $info.CommandLine
        if ($cl.Length -gt 120) { $cl = $cl.Substring(0, 117) + "..." }
        $hint += (" cmd=$cl")
      }
      [void]$bits.Add($hint)
    }
  } catch { }
  if ($bits.Count -eq 0) { return "unknown (could not resolve OwningProcess)" }
  return ($bits -join "; ")
}

function Invoke-NativeToolProcess {
  <#
    Run a SHORT-LIVED native tool (initdb, pg_ctl, …) without PowerShell pipelines.
    NEVER use `& tool … 2>&1 | Out-Null` for daemon starters: long-lived children
    inherit the pipe and hang the parent forever (seen with pg_ctl start on Windows
    spaced paths). Instead: Start-Process with stdout/stderr redirected to separate
    log files, WaitForExit on the tool PID only, with an explicit timeout.
    Does NOT wait on surviving children (postgres/redis-server).
  #>
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)]$ArgumentList,
    [string]$WorkingDirectory = $null,
    [Parameter(Mandatory = $true)][string]$OutLog,
    [Parameter(Mandatory = $true)][string]$ErrLog,
    [int]$TimeoutSec = 120,
    [string]$Label = "tool"
  )
  $outDir = Split-Path -Parent $OutLog
  if ($outDir) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
  foreach ($lf in @($OutLog, $ErrLog)) {
    if (Test-Path -LiteralPath $lf) { Remove-Item -LiteralPath $lf -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType File -Force -Path $lf | Out-Null
  }
  $argArr = @()
  if ($ArgumentList -is [System.Array]) { $argArr = @($ArgumentList) } else { $argArr = @([string]$ArgumentList) }
  $argString = Format-ProcessArgumentListString -Arguments $argArr
  $spParams = @{
    FilePath               = $FilePath
    ArgumentList           = $argString
    RedirectStandardOutput = $OutLog
    RedirectStandardError  = $ErrLog
    PassThru               = $true
  }
  if ($WorkingDirectory) { $spParams["WorkingDirectory"] = $WorkingDirectory }
  $onWindows = $true
  if ($PSVersionTable.PSVersion.Major -ge 6) { $onWindows = [bool]$IsWindows }
  if ($onWindows) { $spParams["WindowStyle"] = "Hidden" }
  $p = Start-Process @spParams
  if (-not $p) { throw "Start-Process returned null for $Label ($FilePath)" }
  $ms = [Math]::Max(1000, $TimeoutSec * 1000)
  $finished = $p.WaitForExit($ms)
  if (-not $finished) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
    throw ("{0}-timeout: {1} did not exit within {2}s (pid={3}). See {4} / {5}. Surviving children were NOT killed." -f $Label, (Split-Path -Leaf $FilePath), $TimeoutSec, $p.Id, $OutLog, $ErrLog)
  }
  # ExitCode may need Refresh on some hosts
  try { $p.Refresh() } catch { }
  $code = 0
  try { $code = [int]$p.ExitCode } catch { $code = -1 }
  return $code
}

function Wait-TcpAccept {
  param(
    [string]$HostName = "127.0.0.1",
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSec = 60,
    [string]$Label = "service"
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect($HostName, $Port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(1000, $false)
      if ($ok -and $client.Connected) {
        $client.Close()
        return $true
      }
      try { $client.Close() } catch { }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Invoke-RedisPing {
  param(
    [Parameter(Mandatory = $true)][string]$RedisCli,
    [string]$HostName = "127.0.0.1",
    [Parameter(Mandatory = $true)][int]$Port
  )
  try {
    $r = & $RedisCli -h $HostName -p $Port PING 2>$null
    return ("$r".Trim() -eq "PONG")
  } catch {
    return $false
  }
}

function Test-LogLooksFatal([string]$LogPath) {
  if (-not (Test-Path -LiteralPath $LogPath)) { return $false }
  try {
    $tail = Get-Content -LiteralPath $LogPath -Tail 40 -ErrorAction SilentlyContinue
    $text = ($tail -join "`n")
    if ($text -match '(?i)\b(FATAL|UnhandledPromiseRejection|EADDRINUSE|Cannot find module)\b') { return $true }
  } catch { }
  return $false
}

function Test-WorkerReadyFromLog([string]$OutLog) {
  if (-not (Test-Path -LiteralPath $OutLog)) { return $false }
  try {
    $tail = Get-Content -LiteralPath $OutLog -Tail 80 -ErrorAction SilentlyContinue
    $text = ($tail -join "`n")
    if ($text -match 'Sales OS worker online') { return $true }
    if ($text -match 'created consumer group') { return $true }
    if ($text -match 'BUSYGROUP') { return $true }
  } catch { }
  return $false
}
