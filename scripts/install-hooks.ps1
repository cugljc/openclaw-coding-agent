# Install Claude Code hooks (Windows)
param(
  [string]$HooksDir = (Join-Path $env:USERPROFILE '.claude\hooks'),
  [string]$SettingsFile = (Join-Path $env:USERPROFILE '.claude\settings.json')
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceHook = Join-Path $ScriptDir '..\hooks\on-complete.ps1'

Write-Host 'Installing Claude Code completion hooks...'

New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null
Copy-Item -Force $SourceHook (Join-Path $HooksDir 'on-complete.ps1')
Write-Host "  Copied on-complete.ps1 -> $HooksDir\"

# Register in settings.json
if (-not (Test-Path $SettingsFile)) {
  '{}' | Set-Content -Path $SettingsFile -Encoding UTF8
}

$settings = Get-Content -Raw $SettingsFile | ConvertFrom-Json

if (-not $settings.hooks) {
  $settings | Add-Member -NotePropertyName 'hooks' -NotePropertyValue @{} -Force
}

$hookEntry = @{
  type = 'command'
  command = "powershell -ExecutionPolicy Bypass -File `"$(Join-Path $HooksDir 'on-complete.ps1')`""
  timeout = 10
}

$hookWrapper = @{ hooks = @($hookEntry) }

if (-not $settings.hooks.Stop) {
  $settings.hooks | Add-Member -NotePropertyName 'Stop' -NotePropertyValue @($hookWrapper) -Force
  Write-Host '  Registered Stop hook'
} else {
  Write-Host '  Stop hook already registered'
}

if (-not $settings.hooks.SessionEnd) {
  $settings.hooks | Add-Member -NotePropertyName 'SessionEnd' -NotePropertyValue @($hookWrapper) -Force
  Write-Host '  Registered SessionEnd hook'
} else {
  Write-Host '  SessionEnd hook already registered'
}

$settings | ConvertTo-Json -Depth 10 | Set-Content -Path $SettingsFile -Encoding UTF8

Write-Host ''
Write-Host 'Done! Hook will fire when Claude Code tasks complete.'
Write-Host "Results saved to: $env:USERPROFILE\.openclaw\agents\coding-agent\results\"
