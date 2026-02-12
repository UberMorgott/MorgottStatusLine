#!/usr/bin/env node

// src/config/loader.ts
import fs from "fs";
import path from "path";
import os from "os";

// src/utils/logger.ts
var DEBUG = process.env.CLAUDE_LIMITLINE_DEBUG === "true";
function debug(...args) {
  if (DEBUG) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    console.error(`[${timestamp}] [DEBUG]`, ...args);
  }
}

// src/config/types.ts
var DEFAULT_CONFIG = {
  display: {
    style: "powerline",
    useNerdFonts: true,
    compactMode: "auto",
    compactWidth: 80
  },
  directory: {
    enabled: true
  },
  git: {
    enabled: true
  },
  model: {
    enabled: true
  },
  block: {
    enabled: true,
    displayStyle: "text",
    barWidth: 10,
    showTimeRemaining: true
  },
  weekly: {
    enabled: true,
    displayStyle: "text",
    barWidth: 10,
    showWeekProgress: true,
    viewMode: "simple"
  },
  context: {
    enabled: true
  },
  budget: {
    pollInterval: 15,
    warningThreshold: 80
  },
  theme: "dark",
  segmentOrder: ["directory", "git", "model", "block", "weekly"],
  showTrend: true
};

// src/config/loader.ts
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (sourceValue !== void 0 && typeof sourceValue === "object" && sourceValue !== null && !Array.isArray(sourceValue) && typeof targetValue === "object" && targetValue !== null && !Array.isArray(targetValue)) {
      result[key] = { ...targetValue, ...sourceValue };
    } else if (sourceValue !== void 0) {
      result[key] = sourceValue;
    }
  }
  return result;
}
function loadConfig() {
  const configPaths = [
    path.join(process.cwd(), ".claude-limitline.json"),
    path.join(os.homedir(), ".claude", "claude-limitline.json")
  ];
  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        const userConfig = JSON.parse(content);
        debug(`Loaded config from ${configPath}`);
        return deepMerge(DEFAULT_CONFIG, userConfig);
      }
    } catch (error) {
      debug(`Failed to load config from ${configPath}:`, error);
    }
  }
  debug("Using default config");
  return DEFAULT_CONFIG;
}

// src/utils/oauth.ts
import { exec } from "child_process";
import { promisify } from "util";
import fs2 from "fs";
import path2 from "path";
import os2 from "os";
var execAsync = promisify(exec);
async function getOAuthTokenWindows() {
  try {
    const { stdout } = await execAsync(
      `powershell -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((Get-StoredCredential -Target 'Claude Code' -AsCredentialObject).Password))"`,
      { timeout: 5e3 }
    );
    const token = stdout.trim();
    if (token && token.startsWith("sk-ant-oat")) {
      return token;
    }
  } catch (error) {
    debug("PowerShell credential retrieval failed:", error);
  }
  try {
    const { stdout } = await execAsync(
      `powershell -Command "$cred = cmdkey /list:Claude* | Select-String -Pattern 'User:.*'; if ($cred) { $cred.Line.Split(':')[1].Trim() }"`,
      { timeout: 5e3 }
    );
    debug("cmdkey output:", stdout);
  } catch (error) {
    debug("cmdkey approach failed:", error);
  }
  const primaryPath = path2.join(os2.homedir(), ".claude", ".credentials.json");
  try {
    if (fs2.existsSync(primaryPath)) {
      const content = fs2.readFileSync(primaryPath, "utf-8");
      const config = JSON.parse(content);
      if (config.claudeAiOauth && typeof config.claudeAiOauth === "object") {
        const token = config.claudeAiOauth.accessToken;
        if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
          debug(`Found OAuth token in ${primaryPath} under claudeAiOauth.accessToken`);
          return token;
        }
      }
    }
  } catch (error) {
    debug(`Failed to read config from ${primaryPath}:`, error);
  }
  const fallbackPaths = [
    path2.join(os2.homedir(), ".claude", "credentials.json"),
    path2.join(os2.homedir(), ".config", "claude-code", "credentials.json"),
    path2.join(process.env.APPDATA || "", "Claude Code", "credentials.json"),
    path2.join(process.env.LOCALAPPDATA || "", "Claude Code", "credentials.json")
  ];
  for (const configPath of fallbackPaths) {
    try {
      if (fs2.existsSync(configPath)) {
        const content = fs2.readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        for (const key of ["oauth_token", "token", "accessToken"]) {
          const token = config[key];
          if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
            debug(`Found OAuth token in ${configPath} under key ${key}`);
            return token;
          }
        }
      }
    } catch (error) {
      debug(`Failed to read config from ${configPath}:`, error);
    }
  }
  return null;
}
async function getOAuthTokenMacOS() {
  try {
    const { stdout } = await execAsync(
      `security find-generic-password -s "Claude Code-credentials" -w`,
      { timeout: 5e3 }
    );
    const content = stdout.trim();
    if (content.startsWith("{")) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.claudeAiOauth && typeof parsed.claudeAiOauth === "object") {
          const token = parsed.claudeAiOauth.accessToken;
          if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
            debug("Found OAuth token in macOS Keychain under claudeAiOauth.accessToken");
            return token;
          }
        }
      } catch (parseError) {
        debug("Failed to parse keychain JSON:", parseError);
      }
    }
    if (content.startsWith("sk-ant-oat")) {
      return content;
    }
  } catch (error) {
    debug("macOS Keychain retrieval failed:", error);
  }
  return null;
}
async function getOAuthTokenLinux() {
  try {
    const { stdout } = await execAsync(
      `secret-tool lookup service "Claude Code"`,
      { timeout: 5e3 }
    );
    const token = stdout.trim();
    if (token && token.startsWith("sk-ant-oat")) {
      return token;
    }
  } catch (error) {
    debug("Linux secret-tool retrieval failed:", error);
  }
  const configPaths = [
    path2.join(os2.homedir(), ".claude", ".credentials.json"),
    path2.join(os2.homedir(), ".claude", "credentials.json"),
    path2.join(os2.homedir(), ".config", "claude-code", "credentials.json")
  ];
  for (const configPath of configPaths) {
    try {
      if (fs2.existsSync(configPath)) {
        const content = fs2.readFileSync(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.claudeAiOauth && typeof config.claudeAiOauth === "object") {
          const token = config.claudeAiOauth.accessToken;
          if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
            debug(`Found OAuth token in ${configPath} under claudeAiOauth.accessToken`);
            return token;
          }
        }
        for (const key of ["oauth_token", "token", "accessToken"]) {
          const token = config[key];
          if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
            debug(`Found OAuth token in ${configPath} under key ${key}`);
            return token;
          }
        }
      }
    } catch (error) {
      debug(`Failed to read config from ${configPath}:`, error);
    }
  }
  return null;
}
async function getOAuthToken() {
  const platform = process.platform;
  debug(`Attempting to retrieve OAuth token on platform: ${platform}`);
  switch (platform) {
    case "win32":
      return getOAuthTokenWindows();
    case "darwin":
      return getOAuthTokenMacOS();
    case "linux":
      return getOAuthTokenLinux();
    default:
      debug(`Unsupported platform for OAuth token retrieval: ${platform}`);
      return null;
  }
}
async function fetchUsageFromAPI(token) {
  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "claude-limitline/1.0.0",
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20"
      }
    });
    if (!response.ok) {
      debug(`Usage API returned status ${response.status}: ${response.statusText}`);
      return null;
    }
    const data = await response.json();
    debug("Usage API response:", JSON.stringify(data));
    const parseUsageBlock = (block) => {
      if (!block) return null;
      return {
        resetAt: block.resets_at ? new Date(block.resets_at) : /* @__PURE__ */ new Date(),
        percentUsed: block.utilization ?? 0,
        isOverLimit: (block.utilization ?? 0) >= 100
      };
    };
    return {
      fiveHour: parseUsageBlock(data.five_hour),
      sevenDay: parseUsageBlock(data.seven_day),
      sevenDayOpus: parseUsageBlock(data.seven_day_opus ?? void 0),
      sevenDaySonnet: parseUsageBlock(data.seven_day_sonnet ?? void 0),
      raw: data
    };
  } catch (error) {
    debug("Failed to fetch usage from API:", error);
    return null;
  }
}
var cachedUsage = null;
var previousUsage = null;
var cacheTimestamp = 0;
var cachedToken = null;
function getUsageTrend() {
  const result = {
    fiveHourTrend: null,
    sevenDayTrend: null,
    sevenDayOpusTrend: null,
    sevenDaySonnetTrend: null
  };
  if (!cachedUsage || !previousUsage) {
    return result;
  }
  const compareTrend = (current, previous) => {
    if (!current || !previous) return null;
    const diff = current.percentUsed - previous.percentUsed;
    if (diff > 0.5) return "up";
    if (diff < -0.5) return "down";
    return "same";
  };
  result.fiveHourTrend = compareTrend(cachedUsage.fiveHour, previousUsage.fiveHour);
  result.sevenDayTrend = compareTrend(cachedUsage.sevenDay, previousUsage.sevenDay);
  result.sevenDayOpusTrend = compareTrend(cachedUsage.sevenDayOpus, previousUsage.sevenDayOpus);
  result.sevenDaySonnetTrend = compareTrend(cachedUsage.sevenDaySonnet, previousUsage.sevenDaySonnet);
  return result;
}
async function getRealtimeUsage(pollIntervalMinutes = 15) {
  const now = Date.now();
  const cacheAgeMs = now - cacheTimestamp;
  const pollIntervalMs = pollIntervalMinutes * 60 * 1e3;
  if (cachedUsage && cacheAgeMs < pollIntervalMs) {
    debug(`Using cached usage data (age: ${Math.round(cacheAgeMs / 1e3)}s)`);
    return cachedUsage;
  }
  if (!cachedToken) {
    cachedToken = await getOAuthToken();
    if (!cachedToken) {
      debug("Could not retrieve OAuth token for realtime usage");
      return null;
    }
  }
  const usage = await fetchUsageFromAPI(cachedToken);
  if (usage) {
    previousUsage = cachedUsage;
    cachedUsage = usage;
    cacheTimestamp = now;
    debug("Refreshed realtime usage cache");
  } else {
    cachedToken = null;
  }
  return usage;
}

// src/segments/block.ts
var BlockProvider = class {
  async getBlockInfo(pollInterval) {
    const realtimeInfo = await this.getRealtimeBlockInfo(pollInterval);
    if (realtimeInfo) {
      return realtimeInfo;
    }
    debug("Realtime mode failed, no block data available");
    return {
      percentUsed: null,
      resetAt: null,
      timeRemaining: null,
      isRealtime: false
    };
  }
  async getRealtimeBlockInfo(pollInterval) {
    try {
      const usage = await getRealtimeUsage(pollInterval ?? 15);
      if (!usage || !usage.fiveHour) {
        debug("No realtime block usage data available");
        return null;
      }
      const fiveHour = usage.fiveHour;
      const now = /* @__PURE__ */ new Date();
      const resetAt = new Date(fiveHour.resetAt);
      const timeRemaining = Math.max(
        0,
        Math.round((resetAt.getTime() - now.getTime()) / (1e3 * 60))
      );
      debug(
        `Block segment (realtime): ${fiveHour.percentUsed}% used, resets at ${fiveHour.resetAt.toISOString()}, ${timeRemaining}m remaining`
      );
      return {
        percentUsed: fiveHour.percentUsed,
        resetAt: fiveHour.resetAt,
        timeRemaining,
        isRealtime: true
      };
    } catch (error) {
      debug("Error getting realtime block info:", error);
      return null;
    }
  }
};

// src/segments/weekly.ts
var WeeklyProvider = class {
  calculateWeekProgress(resetDay, resetHour, resetMinute) {
    const now = /* @__PURE__ */ new Date();
    const dayOfWeek = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const targetDay = resetDay ?? 1;
    const targetHour = resetHour ?? 0;
    const targetMinute = resetMinute ?? 0;
    let daysSinceReset = (dayOfWeek - targetDay + 7) % 7;
    if (daysSinceReset === 0) {
      const currentMinutes = hours * 60 + minutes;
      const resetMinutes = targetHour * 60 + targetMinute;
      if (currentMinutes < resetMinutes) {
        daysSinceReset = 7;
      }
    }
    const hoursIntoWeek = daysSinceReset * 24 + hours - targetHour + (minutes - targetMinute) / 60;
    const totalHoursInWeek = 7 * 24;
    const progress = Math.max(0, Math.min(100, hoursIntoWeek / totalHoursInWeek * 100));
    return Math.round(progress);
  }
  calculateWeekProgressFromResetTime(resetAt) {
    const now = /* @__PURE__ */ new Date();
    const resetTime = new Date(resetAt);
    const periodStart = new Date(resetTime);
    periodStart.setDate(periodStart.getDate() - 7);
    if (now > resetTime) {
      const newPeriodStart = resetTime;
      const newResetTime = new Date(resetTime);
      newResetTime.setDate(newResetTime.getDate() + 7);
      const totalMs2 = newResetTime.getTime() - newPeriodStart.getTime();
      const elapsedMs2 = now.getTime() - newPeriodStart.getTime();
      return Math.round(elapsedMs2 / totalMs2 * 100);
    }
    const totalMs = resetTime.getTime() - periodStart.getTime();
    const elapsedMs = now.getTime() - periodStart.getTime();
    const progress = Math.max(0, Math.min(100, elapsedMs / totalMs * 100));
    return Math.round(progress);
  }
  async getWeeklyInfo(resetDay, resetHour, resetMinute, pollInterval) {
    const realtimeInfo = await this.getRealtimeWeeklyInfo(pollInterval);
    if (realtimeInfo) {
      return realtimeInfo;
    }
    debug("Realtime mode failed, falling back to estimate mode");
    const weekProgressPercent = this.calculateWeekProgress(resetDay, resetHour, resetMinute);
    return {
      percentUsed: null,
      resetAt: null,
      isRealtime: false,
      weekProgressPercent,
      opusPercentUsed: null,
      sonnetPercentUsed: null,
      opusResetAt: null,
      sonnetResetAt: null
    };
  }
  async getRealtimeWeeklyInfo(pollInterval) {
    try {
      const usage = await getRealtimeUsage(pollInterval ?? 15);
      if (!usage || !usage.sevenDay) {
        debug("No realtime weekly usage data available");
        return null;
      }
      const sevenDay = usage.sevenDay;
      const sevenDayOpus = usage.sevenDayOpus;
      const sevenDaySonnet = usage.sevenDaySonnet;
      const weekProgressPercent = this.calculateWeekProgressFromResetTime(sevenDay.resetAt);
      debug(
        `Weekly segment (realtime): ${sevenDay.percentUsed}% used, resets at ${sevenDay.resetAt.toISOString()}`
      );
      if (sevenDayOpus) {
        debug(`Weekly Opus: ${sevenDayOpus.percentUsed}% used`);
      }
      if (sevenDaySonnet) {
        debug(`Weekly Sonnet: ${sevenDaySonnet.percentUsed}% used`);
      }
      return {
        percentUsed: sevenDay.percentUsed,
        resetAt: sevenDay.resetAt,
        isRealtime: true,
        weekProgressPercent,
        opusPercentUsed: sevenDayOpus?.percentUsed ?? null,
        sonnetPercentUsed: sevenDaySonnet?.percentUsed ?? null,
        opusResetAt: sevenDayOpus?.resetAt ?? null,
        sonnetResetAt: sevenDaySonnet?.resetAt ?? null
      };
    } catch (error) {
      debug("Error getting realtime weekly info:", error);
      return null;
    }
  }
};

// src/utils/constants.ts
var SYMBOLS = {
  right: "\uE0B0",
  left: "\uE0B2",
  branch: "\uE0A0",
  separator: "\uE0B1",
  model: "\u2731",
  // Heavy asterisk ✱
  block_cost: "\u25EB",
  // White square with vertical bisecting line ◫
  weekly_cost: "\u25CB",
  // Circle ○
  opus_cost: "\u25C8",
  // Diamond with dot ◈
  sonnet_cost: "\u25C7",
  // White diamond ◇
  bottleneck: "\u25B2",
  // Black up-pointing triangle ▲
  progress_full: "\u2588",
  // Full block
  progress_empty: "\u2591"
  // Light shade
};
var TEXT_SYMBOLS = {
  right: ">",
  left: "<",
  branch: "",
  separator: "|",
  model: "*",
  block_cost: "\u0411\u041B\u041A",
  weekly_cost: "\u041D\u0415\u0414",
  opus_cost: "Op",
  sonnet_cost: "So",
  bottleneck: "*",
  progress_full: "#",
  progress_empty: "-"
};
var RESET_CODE = "\x1B[0m";

// src/themes/index.ts
function hexToAnsi256(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  const ri = Math.round(r / 255 * 5);
  const gi = Math.round(g / 255 * 5);
  const bi = Math.round(b / 255 * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}
var ansi = {
  fg: (hex) => `\x1B[38;5;${hexToAnsi256(hex)}m`,
  bg: (hex) => `\x1B[48;5;${hexToAnsi256(hex)}m`,
  fgRaw: (n) => `\x1B[38;5;${n}m`,
  bgRaw: (n) => `\x1B[48;5;${n}m`,
  reset: "\x1B[0m"
};
var darkTheme = {
  directory: { bg: "#8b4513", fg: "#ffffff" },
  git: { bg: "#404040", fg: "#ffffff" },
  model: { bg: "#2d2d2d", fg: "#ffffff" },
  block: { bg: "#2a2a2a", fg: "#87ceeb" },
  weekly: { bg: "#1a1a1a", fg: "#98fb98" },
  opus: { bg: "#1a1a1a", fg: "#c792ea" },
  // Purple for Opus
  sonnet: { bg: "#1a1a1a", fg: "#89ddff" },
  // Light blue for Sonnet
  context: { bg: "#2a2a2a", fg: "#87ceeb" },
  // Sky blue for context
  warning: { bg: "#d75f00", fg: "#ffffff" },
  critical: { bg: "#af0000", fg: "#ffffff" }
};
var lightTheme = {
  directory: { bg: "#ff6b47", fg: "#ffffff" },
  git: { bg: "#4fb3d9", fg: "#ffffff" },
  model: { bg: "#87ceeb", fg: "#000000" },
  block: { bg: "#6366f1", fg: "#ffffff" },
  weekly: { bg: "#10b981", fg: "#ffffff" },
  opus: { bg: "#8b5cf6", fg: "#ffffff" },
  // Purple for Opus
  sonnet: { bg: "#0ea5e9", fg: "#ffffff" },
  // Sky blue for Sonnet
  context: { bg: "#6366f1", fg: "#ffffff" },
  // Indigo for context
  warning: { bg: "#f59e0b", fg: "#000000" },
  critical: { bg: "#ef4444", fg: "#ffffff" }
};
var nordTheme = {
  directory: { bg: "#434c5e", fg: "#d8dee9" },
  git: { bg: "#3b4252", fg: "#a3be8c" },
  model: { bg: "#4c566a", fg: "#81a1c1" },
  block: { bg: "#3b4252", fg: "#81a1c1" },
  weekly: { bg: "#2e3440", fg: "#8fbcbb" },
  opus: { bg: "#2e3440", fg: "#b48ead" },
  // Nord purple for Opus
  sonnet: { bg: "#2e3440", fg: "#88c0d0" },
  // Nord frost for Sonnet
  context: { bg: "#3b4252", fg: "#81a1c1" },
  // Nord frost for context
  warning: { bg: "#d08770", fg: "#2e3440" },
  critical: { bg: "#bf616a", fg: "#eceff4" }
};
var gruvboxTheme = {
  directory: { bg: "#504945", fg: "#ebdbb2" },
  git: { bg: "#3c3836", fg: "#b8bb26" },
  model: { bg: "#665c54", fg: "#83a598" },
  block: { bg: "#3c3836", fg: "#83a598" },
  weekly: { bg: "#282828", fg: "#fabd2f" },
  opus: { bg: "#282828", fg: "#d3869b" },
  // Gruvbox purple for Opus
  sonnet: { bg: "#282828", fg: "#8ec07c" },
  // Gruvbox aqua for Sonnet
  context: { bg: "#3c3836", fg: "#83a598" },
  // Gruvbox blue for context
  warning: { bg: "#d79921", fg: "#282828" },
  critical: { bg: "#cc241d", fg: "#ebdbb2" }
};
var tokyoNightTheme = {
  directory: { bg: "#2f334d", fg: "#82aaff" },
  git: { bg: "#1e2030", fg: "#c3e88d" },
  model: { bg: "#191b29", fg: "#fca7ea" },
  block: { bg: "#2d3748", fg: "#7aa2f7" },
  weekly: { bg: "#1a202c", fg: "#4fd6be" },
  opus: { bg: "#1a202c", fg: "#bb9af7" },
  // Tokyo purple for Opus
  sonnet: { bg: "#1a202c", fg: "#7dcfff" },
  // Tokyo cyan for Sonnet
  context: { bg: "#2d3748", fg: "#7aa2f7" },
  // Tokyo blue for context
  warning: { bg: "#e0af68", fg: "#1a1b26" },
  critical: { bg: "#f7768e", fg: "#1a1b26" }
};
var rosePineTheme = {
  directory: { bg: "#26233a", fg: "#c4a7e7" },
  git: { bg: "#1f1d2e", fg: "#9ccfd8" },
  model: { bg: "#191724", fg: "#ebbcba" },
  block: { bg: "#2a273f", fg: "#eb6f92" },
  weekly: { bg: "#232136", fg: "#9ccfd8" },
  opus: { bg: "#232136", fg: "#c4a7e7" },
  // Rose Pine iris for Opus
  sonnet: { bg: "#232136", fg: "#31748f" },
  // Rose Pine pine for Sonnet
  context: { bg: "#2a273f", fg: "#9ccfd8" },
  // Rose Pine foam for context
  warning: { bg: "#f6c177", fg: "#191724" },
  critical: { bg: "#eb6f92", fg: "#191724" }
};
var themes = {
  dark: darkTheme,
  light: lightTheme,
  nord: nordTheme,
  gruvbox: gruvboxTheme,
  "tokyo-night": tokyoNightTheme,
  "rose-pine": rosePineTheme
};
function getTheme(name) {
  return themes[name] || themes.dark;
}

// src/utils/terminal.ts
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

// src/renderer.ts
var Renderer = class {
  config;
  theme;
  symbols;
  usePowerline;
  constructor(config) {
    this.config = config;
    this.theme = getTheme(config.theme || "dark");
    const useNerd = config.display?.useNerdFonts ?? true;
    const symbolSet = useNerd ? SYMBOLS : TEXT_SYMBOLS;
    this.usePowerline = useNerd;
    this.symbols = {
      block: symbolSet.block_cost,
      weekly: symbolSet.weekly_cost,
      opus: symbolSet.opus_cost,
      sonnet: symbolSet.sonnet_cost,
      bottleneck: symbolSet.bottleneck,
      rightArrow: symbolSet.right,
      leftArrow: symbolSet.left,
      separator: symbolSet.separator,
      branch: symbolSet.branch,
      model: symbolSet.model,
      context: "\u25D0",
      // Half-filled circle for context
      progressFull: symbolSet.progress_full,
      progressEmpty: symbolSet.progress_empty,
      trendUp: "\u2191",
      trendDown: "\u2193"
    };
  }
  isCompactMode() {
    const mode = this.config.display?.compactMode ?? "auto";
    if (mode === "always") return true;
    if (mode === "never") return false;
    const threshold = this.config.display?.compactWidth ?? 80;
    const termWidth = getTerminalWidth();
    return termWidth < threshold;
  }
  getBarColor(percent) {
    const p = Math.min(100, Math.max(0, percent));
    if (p < 50) {
      const r = Math.round(p / 50 * 255);
      const g = 255;
      return `\x1B[38;2;${r};${g};0m`;
    } else {
      const r = 255;
      const g = Math.round((1 - (p - 50) / 50) * 255);
      return `\x1B[38;2;${r};${g};0m`;
    }
  }
  formatProgressBar(percent, width, bgCode) {
    const filled = Math.round(percent / 100 * width);
    const empty = width - filled;
    const barColor = this.getBarColor(percent);
    const emptyColor = "\x1B[38;2;100;160;200m";
    let bar = "";
    if (filled > 0) bar += barColor + this.symbols.progressFull.repeat(filled);
    if (empty > 0) bar += emptyColor + this.symbols.progressEmpty.repeat(empty);
    bar += (bgCode || "");
    return bar;
  }
  formatTimeRemaining(minutes, compact) {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    let parts = [];
    if (days > 0) parts.push(`${days}\u0434`);
    if (hours > 0) parts.push(`${hours}\u0447`);
    if (mins > 0 && days === 0) parts.push(`${mins}\u043C`);
    return parts.length > 0 ? parts.join("") : "0\u043C";
  }
  getTrendSymbol(trend) {
    if (!this.config.showTrend) return "";
    if (trend === "up") return this.symbols.trendUp;
    if (trend === "down") return this.symbols.trendDown;
    return "";
  }
  getColorsForPercent(percent, baseColors) {
    const threshold = this.config.budget?.warningThreshold ?? 80;
    if (percent >= 100) {
      return this.theme.critical;
    } else if (percent >= threshold) {
      return this.theme.warning;
    }
    return baseColors;
  }
  renderPowerline(segments) {
    if (segments.length === 0) return "";
    let output = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nextColors = i < segments.length - 1 ? segments[i + 1].colors : null;
      output += ansi.bg(seg.colors.bg) + ansi.fg(seg.colors.fg) + seg.text;
      output += RESET_CODE;
      if (nextColors) {
        output += ansi.fg(seg.colors.bg) + ansi.bg(nextColors.bg) + this.symbols.rightArrow;
      } else {
        output += ansi.fg(seg.colors.bg) + this.symbols.rightArrow;
      }
    }
    output += RESET_CODE;
    return output;
  }
  renderRightPowerline(segments) {
    if (segments.length === 0) return "";
    let output = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      output += RESET_CODE;
      output += ansi.fg(seg.colors.bg) + this.symbols.leftArrow;
      output += ansi.bg(seg.colors.bg) + ansi.fg(seg.colors.fg) + seg.text;
    }
    output += RESET_CODE;
    return output;
  }
  renderFallback(segments) {
    return segments.map((seg) => ansi.bg(seg.colors.bg) + ansi.fg(seg.colors.fg) + seg.text + RESET_CODE).join(` ${this.symbols.separator} `);
  }
  renderDirectory(ctx) {
    if (!this.config.directory?.enabled || !ctx.envInfo.directory) {
      return null;
    }
    const name = ctx.envInfo.directory;
    return {
      text: ` ${name} `,
      colors: this.theme.directory
    };
  }
  renderGit(ctx) {
    if (!this.config.git?.enabled || !ctx.envInfo.gitBranch) {
      return null;
    }
    const dirtyIndicator = ctx.envInfo.gitDirty ? " \u25CF" : "";
    const icon = this.usePowerline ? this.symbols.branch : "";
    const prefix = icon ? `${icon} ` : "";
    let branch = ctx.envInfo.gitBranch;
    if (ctx.compact && branch.length > 10) {
      branch = branch.slice(0, 8) + "\u2026";
    }
    return {
      text: ` ${prefix}${branch}${dirtyIndicator} `,
      colors: this.theme.git
    };
  }
  renderModel(ctx) {
    if (!this.config.model?.enabled || !ctx.envInfo.model) {
      return null;
    }
    const icon = this.usePowerline ? this.symbols.model : "";
    const prefix = icon ? `${icon} ` : "";
    return {
      text: ` ${prefix}${ctx.envInfo.model} `,
      colors: this.theme.model
    };
  }
  renderBlock(ctx) {
    if (!ctx.blockInfo || !this.config.block?.enabled) {
      return null;
    }
    const icon = this.usePowerline ? this.symbols.block : "BLK";
    if (ctx.blockInfo.percentUsed === null) {
      return {
        text: ` ${icon} -- `,
        colors: this.theme.block
      };
    }
    const percent = ctx.blockInfo.percentUsed;
    const colors = this.getColorsForPercent(percent, this.theme.block);
    const displayStyle = this.config.block.displayStyle || "text";
    const barWidth = this.config.block.barWidth || 10;
    const showTime = this.config.block.showTimeRemaining ?? true;
    const trend = this.getTrendSymbol(ctx.trendInfo?.fiveHourTrend ?? null);
    let text;
    if (displayStyle === "bar" && !ctx.compact) {
      const bar = this.formatProgressBar(percent, barWidth, ansi.fg(colors.fg));
      text = `${bar} ${Math.round(percent)}%${trend}`;
    } else {
      text = `${Math.round(percent)}%${trend}`;
    }
    if (showTime && ctx.blockInfo.timeRemaining !== null && !ctx.compact) {
      const timeStr = this.formatTimeRemaining(ctx.blockInfo.timeRemaining, ctx.compact);
      text += ` (${timeStr})`;
    }
    return {
      text: ` ${icon} ${text} `,
      colors
    };
  }
  renderWeeklySimple(ctx) {
    const info = ctx.weeklyInfo;
    const icon = this.usePowerline ? this.symbols.weekly : "WK";
    if (info.percentUsed === null) {
      return {
        text: ` ${icon} -- `,
        colors: this.theme.weekly
      };
    }
    const percent = info.percentUsed;
    const displayStyle = this.config.weekly?.displayStyle || "text";
    const barWidth = this.config.weekly?.barWidth || 10;
    const showWeekProgress = this.config.weekly?.showWeekProgress ?? true;
    const trend = this.getTrendSymbol(ctx.trendInfo?.sevenDayTrend ?? null);
    let text;
    if (displayStyle === "bar" && !ctx.compact) {
      const bar = this.formatProgressBar(percent, barWidth, ansi.fg(this.theme.weekly.fg));
      text = `${bar} ${Math.round(percent)}%${trend}`;
    } else {
      text = `${Math.round(percent)}%${trend}`;
    }
    if (showWeekProgress && !ctx.compact) {
      text += ` (\u043D\u0435\u0434 ${info.weekProgressPercent}%)`;
    }
    return {
      text: ` ${icon} ${text} `,
      colors: this.theme.weekly
    };
  }
  renderWeeklySmart(ctx) {
    const info = ctx.weeklyInfo;
    const overallIcon = this.usePowerline ? this.symbols.weekly : "All";
    const sonnetIcon = this.usePowerline ? this.symbols.sonnet : "So";
    const showWeekProgress = this.config.weekly?.showWeekProgress ?? true;
    const currentModel = ctx.envInfo.model?.toLowerCase() ?? "";
    const isSonnet = currentModel.includes("sonnet");
    const barWidth = this.config.weekly?.barWidth || 8;
    const weeklyResetAt = info.resetAt ? new Date(info.resetAt) : null;
    const weeklyTimeRemaining = weeklyResetAt ? Math.max(0, Math.round((weeklyResetAt.getTime() - Date.now()) / (1e3 * 60))) : null;
    const weeklyTimeStr = weeklyTimeRemaining !== null ? this.formatTimeRemaining(weeklyTimeRemaining, ctx.compact) : null;
    if (isSonnet && info.sonnetPercentUsed !== null && info.percentUsed !== null) {
      const sonnetTrend = this.getTrendSymbol(ctx.trendInfo?.sevenDaySonnetTrend ?? null);
      const overallTrend = this.getTrendSymbol(ctx.trendInfo?.sevenDayTrend ?? null);
      const maxPercent = Math.max(info.sonnetPercentUsed, info.percentUsed);
      const colors2 = this.getColorsForPercent(maxPercent, this.theme.weekly);
      const bar2 = this.formatProgressBar(maxPercent, barWidth, ansi.fg(colors2.fg));
      let text2 = `${bar2} ${sonnetIcon}${Math.round(info.sonnetPercentUsed)}%${sonnetTrend} | ${overallIcon}${Math.round(info.percentUsed)}%${overallTrend}`;
      if (weeklyTimeStr) {
        text2 += ` (${weeklyTimeStr})`;
      }
      return {
        text: ` ${text2} `,
        colors: colors2
      };
    }
    if (info.percentUsed === null) {
      return {
        text: ` ${overallIcon} -- `,
        colors: this.theme.weekly
      };
    }
    const trend = this.getTrendSymbol(ctx.trendInfo?.sevenDayTrend ?? null);
    const colors = this.getColorsForPercent(info.percentUsed, this.theme.weekly);
    const bar = this.formatProgressBar(info.percentUsed, barWidth, ansi.fg(colors.fg));
    let text = `${overallIcon} ${bar} ${Math.round(info.percentUsed)}%${trend}`;
    if (weeklyTimeStr) {
      text += ` (${weeklyTimeStr})`;
    }
    return {
      text: ` ${text} `,
      colors
    };
  }
  renderWeekly(ctx) {
    if (!ctx.weeklyInfo || !this.config.weekly?.enabled) {
      return null;
    }
    const viewMode = this.config.weekly?.viewMode ?? "simple";
    switch (viewMode) {
      case "smart":
        return this.renderWeeklySmart(ctx);
      case "simple":
      default:
        return this.renderWeeklySimple(ctx);
    }
  }
  renderContext(ctx) {
    if (!this.config.context?.enabled) {
      return null;
    }
    const percent = ctx.envInfo.contextPercent;
    const icon = this.usePowerline ? this.symbols.context : "\u041A\u0422\u041A";
    const colors = this.getColorsForPercent(percent, this.theme.context);
    const bar = this.formatProgressBar(percent, 10, ansi.fg(colors.fg));
    return {
      text: ` ${icon} ${bar} ${percent}% `,
      colors
    };
  }
  getSegment(name, ctx) {
    switch (name) {
      case "directory":
        return this.renderDirectory(ctx);
      case "git":
        return this.renderGit(ctx);
      case "model":
        return this.renderModel(ctx);
      case "block":
        return this.renderBlock(ctx);
      case "weekly":
        return this.renderWeekly(ctx);
      case "context":
        return this.renderContext(ctx);
      default:
        return null;
    }
  }
  render(blockInfo, weeklyInfo, envInfo, trendInfo = null) {
    const compact = this.isCompactMode();
    const ctx = {
      blockInfo,
      weeklyInfo,
      envInfo,
      trendInfo,
      compact
    };
    const leftSegments = [];
    const order = this.config.segmentOrder ?? ["directory", "git", "model", "block", "weekly"];
    for (const name of order) {
      const segment = this.getSegment(name, ctx);
      if (segment) {
        leftSegments.push(segment);
      }
    }
    const rightSegments = [];
    let output = "";
    if (this.usePowerline) {
      if (leftSegments.length > 0) {
        output += this.renderPowerline(leftSegments);
      }
      if (rightSegments.length > 0) {
        output += this.renderRightPowerline(rightSegments);
      }
    } else {
      const allSegments = [...leftSegments, ...rightSegments];
      if (allSegments.length > 0) {
        output = this.renderFallback(allSegments);
      }
    }
    return output;
  }
};

// src/utils/environment.ts
import { execSync } from "child_process";
import { basename } from "path";

// src/utils/claude-hook.ts
async function readHookData() {
  if (process.stdin.isTTY) {
    debug("stdin is TTY, no hook data");
    return null;
  }
  try {
    const chunks = [];
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        process.stdin.on("data", (chunk) => chunks.push(chunk));
        process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        process.stdin.on("error", reject);
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 100))
    ]);
    if (!result || result.trim() === "") {
      debug("No stdin data received");
      return null;
    }
    const hookData = JSON.parse(result);
    debug("Hook data received:", JSON.stringify(hookData));
    return hookData;
  } catch (error) {
    debug("Error reading hook data:", error);
    return null;
  }
}
function formatModelName(modelId, displayName) {
  if (displayName && displayName.length <= 20) {
    const clean = displayName.replace(/^Claude\s*/i, "").trim();
    if (clean) return clean;
  }
  const mappings = {
    "claude-opus-4-5-20251101": "Opus 4.5",
    "claude-opus-4-20250514": "Opus 4",
    "claude-sonnet-4-20250514": "Sonnet 4",
    "claude-3-5-sonnet-20241022": "Sonnet 3.5",
    "claude-3-5-sonnet-latest": "Sonnet 3.5",
    "claude-3-5-sonnet": "Sonnet 3.5",
    "claude-3-opus-20240229": "Opus 3",
    "claude-3-opus": "Opus 3",
    "claude-3-sonnet-20240229": "Sonnet 3",
    "claude-3-haiku-20240307": "Haiku 3",
    "claude-3-haiku": "Haiku 3"
  };
  if (mappings[modelId]) {
    return mappings[modelId];
  }
  const lower = modelId.toLowerCase();
  if (lower.includes("opus")) {
    if (lower.includes("4-5") || lower.includes("4.5")) return "Opus 4.5";
    if (lower.includes("4")) return "Opus 4";
    if (lower.includes("3")) return "Opus 3";
    return "Opus";
  }
  if (lower.includes("sonnet")) {
    if (lower.includes("4")) return "Sonnet 4";
    if (lower.includes("3-5") || lower.includes("3.5")) return "Sonnet 3.5";
    if (lower.includes("3")) return "Sonnet 3";
    return "Sonnet";
  }
  if (lower.includes("haiku")) {
    if (lower.includes("3")) return "Haiku 3";
    return "Haiku";
  }
  return modelId.length > 15 ? modelId.slice(0, 15) : modelId;
}

// src/utils/environment.ts
function getDirectoryName(hookData) {
  try {
    if (hookData?.workspace?.project_dir) {
      return hookData.workspace.project_dir;
    }
    if (hookData?.cwd) {
      return hookData.cwd;
    }
    return process.cwd();
  } catch (error) {
    debug("Error getting directory name:", error);
    return null;
  }
}
function getGitBranch() {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return branch || null;
  } catch (error) {
    debug("Error getting git branch:", error);
    return null;
  }
}
function hasGitChanges() {
  try {
    const status = execSync("git status --porcelain", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return status.length > 0;
  } catch (error) {
    debug("Error checking git status:", error);
    return false;
  }
}
function getClaudeModel(hookData) {
  if (hookData?.model?.id) {
    return formatModelName(hookData.model.id, hookData.model.display_name);
  }
  const model = process.env.CLAUDE_MODEL || process.env.CLAUDE_CODE_MODEL || process.env.ANTHROPIC_MODEL;
  if (model) {
    return formatModelName(model);
  }
  return null;
}
function getContextPercent(hookData) {
  const ctx = hookData?.context_window;
  if (!ctx?.current_usage || !ctx.context_window_size) {
    return 0;
  }
  const usage = ctx.current_usage;
  const totalTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return Math.round(totalTokens / ctx.context_window_size * 100);
}
function getEnvironmentInfo(hookData) {
  return {
    directory: getDirectoryName(hookData),
    gitBranch: getGitBranch(),
    gitDirty: hasGitChanges(),
    model: getClaudeModel(hookData),
    contextPercent: getContextPercent(hookData)
  };
}

// src/index.ts
async function main() {
  try {
    const config = loadConfig();
    debug("Config loaded:", JSON.stringify(config));
    const hookData = await readHookData();
    debug("Hook data:", JSON.stringify(hookData));
    const envInfo = getEnvironmentInfo(hookData);
    debug("Environment info:", JSON.stringify(envInfo));
    const blockProvider = new BlockProvider();
    const weeklyProvider = new WeeklyProvider();
    const pollInterval = config.budget?.pollInterval ?? 15;
    const [blockInfo, weeklyInfo] = await Promise.all([
      config.block?.enabled ? blockProvider.getBlockInfo(pollInterval) : null,
      config.weekly?.enabled ? weeklyProvider.getWeeklyInfo(
        config.budget?.resetDay,
        config.budget?.resetHour,
        config.budget?.resetMinute,
        pollInterval
      ) : null
    ]);
    debug("Block info:", JSON.stringify(blockInfo));
    debug("Weekly info:", JSON.stringify(weeklyInfo));
    const trendInfo = config.showTrend ? getUsageTrend() : null;
    debug("Trend info:", JSON.stringify(trendInfo));
    const renderer = new Renderer(config);
    const output = renderer.render(blockInfo, weeklyInfo, envInfo, trendInfo);
    if (output) {
      process.stdout.write(output);
    }
  } catch (error) {
    debug("Error in main:", error);
    process.exit(0);
  }
}
main();
