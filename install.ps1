# MorgottStatusLine Installer for Windows
Write-Host "Installing MorgottStatusLine..." -ForegroundColor Cyan

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found. Install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install from GitHub
Write-Host "Installing package from GitHub..." -ForegroundColor Yellow
npm install -g "github:UberMorgott/MorgottStatusLine"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: npm install failed" -ForegroundColor Red
    exit 1
}

# Create config directory
$claudeDir = Join-Path $env:USERPROFILE ".claude"
if (-not (Test-Path $claudeDir)) {
    New-Item -ItemType Directory -Path $claudeDir | Out-Null
}

# Write config
$configPath = Join-Path $claudeDir "claude-limitline.json"
if (-not (Test-Path $configPath)) {
    $config = @'
{
  "display": {
    "style": "powerline",
    "useNerdFonts": true,
    "compactMode": "never"
  },
  "directory": { "enabled": true },
  "git": { "enabled": false },
  "model": { "enabled": true },
  "block": {
    "enabled": true,
    "displayStyle": "bar",
    "barWidth": 8,
    "showTimeRemaining": true
  },
  "weekly": {
    "enabled": true,
    "displayStyle": "bar",
    "barWidth": 8,
    "showWeekProgress": true,
    "viewMode": "smart"
  },
  "context": { "enabled": true },
  "budget": {
    "pollInterval": 15,
    "warningThreshold": 80
  },
  "theme": "dark",
  "segmentOrder": ["directory", "model", "context", "block", "weekly"],
  "showTrend": true
}
'@
    Set-Content -Path $configPath -Value $config -Encoding UTF8
    Write-Host "Config created: $configPath" -ForegroundColor Green
} else {
    Write-Host "Config already exists: $configPath (skipped)" -ForegroundColor Yellow
}

# Update settings.json
$settingsPath = Join-Path $claudeDir "settings.json"
if (Test-Path $settingsPath) {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
    $settings = [PSCustomObject]@{}
}

$statusLine = [PSCustomObject]@{
    type = "command"
    command = "morgott-statusline"
}
if ($settings.PSObject.Properties["statusLine"]) {
    $settings.statusLine = $statusLine
} else {
    $settings | Add-Member -NotePropertyName "statusLine" -NotePropertyValue $statusLine
}

$settings | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
Write-Host "Settings updated: $settingsPath" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Restart Claude Code to see the statusline." -ForegroundColor Cyan
Write-Host "  Brain = context | Stopwatch = 5h block | Calendar = weekly limit" -ForegroundColor DarkGray
