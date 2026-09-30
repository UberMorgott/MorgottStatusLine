# MorgottStatusLine Installer for Windows
Write-Host "Installing MorgottStatusLine..." -ForegroundColor Cyan

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found. Install Node.js from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install from GitHub
Write-Host "Installing package from GitHub..." -ForegroundColor Yellow
npm install -g --force "github:UberMorgott/MorgottStatusLine"
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
    "pollInterval": 5,
    "warningThreshold": 80
  },
  "theme": "dark",
  "segmentOrder": ["directory", "model", "context", "block", "weekly"],
  "showTrend": true
}
'@
    # WriteAllText = UTF-8 without BOM (Set-Content -Encoding UTF8 adds a BOM on PS 5.1)
    [System.IO.File]::WriteAllText($configPath, $config)
    Write-Host "Config created: $configPath" -ForegroundColor Green
} else {
    Write-Host "Config already exists: $configPath (skipped)" -ForegroundColor Yellow
}

# Update settings.json
$settingsPath = Join-Path $claudeDir "settings.json"
if (Test-Path $settingsPath) {
    # -Encoding UTF8: PS 5.1 otherwise reads BOM-less files as ANSI and mangles non-ASCII
    try { $settings = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop } catch { $settings = $null }
    if ($null -eq $settings) {
        Write-Host "Error: $settingsPath is not valid JSON (left untouched). Add statusLine manually." -ForegroundColor Red
        exit 1
    }
} else {
    $settings = [PSCustomObject]@{}
}

# A bare command only works if npm's global bin dir is on PATH. Otherwise write
# node + absolute script path (forward slashes, quoted) - valid in cmd, bash and pwsh.
$statusCmd = "morgott-statusline"
if (-not (Get-Command morgott-statusline -ErrorAction SilentlyContinue)) {
    $scriptPath = Join-Path (npm root -g).Trim() "morgott-statusline\dist\index.js"
    $statusCmd = 'node "{0}"' -f ($scriptPath -replace '\\', '/')
    Write-Host "Warning: npm global bin dir is not in PATH; settings.json will use: $statusCmd" -ForegroundColor Yellow
}

$statusLine = [PSCustomObject]@{
    type = "command"
    command = $statusCmd
}
if ($settings.PSObject.Properties["statusLine"]) {
    $settings.statusLine = $statusLine
} else {
    $settings | Add-Member -NotePropertyName "statusLine" -NotePropertyValue $statusLine
}

[System.IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 10))
Write-Host "Settings updated: $settingsPath" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Restart Claude Code to see the statusline." -ForegroundColor Cyan
Write-Host "  Brain = context | Stopwatch = 5h block | Calendar = weekly limit" -ForegroundColor DarkGray
