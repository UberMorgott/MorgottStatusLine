#!/bin/bash
# MorgottStatusLine Installer for macOS/Linux
# Usage: curl -fsSL <url>/install.sh | sudo bash
set -e

echo -e "\033[36mInstalling MorgottStatusLine...\033[0m"

# Resolve real user's home when running under sudo
if [ -n "$SUDO_USER" ]; then
    REAL_HOME=$(eval echo "~$SUDO_USER")
    REAL_USER="$SUDO_USER"
else
    REAL_HOME="$HOME"
    REAL_USER="$(whoami)"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "\033[31mError: npm not found. Install Node.js from https://nodejs.org\033[0m"
    exit 1
fi

# Install globally with sudo (npm needs root for -g)
echo -e "\033[33mInstalling package from GitHub...\033[0m"
npm install -g --force "github:UberMorgott/MorgottStatusLine"

# Create config directory as real user
CLAUDE_DIR="$REAL_HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# Write config
CONFIG_PATH="$CLAUDE_DIR/claude-limitline.json"
if [ ! -f "$CONFIG_PATH" ]; then
    cat > "$CONFIG_PATH" << 'CONF'
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
CONF
    echo -e "\033[32mConfig created: $CONFIG_PATH\033[0m"
else
    echo -e "\033[33mConfig already exists: $CONFIG_PATH (skipped)\033[0m"
fi

# Update settings.json
SETTINGS_PATH="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS_PATH" ]; then
    if command -v node &> /dev/null; then
        node -e "
const fs = require('fs');
const p = '$SETTINGS_PATH';
let s = {};
try { s = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) {}
s.statusLine = { type: 'command', command: 'morgott-statusline' };
fs.writeFileSync(p, JSON.stringify(s, null, 2));
"
    else
        echo '{"statusLine":{"type":"command","command":"morgott-statusline"}}' > "$SETTINGS_PATH"
    fi
else
    echo '{"statusLine":{"type":"command","command":"morgott-statusline"}}' > "$SETTINGS_PATH"
fi

# Fix ownership if running under sudo
if [ -n "$SUDO_USER" ]; then
    chown -R "$REAL_USER" "$CLAUDE_DIR"
fi

echo -e "\033[32mSettings updated: $SETTINGS_PATH\033[0m"

echo ""
echo -e "\033[36mDone! Restart Claude Code to see the statusline.\033[0m"
echo -e "\033[90m  🧠 = context | ⏱️ = 5h block | 📅 = weekly limit\033[0m"
