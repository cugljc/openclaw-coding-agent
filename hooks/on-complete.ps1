# Claude Code Stop Hook — on-complete notification (Windows)
# Install: copy to %USERPROFILE%\.claude\hooks\ and register in settings.json

param(
  [string]$ResultDir = (Join-Path $env:USERPROFILE '.openclaw\agents\coding-agent\results')
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $ResultDir | Out-Null

$lockFile = Join-Path $ResultDir '.hook-lock'
$logFile = Join-Path $ResultDir 'hook.log'

function Write-Log { param([string]$Msg); Add-Content -Path $logFile -Value "[$(Get-Date -Format 's')] $Msg" -Encoding UTF8 }

Write-Log '=== Hook fired ==='

# Dedup
if (Test-Path $lockFile) {
  $lockAge = ((Get-Date) - (Get-Item $lockFile).LastWriteTime).TotalSeconds
  if ($lockAge -lt 30) {
    Write-Log "Duplicate hook within ${lockAge}s, skipping"
    exit 0
  }
}
Set-Content -Path $lockFile -Value (Get-Date -Format 's')

# Read stdin JSON
$input = ''
try { $input = [Console]::In.ReadToEnd() } catch {}

$sessionId = 'unknown'
$cwd = ''
$event = 'unknown'
try {
  $obj = $input | ConvertFrom-Json -ErrorAction Stop
  $sessionId = if ($obj.session_id) { $obj.session_id } else { 'unknown' }
  $cwd = if ($obj.cwd) { $obj.cwd } else { '' }
  $event = if ($obj.hook_event_name) { $obj.hook_event_name } else { 'unknown' }
} catch {}

Write-Log "session=$sessionId cwd=$cwd event=$event"

# Capture output
$output = ''
$taskOutput = Join-Path $ResultDir 'task-output.txt'
Start-Sleep -Seconds 1

if ((Test-Path $taskOutput) -and (Get-Item $taskOutput).Length -gt 0) {
  $output = Get-Content -Raw -Encoding UTF8 $taskOutput -ErrorAction SilentlyContinue
  if ($output.Length -gt 4000) { $output = $output.Substring($output.Length - 4000) }
  Write-Log "Output from task-output.txt ($($output.Length) chars)"
}

# Write result
$result = [ordered]@{
  session_id = $sessionId
  timestamp = (Get-Date -Format 's')
  cwd = $cwd
  event = $event
  agent_type = 'claude-code'
  output = $output
  status = 'done'
}
$result | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $ResultDir 'latest-hook.json') -Encoding UTF8
Write-Log 'Wrote latest-hook.json'

# Notify via openclaw
$openclawBin = Get-Command openclaw.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $openclawBin) { $openclawBin = Get-Command openclaw -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source }

if ($openclawBin) {
  $brief = if ($output.Length -gt 600) { $output.Substring(0, 600) } else { $output }
  $msg = "[Claude Code] Task completed`nSession: $sessionId`n$brief"
  try {
    & $openclawBin system event --mode now --text $msg 2>$null | Out-Null
    Write-Log 'Sent system event'
  } catch {
    Write-Log "System event failed: $($_.Exception.Message)"
  }
}

# Pending wake
$wake = [ordered]@{
  session_id = $sessionId
  agent_type = 'claude-code'
  timestamp = (Get-Date -Format 's')
  summary = if ($output.Length -gt 500) { $output.Substring(0, 500) } else { $output }
  processed = $false
}
$wake | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $ResultDir 'pending-wake.json') -Encoding UTF8

Write-Log '=== Hook completed ==='
exit 0
