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
    compactWidth: 80,
    rightReserve: 1
  },
  directory: {
    enabled: true,
    line: 1
  },
  git: {
    enabled: true,
    line: 1
  },
  model: {
    enabled: true,
    line: 1
  },
  block: {
    enabled: true,
    line: 1,
    displayStyle: "text",
    barWidth: 10,
    showTimeRemaining: true
  },
  weekly: {
    enabled: true,
    line: 1,
    displayStyle: "text",
    barWidth: 10,
    showWeekProgress: true,
    viewMode: "simple"
  },
  context: {
    enabled: true,
    line: 1
  },
  line2: { enabled: true },
  prognosis: { enabled: true, line: 2, warnLeadMinutes: 30 },
  cost: { enabled: true, line: 2, threshold: 0.01, alwaysShow: false },
  mode: { enabled: true, line: 2 },
  tokenBreakdown: { enabled: true, line: 2, maxCats: 4 },
  aggregate: { enabled: true, line: 2, ttlSeconds: 90, showSingle: true },
  budget: {
    pollInterval: 15,
    warningThreshold: 80
  },
  theme: "dark",
  segmentOrder: ["directory", "git", "model", "context", "block", "weekly"],
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
  // Try credentials file FIRST — instant, no PowerShell overhead
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
  // PowerShell fallback — only if file-based retrieval failed
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
  return null;
}
function extractTokenFromKeychainContent(content) {
  if (!content) return null;
  if (content.startsWith("{")) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.claudeAiOauth && typeof parsed.claudeAiOauth === "object") {
        const token = parsed.claudeAiOauth.accessToken;
        if (token && typeof token === "string" && token.startsWith("sk-ant-oat")) {
          return token;
        }
      }
    } catch (e) {
      debug("Failed to parse keychain JSON:", e);
    }
  }
  if (content.startsWith("sk-ant-oat")) return content;
  return null;
}
async function findKeychainServiceName() {
  try {
    const { stdout } = await execAsync(
      `security dump-keychain 2>/dev/null | grep -o '"Claude Code-credentials[^"]*"'`,
      { timeout: 5e3 }
    );
    const matches = stdout.trim().split("\n")
      .map((s) => s.replace(/^"|"$/g, ""))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (matches.length > 0) {
      debug(`Found keychain service: ${matches[0]}`);
      return matches[0];
    }
  } catch (error) {
    debug("Keychain service name lookup failed:", error);
  }
  return "Claude Code-credentials";
}
async function getOAuthTokenMacOS() {
  // Try credentials file first (instant, no shell overhead)
  const credPaths = [
    path2.join(os2.homedir(), ".claude", ".credentials.json"),
    path2.join(os2.homedir(), ".claude", "credentials.json")
  ];
  for (const credPath of credPaths) {
    try {
      if (fs2.existsSync(credPath)) {
        const content = fs2.readFileSync(credPath, "utf-8");
        const config = JSON.parse(content);
        if (config.claudeAiOauth?.accessToken?.startsWith("sk-ant-oat")) {
          debug(`Found OAuth token in ${credPath}`);
          return config.claudeAiOauth.accessToken;
        }
      }
    } catch (e) { debug(`Failed to read ${credPath}:`, e); }
  }
  // Keychain fallback — supports hash-suffixed service names (e.g. Claude Code-credentials-697375ae)
  const serviceName = await findKeychainServiceName();
  const names = [serviceName];
  if (serviceName !== "Claude Code-credentials") names.push("Claude Code-credentials");
  for (const name of names) {
    try {
      const { stdout } = await execAsync(
        `security find-generic-password -s "${name}" -w`,
        { timeout: 5e3 }
      );
      const token = extractTokenFromKeychainContent(stdout.trim());
      if (token) {
        debug(`Found OAuth token in macOS Keychain (service: ${name})`);
        return token;
      }
    } catch (error) {
      debug(`macOS Keychain retrieval failed for "${name}":`, error);
    }
  }
  return null;
}
async function getOAuthTokenLinux() {
  // Try credentials file first (instant, no shell overhead)
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
        if (config.claudeAiOauth?.accessToken?.startsWith("sk-ant-oat")) {
          debug(`Found OAuth token in ${configPath}`);
          return config.claudeAiOauth.accessToken;
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
  // GNOME Keyring fallback
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
function buildUsageFromHook(hookData) {
  const rl = hookData?.rate_limits;
  if (!rl) return null;
  const parse = (block) => {
    if (!block) return null;
    const pct = block.used_percentage ?? 0;
    return {
      resetAt: typeof block.resets_at === "number" ? new Date(block.resets_at * 1e3) : /* @__PURE__ */ new Date(),
      percentUsed: pct,
      isOverLimit: pct >= 100
    };
  };
  return {
    fiveHour: parse(rl.five_hour),
    sevenDay: parse(rl.seven_day)
  };
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
var DISK_CACHE_PATH = path2.join(os2.homedir(), ".claude", ".statusline-cache.json");
var LOCK_FILE_PATH = path2.join(os2.homedir(), ".claude", ".statusline-api.lock");
var LOCK_MAX_AGE_MS = 15000; // 15s — if lock older than this, consider it stale/crashed

// src/utils/history.ts
var HISTORY_PATH = path2.join(os2.homedir(), ".claude", ".statusline-history.json");
var HISTORY_MAX = 30;
var HISTORY_MIN_GAP_MS = 60 * 1000;

function loadHistory() {
  try {
    if (!fs2.existsSync(HISTORY_PATH)) return [];
    const arr = JSON.parse(fs2.readFileSync(HISTORY_PATH, "utf-8"));
    return Array.isArray(arr) ? arr : [];
  } catch (e) { debug("history load error:", e); return []; }
}

// sample = { ts: epochMs, five: number|null, seven: number|null }
function appendHistory(five, seven) {
  try {
    const hist = loadHistory();
    const now = Date.now();
    const last = hist[hist.length - 1];
    if (last && (now - last.ts) < HISTORY_MIN_GAP_MS) return hist; // throttle
    if (five == null && seven == null) return hist;
    hist.push({ ts: now, five, seven });
    while (hist.length > HISTORY_MAX) hist.shift();
    fs2.writeFileSync(HISTORY_PATH, JSON.stringify(hist), "utf-8");
    return hist;
  } catch (e) { debug("history append error:", e); return loadHistory(); }
}

function trendFromHistory(hist, key) {
  if (hist.length < 2) return null;
  const a = hist[hist.length - 2][key];
  const b = hist[hist.length - 1][key];
  if (a == null || b == null) return null;
  if (b > a + 0.5) return "up";
  if (b < a - 0.5) return "down";
  return null;
}

var SPARK = ["▁","▂","▃","▄","▅","▆","▇","█"];
function sparkline(hist, key) {
  const vals = hist.map(h => h[key]).filter(v => v != null);
  if (vals.length < 2) return "";
  return vals.map(v => SPARK[Math.min(7, Math.max(0, Math.round(v / 100 * 7)))]).join("");
}

// minutes until window hits 100% at recent burn rate, or null if flat/declining
function projectMinutesTo100(hist, key) {
  const pts = hist.filter(h => h[key] != null);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const dPct = last[key] - first[key];
  const dMin = (last.ts - first.ts) / 60000;
  if (dMin <= 0 || dPct <= 0.5) return null;
  const ratePerMin = dPct / dMin;
  const remainingPct = 100 - last[key];
  if (remainingPct <= 0) return 0;
  return Math.round(remainingPct / ratePerMin);
}

function acquireLock() {
  try {
    // O_EXCL — atomic create, fails if file exists
    const fd = fs2.openSync(LOCK_FILE_PATH, fs2.constants.O_CREAT | fs2.constants.O_EXCL | fs2.constants.O_WRONLY);
    fs2.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    fs2.closeSync(fd);
    debug(`Lock acquired by PID ${process.pid}`);
    return true;
  } catch (e) {
    if (e.code === "EEXIST") {
      // Lock exists — check if stale
      try {
        const lockData = JSON.parse(fs2.readFileSync(LOCK_FILE_PATH, "utf-8"));
        const age = Date.now() - lockData.ts;
        if (age > LOCK_MAX_AGE_MS) {
          debug(`Stale lock (age: ${age}ms, PID: ${lockData.pid}), breaking it`);
          fs2.unlinkSync(LOCK_FILE_PATH);
          return acquireLock(); // retry once
        }
        debug(`Lock held by PID ${lockData.pid} (age: ${age}ms), skipping API call`);
      } catch (readErr) {
        debug("Could not read lock file, skipping API call");
      }
      return false;
    }
    debug("Lock acquire error:", e);
    return false;
  }
}

function releaseLock() {
  try {
    fs2.unlinkSync(LOCK_FILE_PATH);
    debug("Lock released");
  } catch (e) { debug("Lock release error:", e); }
}

function saveCacheToDisk(usage, prevUsage) {
  try {
    const obj = { ts: Date.now(), data: usage };
    if (prevUsage) obj.prev = prevUsage;
    fs2.writeFileSync(DISK_CACHE_PATH, JSON.stringify(obj), "utf-8");
    debug("Saved usage cache to disk");
  } catch (e) { debug("Failed to save disk cache:", e); }
}
var _lastDiskCacheTs = 0;
var _lastDiskCachePrev = null;
function loadCacheFromDisk(maxAgeMs) {
  try {
    if (!fs2.existsSync(DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(fs2.readFileSync(DISK_CACHE_PATH, "utf-8"));
    _lastDiskCacheTs = raw.ts;
    const revive = (b) => b ? { ...b, resetAt: new Date(b.resetAt) } : null;
    if (raw.prev) {
      _lastDiskCachePrev = { fiveHour: revive(raw.prev.fiveHour), sevenDay: revive(raw.prev.sevenDay), sevenDayOpus: revive(raw.prev.sevenDayOpus), sevenDaySonnet: revive(raw.prev.sevenDaySonnet), raw: raw.prev.raw };
    }
    if (Date.now() - raw.ts > maxAgeMs) { debug("Disk cache too old"); return null; }
    if (!raw.data) { debug(`Disk cache has null data (error entry, age: ${Math.round((Date.now() - raw.ts) / 1e3)}s)`); return null; }
    debug(`Loaded usage from disk cache (age: ${Math.round((Date.now() - raw.ts) / 1e3)}s)`);
    return { fiveHour: revive(raw.data.fiveHour), sevenDay: revive(raw.data.sevenDay), sevenDayOpus: revive(raw.data.sevenDayOpus), sevenDaySonnet: revive(raw.data.sevenDaySonnet), raw: raw.data.raw };
  } catch (e) { debug("Failed to load disk cache:", e); return null; }
}
function getUsageTrend() {
  const result = {
    fiveHourTrend: null,
    sevenDayTrend: null,
    sevenDayOpusTrend: null,
    sevenDaySonnetTrend: null
  };
  const prev = previousUsage || _lastDiskCachePrev;
  if (!cachedUsage || !prev) {
    return result;
  }
  const compareTrend = (current, previous) => {
    if (!current || !previous) return null;
    const diff = current.percentUsed - previous.percentUsed;
    if (diff > 0.5) return "up";
    if (diff < -0.5) return "down";
    return "same";
  };
  result.fiveHourTrend = compareTrend(cachedUsage.fiveHour, prev.fiveHour);
  result.sevenDayTrend = compareTrend(cachedUsage.sevenDay, prev.sevenDay);
  result.sevenDayOpusTrend = compareTrend(cachedUsage.sevenDayOpus, prev.sevenDayOpus);
  result.sevenDaySonnetTrend = compareTrend(cachedUsage.sevenDaySonnet, prev.sevenDaySonnet);
  return result;
}
var _inflightPromise = null;
async function getRealtimeUsage(pollIntervalMinutes = 15) {
  // Deduplicate concurrent calls within same process
  if (_inflightPromise) return _inflightPromise;
  _inflightPromise = _getRealtimeUsageInner(pollIntervalMinutes);
  try { return await _inflightPromise; } finally { _inflightPromise = null; }
}
async function _getRealtimeUsageInner(pollIntervalMinutes) {
  const now = Date.now();
  const pollIntervalMs = pollIntervalMinutes * 60 * 1e3;
  const maxDiskCacheMs = 4 * 60 * 60 * 1e3; // 4 hours — usage data is slow-moving

  // Always try disk cache first (shared across all windows/processes)
  const diskData = loadCacheFromDisk(maxDiskCacheMs);
  if (diskData) {
    const diskAge = now - _lastDiskCacheTs;
    if (diskAge < pollIntervalMs) {
      // Disk cache is fresh — use it, no API call needed
      if (!cachedUsage) previousUsage = cachedUsage;
      cachedUsage = diskData;
      cacheTimestamp = now;
      debug(`Using fresh disk cache (age: ${Math.round(diskAge / 1e3)}s)`);
      return cachedUsage;
    }
    // Disk cache exists but stale — keep as fallback
    cachedUsage = diskData;
    debug(`Disk cache stale (age: ${Math.round(diskAge / 1e3)}s), will try API`);
  } else if (_lastDiskCacheTs && (now - _lastDiskCacheTs) < pollIntervalMs) {
    // Disk cache entry exists and is fresh, but data is null (previous API error).
    // Skip API call to avoid hammering a rate-limited endpoint.
    debug(`Disk cache is fresh error entry (age: ${Math.round((now - _lastDiskCacheTs) / 1e3)}s), skipping API call`);
    // Serve last-known-good data so windows reading the shared pool don't show dashes.
    if (!cachedUsage && _lastDiskCachePrev) {
      cachedUsage = _lastDiskCachePrev;
      debug("Serving last-known-good from prev (error-entry display fallback)");
    }
    return cachedUsage;
  }

  // Disk cache is stale or missing — try to acquire lock for API call
  const gotLock = acquireLock();
  if (!gotLock) {
    // Another process is fetching — return stale data (it will be refreshed soon)
    debug("Another process is fetching, using stale cache");
    if (cachedUsage) { cacheTimestamp = now; return cachedUsage; }
    // No data at all — wait briefly for the other process to finish
    await new Promise(r => setTimeout(r, 2000));
    const freshData = loadCacheFromDisk(maxDiskCacheMs);
    if (freshData) { cachedUsage = freshData; cacheTimestamp = now; return cachedUsage; }
    return null;
  }

  // We hold the lock — re-check disk cache (another process may have just written it)
  const recheckData = loadCacheFromDisk(maxDiskCacheMs);
  if (recheckData) {
    const recheckAge = now - _lastDiskCacheTs;
    if (recheckAge < pollIntervalMs) {
      debug("Cache refreshed by another process while acquiring lock");
      cachedUsage = recheckData;
      cacheTimestamp = now;
      releaseLock();
      return cachedUsage;
    }
  }

  // Actually fetch from API (we hold the lock)
  try {
    if (!cachedToken) {
      cachedToken = await getOAuthToken();
      if (!cachedToken) {
        debug("Could not retrieve OAuth token for realtime usage");
        if (cachedUsage) { cacheTimestamp = now; }
        return cachedUsage;
      }
    }
    const usage = await fetchUsageFromAPI(cachedToken);
    if (usage) {
      previousUsage = cachedUsage;
      cachedUsage = usage;
      cacheTimestamp = now;
      saveCacheToDisk(usage, previousUsage);
      debug("Refreshed realtime usage cache (locked)");
    } else {
      // API failed (429, network error, etc.) — extend stale data lifetime
      debug("API failed, returning stale cached data");
      if (cachedUsage) {
        cacheTimestamp = now;
      } else {
        const stale = loadCacheFromDisk(maxDiskCacheMs);
        if (stale) { cachedUsage = stale; cacheTimestamp = now; }
        else if (_lastDiskCachePrev) { cachedUsage = _lastDiskCachePrev; cacheTimestamp = now; }
      }
      // Write a cache entry to disk even on failure, so other processes
      // see a fresh timestamp and don't hammer the API (breaks 429 loop)
      saveCacheToDisk(null, previousUsage || _lastDiskCachePrev);
    }
  } finally {
    releaseLock();
  }
  return cachedUsage;
}

// src/utils/token-breakdown.ts
var TOKENS_CACHE_PATH = path2.join(os2.homedir(), ".claude", ".statusline-tokens.json");

function _approxTokens(content) {
  let chars = 0;
  if (typeof content === "string") chars = content.length;
  else if (Array.isArray(content)) {
    for (const b of content) {
      if (typeof b === "string") chars += b.length;
      else if (b?.type === "text" && typeof b.text === "string") chars += b.text.length;
      else if (b?.type === "image") chars += 6400;
    }
  }
  return Math.round(chars / 4);
}
function _categoryFor(toolName) {
  if (!toolName) return "other";
  if (toolName.startsWith("mcp__")) return "mcp";
  if (toolName === "Read" || toolName === "Glob" || toolName === "Grep") return "files";
  if (toolName === "WebFetch" || toolName === "WebSearch") return "web";
  if (toolName === "Bash" || toolName === "PowerShell") return "bash";
  if (toolName === "Agent" || toolName === "Task") return "subagents";
  return "other";
}
function _serverFor(toolName) {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(toolName || "");
  return m ? m[1] : "mcp";
}
function computeTokenBreakdown(transcriptPath) {
  if (!transcriptPath) return null;
  try {
    if (!fs2.existsSync(transcriptPath)) return null;
    const stat = fs2.statSync(transcriptPath);
    const mtime = stat.mtimeMs, size = stat.size;
    let cache = null;
    try { cache = JSON.parse(fs2.readFileSync(TOKENS_CACHE_PATH, "utf-8")); } catch {}
    if (cache && cache.path === transcriptPath && cache.mtime === mtime && cache.size === size) {
      return cache.result;
    }
    let offset = 0, sums = {}, idName = {};
    if (cache && cache.path === transcriptPath && cache.size <= size && cache.offset != null) {
      offset = cache.offset; sums = cache.sums || {}; idName = cache.idName || {};
    }
    const fd = fs2.openSync(transcriptPath, "r");
    const len = size - offset;
    const buf = Buffer.alloc(len);
    fs2.readSync(fd, buf, 0, len, offset);
    fs2.closeSync(fd);
    let text = buf.toString("utf-8");
    let lastNl = text.lastIndexOf("\n");
    let consumed = lastNl + 1;
    const lines = text.slice(0, consumed).split("\n").filter(Boolean);
    for (const line of lines) {
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      const msg = obj.message;
      if (msg && Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b?.type === "tool_use" && b.id) idName[b.id] = b.name;
          if ((b?.type === "text" || b?.type === "thinking") && (b.text || b.thinking)) {
            sums.chat = (sums.chat || 0) + Math.round(((b.text||b.thinking)||"").length / 4);
          }
          if (b?.type === "tool_result") {
            const name = idName[b.tool_use_id];
            const cat = _categoryFor(name);
            if (cat === "subagents") continue;
            const key = cat === "mcp" ? `mcp:${_serverFor(name)}` : cat;
            sums[key] = (sums[key] || 0) + _approxTokens(b.content);
          }
        }
      }
      if (obj.toolUseResult && typeof obj.toolUseResult.totalTokens === "number") {
        sums.subagents = (sums.subagents || 0) + obj.toolUseResult.totalTokens;
      }
    }
    const result = sums;
    fs2.writeFileSync(TOKENS_CACHE_PATH, JSON.stringify({
      path: transcriptPath, mtime, size, offset: offset + consumed, sums, idName, result
    }), "utf-8");
    return result;
  } catch (e) { debug("token breakdown error:", e); return null; }
}

// src/utils/aggregate.ts
var SESSIONS_PATH = path2.join(os2.homedir(), ".claude", ".statusline-sessions.json");

function _loadSessions() {
  try {
    if (!fs2.existsSync(SESSIONS_PATH)) return {};
    const o = JSON.parse(fs2.readFileSync(SESSIONS_PATH, "utf-8"));
    return (o && typeof o === "object") ? o : {};
  } catch (e) { debug("sessions load error:", e); return {}; }
}
function upsertAndAggregate(sessionId, costUsd, ctxTokens, ttlMs) {
  const now = Date.now();
  let map = _loadSessions();
  if (sessionId) {
    const prev = map[sessionId];
    let tokRate = prev?.tokRate ?? 0;
    if (prev && ctxTokens != null && prev.ctx != null) {
      const dMin = (now - prev.ts) / 60000;
      if (dMin > 0.05) {
        const dTok = ctxTokens - prev.ctx;
        tokRate = dTok > 0 ? Math.round(dTok / dMin) : 0;
      }
    }
    map[sessionId] = { ts: now, cost: costUsd ?? prev?.cost ?? 0, ctx: ctxTokens ?? prev?.ctx ?? 0, tokRate };
  }
  let count = 0, totalCost = 0, totalCtx = 0, totalRate = 0;
  for (const [id, e] of Object.entries(map)) {
    if (now - e.ts > ttlMs) { delete map[id]; continue; }
    count++; totalCost += e.cost || 0; totalCtx += e.ctx || 0; totalRate += e.tokRate || 0;
  }
  try { fs2.writeFileSync(SESSIONS_PATH, JSON.stringify(map), "utf-8"); }
  catch (e) { debug("sessions write error:", e); }
  return { count, totalCost, totalCtx, totalRate };
}
function _fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "k";
  return String(n);
}

// src/segments/block.ts
var BlockProvider = class {
  async getBlockInfo(pollInterval, stdinUsage) {
    if (stdinUsage?.fiveHour) {
      const fiveHour = stdinUsage.fiveHour;
      const now = /* @__PURE__ */ new Date();
      const resetAt = new Date(fiveHour.resetAt);
      const timeRemaining = Math.max(
        0,
        Math.round((resetAt.getTime() - now.getTime()) / (1e3 * 60))
      );
      debug(
        `Block segment (stdin): ${fiveHour.percentUsed}% used, ${timeRemaining}m remaining`
      );
      return {
        percentUsed: fiveHour.percentUsed,
        resetAt: fiveHour.resetAt,
        timeRemaining,
        isRealtime: true
      };
    }
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
  async getWeeklyInfo(resetDay, resetHour, resetMinute, pollInterval, stdinUsage, needPerModel) {
    if (stdinUsage?.sevenDay && !needPerModel) {
      const sevenDay = stdinUsage.sevenDay;
      const weekProgressPercent = this.calculateWeekProgressFromResetTime(sevenDay.resetAt);
      debug(`Weekly segment (stdin): ${sevenDay.percentUsed}% used`);
      return {
        percentUsed: sevenDay.percentUsed,
        resetAt: sevenDay.resetAt,
        isRealtime: true,
        weekProgressPercent,
        opusPercentUsed: null,
        sonnetPercentUsed: null,
        opusResetAt: null,
        sonnetResetAt: null
      };
    }
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
  block_cost: "\u23F1\uFE0F",
  // Stopwatch ⏱️
  weekly_cost: "\uD83D\uDCC5",
  // Calendar 📅
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
  block_cost: "\u23F1\uFE0F",
  weekly_cost: "\uD83D\uDCC5",
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
function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}
var ansi = {
  fg: (hex) => {
    const { r, g, b } = hexToRgb(hex);
    return `\x1B[38;2;${r};${g};${b}m`;
  },
  bg: (hex) => {
    const { r, g, b } = hexToRgb(hex);
    return `\x1B[48;2;${r};${g};${b}m`;
  },
  fgRaw: (n) => `\x1B[38;5;${n}m`,
  bgRaw: (n) => `\x1B[48;5;${n}m`,
  reset: "\x1B[0m"
};
var darkTheme = {
  directory: { bg: "#8b4513", fg: "#ffffff" },
  // Dark orange / saddle brown — Claude vibe
  git: { bg: "#404040", fg: "#ffffff" },
  model: { bg: "#2d2d2d", fg: "#ffffff" },
  block: { bg: "#1e1e1e", fg: "#e0e0e0" },
  weekly: { bg: "#1e1e1e", fg: "#e0e0e0" },
  opus: { bg: "#1e1e1e", fg: "#d8a0ff" },
  // Purple for Opus
  sonnet: { bg: "#1e1e1e", fg: "#a0d8ff" },
  // Light blue for Sonnet
  context: { bg: "#1e1e1e", fg: "#e0e0e0" },
  // Grey for context
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
  const envCols = parseInt(process.env.COLUMNS || "", 10);
  if (Number.isFinite(envCols) && envCols > 0) return envCols;
  return process.stdout.columns || 80;
}
function isWide(cp) {
  // Double-width / wide-glyph ranges. PUA (U+E000–F8FF, powerline glyphs like
  // U+E0B0) renders single-width in terminals, so it is intentionally excluded.
  return (
    (cp >= 0x1100 && cp <= 0x115F) || // Hangul Jamo
    (cp >= 0x2300 && cp <= 0x23FF) || // Misc Technical (⏱ etc.)
    (cp >= 0x25A0 && cp <= 0x27BF) || // Geometric Shapes, Misc Symbols, Dingbats (✱ ◇ ★)
    (cp >= 0x2B00 && cp <= 0x2BFF) || // Misc Symbols and Arrows
    cp >= 0x1F000                     // Emoji and supplementary symbols
  );
}
function visibleWidth(str) {
  const stripped = String(str).replace(/\x1B\[[0-9;]*m/g, "");
  let w = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0);
    // Variation selectors (U+FE00–FE0F) are zero-width combining marks: VS16 only
    // changes the *presentation* of the preceding glyph (e.g. ⏱ → ⏱️), it occupies
    // no extra cell. Counting it as 2 overestimated width by 2 per emoji.
    if (cp >= 0xFE00 && cp <= 0xFE0F) continue;
    w += isWide(cp) ? 2 : 1;
  }
  return w;
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
      context: "\uD83E\uDDE0",
      // Brain 🧠
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
    const emptyColor = "\x1B[38;2;90;90;90m";
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
  renderPrognosis(ctx) {
    if (!this.config.prognosis?.enabled) return null;
    const hist = this.history || [];
    const fiveEta = projectMinutesTo100(hist, "five");
    const spark = sparkline(hist, "five");
    const icon = this.usePowerline ? "⏳" : "~";
    let text;
    if (fiveEta == null) {
      text = `${icon} 5ч стаб.`;
    } else {
      const t = this.formatTimeRemaining(fiveEta, false);
      text = `${icon} 5ч→100% ~${t}`;
    }
    if (spark) text += ` ${spark}`;
    const warnLead = this.config.prognosis?.warnLeadMinutes ?? 30;
    const colors = (fiveEta != null && fiveEta < warnLead)
      ? (this.theme.warning || this.theme.block) : this.theme.block;
    return { text: ` ${text} `, colors };
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
    let name = ctx.envInfo.directory;
    // Truncate from the left (keep the tail — the current dir is the informative part)
    // when the fitter has imposed a directory width budget to avoid overflowing COLUMNS.
    if (ctx.maxDirWidth && name.length > ctx.maxDirWidth) {
      name = "…" + name.slice(name.length - (ctx.maxDirWidth - 1));
    }
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
  renderCost(ctx) {
    if (!this.config.cost?.enabled) return null;
    const usd = ctx.envInfo.costUsd;
    if (usd == null) return null;
    const threshold = this.config.cost?.threshold ?? 0.01;
    const always = this.config.cost?.alwaysShow ?? false;
    if (!always && ctx.envInfo.hasRateLimits) return null;
    if (usd < threshold) return null;
    const icon = this.usePowerline ? "\u{1F4B2}" : "$";
    const la = ctx.envInfo.linesAdded, lr = ctx.envInfo.linesRemoved;
    let text = `${icon} $${usd.toFixed(2)}`;
    if ((la != null || lr != null) && !ctx.compact) text += ` +${la ?? 0}/-${lr ?? 0}`;
    return { text: ` ${text} `, colors: this.theme.model };
  }
  renderMode(ctx) {
    if (!this.config.mode?.enabled) return null;
    const lvl = ctx.envInfo.effortLevel;
    const thinking = ctx.envInfo.thinkingEnabled;
    if (!lvl && !thinking) return null;
    const parts = [];
    if (lvl) {
      const map = { low: "▁", medium: "▃", high: "▅", xhigh: "▇", max: "█" };
      const bolt = this.usePowerline ? "⚡" : "E";
      parts.push(`${bolt}${map[lvl] || ""}${lvl}`);
    }
    if (thinking) parts.push(this.usePowerline ? "\u{1F4AD}" : "T");
    return { text: ` ${parts.join(" ")} `, colors: this.theme.model };
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
    const barWidth = ctx.barWidth ?? this.config.block.barWidth ?? 10;
    const showTime = this.config.block.showTimeRemaining ?? true;
    const trend = this.getTrendSymbol(ctx.trendInfo?.fiveHourTrend ?? null);
    let text;
    if (displayStyle === "bar") {
      // Bar renders even in compact mode — consistent with context (renderContext) and
      // weekly-smart (renderWeeklySmart), which both keep a bar when compact. Previously
      // the `&& !ctx.compact` guard dropped ONLY the 5h bar, so it vanished while the
      // others stayed (the "empty 5h scale" bug). Only the time suffix is compact-gated.
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
    const barWidth = ctx.barWidth ?? this.config.weekly?.barWidth ?? 10;
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
    const barWidth = ctx.barWidth ?? this.config.weekly?.barWidth ?? 8;
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
    const icon = this.usePowerline ? this.symbols.context : "\uD83E\uDDE0";
    const colors = this.getColorsForPercent(percent, this.theme.context);
    const bar = this.formatProgressBar(percent, ctx.barWidth ?? 10, ansi.fg(colors.fg));
    return {
      text: ` ${icon} ${bar} ${percent}% `,
      colors
    };
  }
  renderTokens(ctx) {
    if (!this.config.tokenBreakdown?.enabled) return null;
    const sums = this.tokenSums;
    if (!sums) return null;
    const entries = Object.entries(sums).filter(([,v]) => v > 0);
    if (entries.length === 0) return null;
    const total = entries.reduce((a,[,v]) => a+v, 0);
    if (total <= 0) return null;
    entries.sort((a,b) => b[1]-a[1]);
    const maxCats = this.config.tokenBreakdown?.maxCats ?? 4;
    const label = (k) => k.startsWith("mcp:") ? k.slice(4) : k;
    const top = entries.slice(0, maxCats).map(([k,v]) => `${label(k)} ${Math.round(v/total*100)}%`);
    const icon = "≈";
    return { text: ` ${icon} ${top.join(" · ")} `, colors: this.theme.context };
  }
  renderAggregate(ctx) {
    if (!this.config.aggregate?.enabled) return null;
    const a = this.aggregate;
    if (!a || a.count <= 0) return null;
    if (!(this.config.aggregate?.showSingle ?? true) && a.count <= 1) return null;
    const screens = this.usePowerline ? "\u{1F5A5}\u{FE0F}" : "[]";
    const parts = [`${screens}×${a.count}`];
    if (a.totalCost > 0) parts.push(`$${a.totalCost.toFixed(2)}`);
    if (a.totalCtx > 0) parts.push(`Σ${_fmtTokens(a.totalCtx)}`);
    if (a.totalRate > 0 && !ctx.compact) parts.push(`\u{1F525}${_fmtTokens(a.totalRate)}/м`);
    return { text: ` ${parts.join(" ")} `, colors: this.theme.model };
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
      case "prognosis":
        return this.renderPrognosis(ctx);
      case "cost":
        return this.renderCost(ctx);
      case "mode":
        return this.renderMode(ctx);
      case "tokenBreakdown":
        return this.renderTokens(ctx);
      case "aggregate":
        return this.renderAggregate(ctx);
      default:
        return null;
    }
  }
  buildOutput(ctx) {
    const order = ctx.names ?? (this.config.segmentOrder ?? ["directory", "git", "model", "block", "weekly"]);
    // Two powerline clusters: LEFT = directory/git/model, RIGHT = everything else.
    const LEFT_NAMES = ["directory", "git", "model"];
    const leftGroup = [];
    const rightGroup = [];
    for (const name of order) {
      const segment = this.getSegment(name, ctx);
      if (!segment) continue;
      if (LEFT_NAMES.includes(name)) {
        leftGroup.push(segment);
      } else {
        rightGroup.push(segment);
      }
    }
    let output = "";
    if (this.usePowerline) {
      const leftRun = leftGroup.length > 0 ? this.renderPowerline(leftGroup) : "";
      // Each right segment is its own isolated "island": space + black cutout wedge +
      // bg-filled content + RESET. The per-island leading space+wedge also serves as the
      // divider from the left group, so there is no separate inter-group wedge.
      // Each island is a right-pointing arrow with a concave tail, in its own color on the
      // default terminal bg (no black): [space][island-colored solid left triangle U+E0B2
      // on transparent — flat right edge merges into the body, left-corner concavity stays
      // terminal bg][island body + text][▶ island-colored right tip on transparent].
      let rightRun = "";
      for (const seg of rightGroup) {
        rightRun += RESET_CODE + " " + ansi.fg(seg.colors.bg) + "" + ansi.bg(seg.colors.bg) + ansi.fg(seg.colors.fg) + seg.text + RESET_CODE + ansi.fg(seg.colors.bg) + this.symbols.rightArrow + RESET_CODE;
      }
      output = leftRun + rightRun;
    } else {
      const leftRun = leftGroup.length > 0 ? this.renderFallback(leftGroup) : "";
      // Each right segment is its own island separated by a 2-space gap.
      const rightIslands = rightGroup.map(
        (seg) => ansi.bg(seg.colors.bg) + ansi.fg(seg.colors.fg) + seg.text + RESET_CODE
      );
      const rightRun = rightIslands.join("  ");
      if (leftRun && rightRun) {
        output = leftRun + "  " + rightRun;
      } else {
        output = leftRun + rightRun;
      }
    }
    return output;
  }
  render(blockInfo, weeklyInfo, envInfo, trendInfo = null) {
    const order = this.config.segmentOrder ?? ["directory", "git", "model", "context", "block", "weekly"];
    const line2On = this.config.line2?.enabled ?? true;
    const linesMap = /* @__PURE__ */ new Map();
    for (const name of order) {
      let ln = this.config[name]?.line ?? 1;
      if (ln === 2 && !line2On) continue;
      if (!linesMap.has(ln)) linesMap.set(ln, []);
      linesMap.get(ln).push(name);
    }
    const lineNumbers = [...linesMap.keys()].sort((a, b) => a - b);
    const renderedLines = [];
    for (const ln of lineNumbers) {
      const out = this.renderOneLine(linesMap.get(ln), { blockInfo, weeklyInfo, envInfo, trendInfo });
      if (out && out.trim() !== "") renderedLines.push(out);
    }
    return renderedLines.join("\n");
  }
  renderOneLine(names, common) {
    const { blockInfo, weeklyInfo, envInfo, trendInfo } = common;
    const compact = this.isCompactMode();
    const termWidth = getTerminalWidth();
    const ctx = {
      blockInfo,
      weeklyInfo,
      envInfo,
      trendInfo,
      compact,
      names
    };
    // Shared bar bounds. The configured per-segment barWidth values are no longer a cap;
    // bars rubber-shrink to MIN_BAR and rubber-grow up to MAX_BAR to maximize fill.
    const MIN_BAR = 3;
    const MAX_BAR = 60;
    // fitTarget keeps a 1-cell safety margin AND reserves space on the right
    // (rightReserve) for a right-aligned indicator (e.g. dictation badge).
    const rightReserve = this.config.display?.rightReserve ?? 1;
    const fitTarget = Math.max(MIN_BAR, termWidth - 1 - rightReserve);
    let out;
    if (compact) {
      // Already compact (narrow terminal): build once at the minimum bar width.
      ctx.barWidth = MIN_BAR;
      out = this.buildOutput(ctx);
    } else {
      // Rubber fitting: pick the LARGEST shared bar width that still fits.
      out = null;
      for (let bw = MAX_BAR; bw >= MIN_BAR; bw--) {
        ctx.compact = false;
        ctx.barWidth = bw;
        const candidate = this.buildOutput(ctx);
        if (visibleWidth(candidate) <= fitTarget) {
          out = candidate;
          break;
        }
      }
      if (out === null) {
        // Even minimal bars overflow — collapse to compact (drops the time suffix via
        // the !ctx.compact guards) and keep bar width minimal.
        ctx.compact = true;
        ctx.barWidth = MIN_BAR;
        out = this.buildOutput(ctx);
      }
    }
    // Final overflow guard: a long directory path (and/or model name) can push the line
    // past the terminal even after compaction. Truncate the directory — the one elastic
    // element — from the left until the whole line fits. Without this the line overflows
    // the right edge (long path) instead of staying within COLUMNS.
    if (visibleWidth(out) > fitTarget) {
      out = this.fitByTruncatingDir(ctx, fitTarget);
    }
    return out;
  }
  fitByTruncatingDir(ctx, fitTarget) {
    const fullDir = ctx.envInfo.directory || "";
    const MIN_DIR = 6;
    let out = this.buildOutput(ctx);
    // Estimate the cut (path cells are ASCII = 1 each), then shrink to convergence.
    const overflow = visibleWidth(out) - fitTarget;
    let allow = Math.max(MIN_DIR, fullDir.length - overflow);
    for (; allow >= MIN_DIR; allow--) {
      ctx.maxDirWidth = allow;
      out = this.buildOutput(ctx);
      if (visibleWidth(out) <= fitTarget) return out;
    }
    // Directory floored and still overflowing: the rest is fixed status data we won't
    // mangle. Return the floored build (the terminal clips the tail).
    ctx.maxDirWidth = MIN_DIR;
    return this.buildOutput(ctx);
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
  // 1. Generic version parser on the model id.
  // Matches: opus/sonnet/haiku followed by major and optional minor version,
  // tolerating both "-" and "." separators (e.g. claude-opus-4-8, claude-3-5-sonnet).
  if (modelId) {
    // Legacy "claude-3-5-sonnet" / "claude-3-opus" ordering: version BEFORE family.
    // Checked first so the version, not a date suffix, is captured.
    const m2 = modelId.match(/-(\d+)(?:[-.](\d{1,2}))?-(opus|sonnet|haiku)/i);
    if (m2) {
      const family = m2[3].charAt(0).toUpperCase() + m2[3].slice(1).toLowerCase();
      const major = m2[1];
      const minor = m2[2];
      return minor !== undefined ? `${family} ${major}.${minor}` : `${family} ${major}`;
    }
    // Modern "claude-opus-4-8" ordering: family followed by major and optional minor.
    const m = modelId.match(/(opus|sonnet|haiku)-(\d+)(?:[-.](\d{1,2}))?(?![\d])/i);
    if (m) {
      const family = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      const major = m[2];
      const minor = m[3];
      return minor !== undefined ? `${family} ${major}.${minor}` : `${family} ${major}`;
    }
  }
  // 3. Fallback: clean the display name.
  if (displayName) {
    const clean = displayName.replace(/^Claude\s*/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (clean) return clean;
  }
  // 4. Final fallback: truncated model id.
  if (!modelId) return null;
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
  const pre = ctx?.used_percentage;
  if (typeof pre === "number" && Number.isFinite(pre)) {
    return Math.round(pre);
  }
  if (!ctx?.current_usage || !ctx.context_window_size) {
    return 0;
  }
  const usage = ctx.current_usage;
  const totalTokens = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return Math.round(totalTokens / ctx.context_window_size * 100);
}
function getEnvironmentInfo(hookData, config) {
  const gitEnabled = config?.git?.enabled ?? true;
  return {
    directory: getDirectoryName(hookData),
    gitBranch: gitEnabled ? getGitBranch() : null,
    gitDirty: gitEnabled ? hasGitChanges() : false,
    model: getClaudeModel(hookData),
    contextPercent: getContextPercent(hookData),
    hasRateLimits: !!(hookData?.rate_limits?.five_hour || hookData?.rate_limits?.seven_day),
    costUsd: typeof hookData?.cost?.total_cost_usd === "number" ? hookData.cost.total_cost_usd : null,
    linesAdded: hookData?.cost?.total_lines_added ?? null,
    linesRemoved: hookData?.cost?.total_lines_removed ?? null,
    effortLevel: hookData?.effort?.level ?? null,
    thinkingEnabled: hookData?.thinking?.enabled ?? null,
    transcriptPath: hookData?.transcript_path ?? null,
    fiveHourPercent: hookData?.rate_limits?.five_hour?.used_percentage ?? null,
    sevenDayPercent: hookData?.rate_limits?.seven_day?.used_percentage ?? null,
    fiveHourResetAt: hookData?.rate_limits?.five_hour?.resets_at ?? null,
    sessionId: hookData?.session_id ?? null,
    ctxTokens: (() => {
      const u = hookData?.context_window?.current_usage;
      if (!u) return null;
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    })()
  };
}

// src/index.ts
async function main() {
  try {
    const config = loadConfig();
    debug("Config loaded:", JSON.stringify(config));
    const hookData = await readHookData();
    debug("Hook data:", JSON.stringify(hookData));
    const envInfo = getEnvironmentInfo(hookData, config);
    debug("Environment info:", JSON.stringify(envInfo));
    const blockProvider = new BlockProvider();
    const weeklyProvider = new WeeklyProvider();
    const pollInterval = config.budget?.pollInterval ?? 15;
    const stdinUsage = buildUsageFromHook(hookData);
    const needPerModel = config.weekly?.enabled && config.weekly?.viewMode === "smart" && (envInfo.model || "").toLowerCase().includes("sonnet");
    const [blockInfo, weeklyInfo] = await Promise.all([
      config.block?.enabled ? blockProvider.getBlockInfo(pollInterval, stdinUsage) : null,
      config.weekly?.enabled ? weeklyProvider.getWeeklyInfo(
        config.budget?.resetDay,
        config.budget?.resetHour,
        config.budget?.resetMinute,
        pollInterval,
        stdinUsage,
        needPerModel
      ) : null
    ]);
    debug("Block info:", JSON.stringify(blockInfo));
    debug("Weekly info:", JSON.stringify(weeklyInfo));
    let trendInfo = config.showTrend ? getUsageTrend() : null;
    const hist = appendHistory(envInfo.fiveHourPercent, envInfo.sevenDayPercent);
    if (hist && hist.length >= 2) {
      if (!trendInfo || typeof trendInfo !== "object") {
        trendInfo = { fiveHourTrend: null, sevenDayTrend: null, sevenDayOpusTrend: null, sevenDaySonnetTrend: null };
      }
      const tf = trendFromHistory(hist, "five"); if (tf) trendInfo.fiveHourTrend = tf;
      const ts = trendFromHistory(hist, "seven"); if (ts) trendInfo.sevenDayTrend = ts;
    }
    debug("Trend info:", JSON.stringify(trendInfo));
    const renderer = new Renderer(config);
    renderer.history = hist;
    // Only run the line-2-only sidecar work (transcript token parse, sessions
    // upsert) when a line-2 segment is actually active in segmentOrder — otherwise
    // it is pure overhead. History append above stays unconditional: it also feeds
    // the line-1 trend arrows.
    const line2Active = (config.line2?.enabled ?? true) && (config.segmentOrder ?? []).some((n) => (config[n]?.line ?? 1) === 2);
    const tokenSums = line2Active && config.tokenBreakdown?.enabled ? computeTokenBreakdown(envInfo.transcriptPath) : null;
    renderer.tokenSums = tokenSums;
    const agg = line2Active && config.aggregate?.enabled
      ? upsertAndAggregate(envInfo.sessionId, envInfo.costUsd, envInfo.ctxTokens, (config.aggregate?.ttlSeconds ?? 90) * 1000)
      : null;
    renderer.aggregate = agg;
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