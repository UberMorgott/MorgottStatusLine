#!/bin/bash
# MorgottStatusLine Installer for macOS/Linux
# Usage: curl -fsSL <url>/install.sh | bash
set -e

echo -e "\033[36mInstalling MorgottStatusLine...\033[0m"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "\033[31mError: npm not found. Install Node.js from https://nodejs.org\033[0m"
    exit 1
fi

# Install globally to ~/.local (no sudo needed)
echo -e "\033[33mInstalling package from GitHub...\033[0m"
npm install -g --prefix "$HOME/.local" --force "github:UberMorgott/MorgottStatusLine"

# Check if ~/.local/bin is in PATH. If not, a bare command in settings.json would not
# resolve, so write the absolute path (quoted: $HOME may contain spaces).
BIN_DIR="$HOME/.local/bin"
STATUS_CMD="morgott-statusline"
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
    STATUS_CMD="\"$BIN_DIR/morgott-statusline\""
    echo ""
    echo -e "\033[33mWarning: ~/.local/bin is not in your PATH; settings.json will use the absolute path.\033[0m"
    echo -e "\033[33mAdd it to your shell config:\033[0m"
    echo ""
    echo -e "  \033[90m# bash (~/.bashrc)\033[0m"
    echo -e "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo -e "  \033[90m# zsh (~/.zshrc)\033[0m"
    echo -e "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo -e "  \033[90m# fish (~/.config/fish/config.fish)\033[0m"
    echo -e "  fish_add_path \$HOME/.local/bin"
    echo ""
fi

# Create config directory
CLAUDE_DIR="$HOME/.claude"
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
# JSON-escape the command for the no-node fallback (backslashes, then quotes).
STATUS_CMD_JSON="${STATUS_CMD//\\/\\\\}"
STATUS_CMD_JSON="${STATUS_CMD_JSON//\"/\\\"}"
if [ -f "$SETTINGS_PATH" ]; then
    if command -v node &> /dev/null; then
        node -e "
const fs = require('fs');
const p = process.argv[1];
let s;
try { s = JSON.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, '')); }
catch (e) { console.error('Error: ' + p + ' is not valid JSON (left untouched). Add statusLine manually.'); process.exit(1); }
s.statusLine = { type: 'command', command: process.argv[2] };
fs.writeFileSync(p, JSON.stringify(s, null, 2));
" "$SETTINGS_PATH" "$STATUS_CMD"
    else
        printf '{"statusLine":{"type":"command","command":"%s"}}\n' "$STATUS_CMD_JSON" > "$SETTINGS_PATH"
    fi
else
    printf '{"statusLine":{"type":"command","command":"%s"}}\n' "$STATUS_CMD_JSON" > "$SETTINGS_PATH"
fi

echo -e "\033[32mSettings updated: $SETTINGS_PATH\033[0m"

echo ""
echo -e "\033[36mDone! Restart Claude Code to see the statusline.\033[0m"
echo -e "\033[90m  🧠 = context | ⏱️ = 5h block | 📅 = weekly limit\033[0m"
