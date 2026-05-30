# Statusline Second-Line Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional second statusline row carrying five new segments — limit-burn prognosis (with stdin-sourced trend), a cross-terminal aggregate (Σ over all live sessions), a cost detector, an effort/thinking indicator, and an approximate token-source breakdown — without breaking the existing first-line layout, rubber-fit, or hybrid usage source.

**Architecture:** Everything lives in the single pre-bundled file `E:\DEV\Statusline\dist\index.js` (no `src/`, no build step — edit the bundle directly, following its `// src/<module>.ts` section comments). Segments gain a `line` config field; the renderer groups enabled segments by line number, renders each line through the existing group-split + rubber-fit pipeline, and joins lines with `\n` (Claude Code renders one row per output line). Two new disk sidecars under `~/.claude/` provide cross-render state: a usage-history ring buffer (feeds trend + prognosis, replacing the API-cache dependency for trends) and a token-breakdown cache (mtime-gated incremental tail-parse of the transcript).

**Tech Stack:** Node ≥18 ESM, ANSI truecolor escapes, Claude Code statusline stdin JSON (fields: `rate_limits`, `cost`, `effort`, `thinking`, `context_window`, `transcript_path`), `fs`/`os`/`path`.

**Verification model:** No unit-test framework exists in this repo and the source is a bundle. Each task is verified by piping a crafted hook-JSON sample through `node E:\DEV\Statusline\dist\index.js` with `$env:COLUMNS` set, and inspecting stdout (rendered text and/or raw ANSI). A reusable sample file is created in Task 1. Local git commits are optional (the user does NOT want GitHub pushes); the durable "ship" step per feature is `npm install -g .` from `E:\DEV\Statusline`, which updates the global `morgott-statusline` bin.

---

## File Structure

Single file, `E:\DEV\Statusline\dist\index.js`. New logical sections (added in-place, near related existing code, with `// src/...` style banner comments to match the bundle):

- **Config** (`DEFAULT_CONFIG`, near top): add `line2`, `prognosis`, `cost`, `mode`, `tokenBreakdown` blocks and a `line` field convention.
- **History sidecar** (`// src/utils/history.ts`, near the disk-cache code ~`DISK_CACHE_PATH`): ring-buffer read/append + trend/sparkline/prognosis helpers.
- **Token breakdown** (`// src/utils/token-breakdown.ts`, after history): mtime-gated incremental transcript parser + category aggregation.
- **Environment** (`getEnvironmentInfo`): surface `cost`, `effort`, `thinking`, `transcriptPath`, and raw `rate_limits` presence into `envInfo`.
- **Renderer** (`Renderer` class): new `renderPrognosis`, `renderCost`, `renderMode`, `renderTokens` methods; `getSegment` cases; multi-line grouping in `render()`.

Helper test sample: `E:\DEV\Statusline\_sample.json` (created/deleted within tasks; already git-ignored is not guaranteed — delete before any commit).

---

## Task 1: Config schema + reusable test sample

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`DEFAULT_CONFIG` object)
- Create (temporary): `E:\DEV\Statusline\_sample.json`

- [ ] **Step 1: Extend DEFAULT_CONFIG**

In `DEFAULT_CONFIG`, add `line` to existing visible segments and add the new segment blocks. Existing `directory/git/model/context/block/weekly` get `line: 1`. Add:

```js
  // existing blocks gain a line field, e.g.:
  context: { enabled: true, line: 1 },
  // ...
  line2: { enabled: true },              // master switch for the whole second row
  prognosis: { enabled: true, line: 2, warnLeadMinutes: 30 },
  cost: { enabled: true, line: 2, threshold: 0.01, alwaysShow: false },
  mode: { enabled: true, line: 2 },
  tokenBreakdown: { enabled: true, line: 2, maxCats: 4 },
  aggregate: { enabled: true, line: 2, ttlSeconds: 90, showSingle: true }, // cross-terminal Σ (Task 11)
```

Also extend `segmentOrder` default to include the new names at the end:
```js
  segmentOrder: ["directory", "git", "model", "context", "block", "weekly", "mode", "aggregate", "prognosis", "cost", "tokenBreakdown"],
```

- [ ] **Step 2: Create the reusable sample**

Write `E:\DEV\Statusline\_sample.json` (single line, valid JSON):

```json
{"model":{"id":"claude-opus-4-8","display_name":"Claude Opus 4.8 (1M context)"},"workspace":{"current_dir":"E:\\DEV\\Statusline","project_dir":"E:\\DEV\\Statusline"},"cwd":"E:\\DEV\\Statusline","transcript_path":"E:/DEV/Statusline/_fake_transcript.jsonl","context_window":{"used_percentage":42,"context_window_size":1000000,"current_usage":{"input_tokens":100000,"cache_read_input_tokens":320000}},"rate_limits":{"five_hour":{"used_percentage":67,"resets_at":4102444800},"seven_day":{"used_percentage":23,"resets_at":4102444800}},"cost":{"total_cost_usd":0.42,"total_lines_added":120,"total_lines_removed":30,"total_duration_ms":1830000},"effort":{"level":"high"},"thinking":{"enabled":true}}
```

- [ ] **Step 3: Verify config loads and line 1 unchanged**

Run (PowerShell):
```
$env:COLUMNS=120; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js
```
Expected: existing first line renders exactly as before (path · model | bars). New segments NOT yet rendered (no render methods yet) — so output is unchanged. `node --check E:\DEV\Statusline\dist\index.js` passes.

---

## Task 2: Surface new stdin fields into envInfo

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`getEnvironmentInfo`, and the `EnvInfo` shape it returns)

- [ ] **Step 1: Extend getEnvironmentInfo**

Add fields read from `hookData`:

```js
function getEnvironmentInfo(hookData, config) {
  const gitEnabled = config?.git?.enabled ?? true;
  const cost = hookData?.cost ?? null;
  return {
    directory: getDirectoryName(hookData),
    gitBranch: gitEnabled ? getGitBranch() : null,
    gitDirty: gitEnabled ? hasGitChanges() : false,
    model: getClaudeModel(hookData),
    contextPercent: getContextPercent(hookData),
    // new:
    hasRateLimits: !!(hookData?.rate_limits?.five_hour || hookData?.rate_limits?.seven_day),
    costUsd: typeof cost?.total_cost_usd === "number" ? cost.total_cost_usd : null,
    linesAdded: cost?.total_lines_added ?? null,
    linesRemoved: cost?.total_lines_removed ?? null,
    effortLevel: hookData?.effort?.level ?? null,
    thinkingEnabled: hookData?.thinking?.enabled ?? null,
    transcriptPath: hookData?.transcript_path ?? null,
    fiveHourPercent: hookData?.rate_limits?.five_hour?.used_percentage ?? null,
    sevenDayPercent: hookData?.rate_limits?.seven_day?.used_percentage ?? null,
    fiveHourResetAt: hookData?.rate_limits?.five_hour?.resets_at ?? null,   // epoch seconds
    // for cross-terminal aggregation (Task 11):
    sessionId: hookData?.session_id ?? null,
    ctxTokens: (() => {                    // current context tokens this session
      const u = hookData?.context_window?.current_usage;
      if (!u) return null;
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    })(),
  };
}
```

- [ ] **Step 2: Verify**

Add a temporary `debug("env:", JSON.stringify(envInfo))` is unnecessary; instead run with debug env on:
```
$env:CLAUDE_LIMITLINE_DEBUG="true"; $env:COLUMNS=120; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js
```
Expected (stderr debug): the `Environment info:` line now includes `costUsd:0.42, effortLevel:"high", thinkingEnabled:true, hasRateLimits:true, transcriptPath:"E:/DEV/Statusline/_fake_transcript.jsonl"`. `node --check` passes. Unset debug afterwards: `$env:CLAUDE_LIMITLINE_DEBUG=$null`.

---

## Task 3: Usage-history sidecar (trend + sparkline + prognosis math)

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (new `// src/utils/history.ts` section near `DISK_CACHE_PATH`)

- [ ] **Step 1: Add history storage + append (throttled)**

```js
// src/utils/history.ts
var HISTORY_PATH = path2.join(os2.homedir(), ".claude", ".statusline-history.json");
var HISTORY_MAX = 30;            // keep last 30 samples
var HISTORY_MIN_GAP_MS = 60 * 1000; // append at most once per 60s

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
```

- [ ] **Step 2: Add trend, sparkline, prognosis helpers**

```js
function trendFromHistory(hist, key) {
  if (hist.length < 2) return null;
  const a = hist[hist.length - 2][key];
  const b = hist[hist.length - 1][key];
  if (a == null || b == null) return null;
  if (b > a + 0.5) return "up";
  if (b < a - 0.5) return "down";
  return null;
}

var SPARK = ["▁","▂","▃","▄","▅","▆","▇","█"]; // ▁▂▃▄▅▆▇█
function sparkline(hist, key) {
  const vals = hist.map(h => h[key]).filter(v => v != null);
  if (vals.length < 2) return "";
  return vals.map(v => SPARK[Math.min(7, Math.max(0, Math.round(v / 100 * 7)))]).join("");
}

// Returns minutes until the window hits 100% at the recent burn rate, or null if not rising.
function projectMinutesTo100(hist, key) {
  const pts = hist.filter(h => h[key] != null);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const dPct = last[key] - first[key];
  const dMin = (last.ts - first.ts) / 60000;
  if (dMin <= 0 || dPct <= 0.5) return null;        // flat/declining → no burn ETA
  const ratePerMin = dPct / dMin;                   // %/min
  const remainingPct = 100 - last[key];
  if (remainingPct <= 0) return 0;
  return Math.round(remainingPct / ratePerMin);
}
```

- [ ] **Step 3: Verify helpers in isolation**

Run:
```
node -e "const f=require('fs');f.writeFileSync(process.env.USERPROFILE+'/.claude/.statusline-history.json', JSON.stringify([{ts:Date.now()-600000,five:50,seven:20},{ts:Date.now(),five:67,seven:23}]));"
```
Then add a one-off debug print at end of `main()` temporarily, OR rely on Task 5 prognosis rendering. Minimal check now: `node --check` passes. (Full behavior verified in Task 5.)

---

## Task 4: Multi-line renderer (group segments by line, join with `\n`)

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`Renderer.render`, `getSegment`, ctx)

This task refactors `render()` to support N lines. It must keep line-1 output byte-identical when no line-2 segments are enabled.

- [ ] **Step 1: Tag segments with line number and group**

Replace the body of `render()` so it: builds the ordered segment list, resolves each segment's line via `this.config[name]?.line ?? 1`, groups by line, and for each line runs the EXISTING per-line pipeline (the current left/right group-split + black wedge + rubber-fit in `buildOutput`/the fit loop). Sketch:

```js
render(blockInfo, weeklyInfo, envInfo, trendInfo = null) {
  const baseCompact = this.isCompactMode();
  const order = this.config.segmentOrder ?? ["directory","git","model","context","block","weekly"];
  const line2On = this.config.line2?.enabled ?? true;

  // group segment NAMES by line
  const linesMap = new Map();
  for (const name of order) {
    let ln = this.config[name]?.line ?? 1;
    if (ln === 2 && !line2On) continue;        // line2 disabled → skip its segments
    if (!linesMap.has(ln)) linesMap.set(ln, []);
    linesMap.get(ln).push(name);
  }

  const lineNumbers = [...linesMap.keys()].sort((a,b)=>a-b);
  const renderedLines = [];
  for (const ln of lineNumbers) {
    const names = linesMap.get(ln);
    const out = this.renderOneLine(names, { blockInfo, weeklyInfo, envInfo, trendInfo, baseCompact });
    if (out && out.trim() !== "") renderedLines.push(out);
  }
  return renderedLines.join("\n");
}
```

- [ ] **Step 2: Extract renderOneLine from the current render body**

Move the existing logic (build ctx with compact, build segments for the given `names`, partition into LEFT (`directory`,`git`,`model`) / RIGHT groups, the black-wedge divider, and the rubber-fit shrink/grow loop calling `buildOutput(ctx)`) into `renderOneLine(names, common)`. `buildOutput` must iterate ONLY over `names` (not the global order). Everything else (visibleWidth, MIN_BAR/MAX_BAR, fitTarget with rightReserve) stays identical.

> **INTEGRATION NOTE (current code, added after this plan was written — the fit-bug fix):** `render()` now ends with a final overflow guard that calls `this.fitByTruncatingDir(ctx, fitTarget)` (truncates the directory from the left via `ctx.maxDirWidth` when the built line still exceeds `fitTarget`). This guard plus the compact-fallback branch must move INTO `renderOneLine` so EACH line truncates/fits independently. `renderDirectory` already honours `ctx.maxDirWidth` — keep that. Do NOT drop the guard during the refactor; line 2 (with its long aggregate/token segments) needs it too. Also note `renderBlock` no longer gates its bar on `!ctx.compact` (only the time suffix is) — preserve that.

- [ ] **Step 3: Verify line 1 unchanged + empty line 2 produces no trailing newline**

With only existing segments enabled (new render methods still absent → their getSegment returns null), run at COLUMNS=120. Expected: output identical to pre-Task-4 (single line, same bytes). Confirm no trailing `\n` when line 2 has no renderable segments. `node --check` passes.

---

## Task 5: Prognosis segment (+ wire history append, fix trend arrows)

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`main()` to append history; `Renderer.renderPrognosis`; `getSegment` case `"prognosis"`)

- [ ] **Step 1: Append history each render in main()**

In `main()`, after `envInfo` is built and before rendering:
```js
const hist = appendHistory(envInfo.fiveHourPercent, envInfo.sevenDayPercent);
```
Pass `hist` into the renderer (store on ctx or renderer). Simplest: `renderer.history = hist;` before `renderer.render(...)`, and read `this.history` in renderPrognosis.

- [ ] **Step 2: Implement renderPrognosis**

```js
renderPrognosis(ctx) {
  if (!this.config.prognosis?.enabled) return null;
  const hist = this.history || [];
  const fiveEta = projectMinutesTo100(hist, "five");
  const spark = sparkline(hist, "five");
  const icon = this.usePowerline ? "⏳" : "~";   // ⏳
  let text;
  if (fiveEta == null) {
    text = `${icon} 5ч стаб.`;              // "5ч стаб." (flat/declining)
  } else {
    const t = this.formatTimeRemaining(fiveEta, false);
    text = `${icon} 5ч→100% ~${t}`;                      // ETA to cap
  }
  if (spark) text += ` ${spark}`;
  const colors = fiveEta != null && fiveEta < (this.config.prognosis?.warnLeadMinutes ?? 30)
    ? this.theme.warning : this.theme.block;
  return { text: ` ${text} `, colors };
}
```

- [ ] **Step 3: Wire getSegment + use history-based trend for existing arrows**

Add `case "prognosis": return this.renderPrognosis(ctx);` in `getSegment`. Also, in `getTrendSymbol`/where `trendInfo` is consumed, prefer history trend when available: compute `trendInfo.fiveHourTrend = trendFromHistory(hist,"five")` and `sevenDayTrend = trendFromHistory(hist,"seven")` in `main()` (override the API-derived trend when stdin history exists). This fixes blank arrows in stdin-only mode.

- [ ] **Step 4: Verify**

Seed history (Task 3 Step 3 command, with a rising five: 50→67 over 10 min → rate 1.7%/min → remaining 33% → ETA ~19 min). Put `prognosis` on line 2, run at COLUMNS=120:
```
$env:COLUMNS=120; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js
```
Expected: a SECOND line appears containing `⏳ 5ч→100% ~19м ▁▇` (sparkline of the two samples), colored warning (19 < 30). With a flat history (both samples 67) → `⏳ 5ч стаб.`. `node --check` passes.

---

## Task 6: Cost detector segment

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`Renderer.renderCost`; `getSegment` case `"cost"`)

- [ ] **Step 1: Implement renderCost (detector logic)**

```js
renderCost(ctx) {
  if (!this.config.cost?.enabled) return null;
  const usd = ctx.envInfo.costUsd;
  if (usd == null) return null;
  const threshold = this.config.cost?.threshold ?? 0.01;
  const always = this.config.cost?.alwaysShow ?? false;
  // Detector: on a subscription (rate_limits present) the cost is notional — hide unless alwaysShow.
  if (!always && ctx.envInfo.hasRateLimits) return null;
  if (usd < threshold) return null;
  const icon = this.usePowerline ? "💲" : "$";   // 💲
  const la = ctx.envInfo.linesAdded, lr = ctx.envInfo.linesRemoved;
  let text = `${icon} $${usd.toFixed(2)}`;
  if ((la != null || lr != null) && !ctx.compact) text += ` +${la ?? 0}/-${lr ?? 0}`;
  return { text: ` ${text} `, colors: this.theme.model };
}
```

- [ ] **Step 2: Wire getSegment**

Add `case "cost": return this.renderCost(ctx);`.

- [ ] **Step 3: Verify both branches**

(a) With the sample as-is (`rate_limits` present) → cost segment HIDDEN (subscription). Confirm no `$` in output.
(b) Make a copy sample without `rate_limits`:
```
$env:COLUMNS=120; (Get-Content E:\DEV\Statusline\_sample.json -Raw) -replace '"rate_limits":\{[^}]*\}\},','' | node E:\DEV\Statusline\dist\index.js
```
Expected: now `💲 $0.42 +120/-30` appears on line 2 (no subscription → real spend shown). `node --check` passes.

---

## Task 7: Effort/thinking (mode) segment

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`Renderer.renderMode`; `getSegment` case `"mode"`)

- [ ] **Step 1: Implement renderMode**

```js
renderMode(ctx) {
  if (!this.config.mode?.enabled) return null;
  const lvl = ctx.envInfo.effortLevel;       // low|medium|high|xhigh|max
  const thinking = ctx.envInfo.thinkingEnabled;
  if (!lvl && !thinking) return null;
  const parts = [];
  if (lvl) {
    const map = { low: "▁", medium: "▃", high: "▅", xhigh: "▇", max: "█" };
    const bolt = this.usePowerline ? "⚡" : "E:";   // ⚡
    parts.push(`${bolt}${map[lvl] || ""}${lvl}`);
  }
  if (thinking) parts.push(this.usePowerline ? "💭" : "T"); // 💭
  return { text: ` ${parts.join(" ")} `, colors: this.theme.model };
}
```

- [ ] **Step 2: Wire getSegment**

Add `case "mode": return this.renderMode(ctx);`.

- [ ] **Step 3: Verify**

Run at COLUMNS=120 with the sample (effort high, thinking true). Expected line 2 contains `⚡▅high 💭`. Remove `effort`/`thinking` from a sample copy → segment hidden. `node --check` passes.

---

## Task 8: Token-breakdown parser (mtime-gated incremental tail parse)

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (new `// src/utils/token-breakdown.ts` section)
- Create (temporary): `E:\DEV\Statusline\_fake_transcript.jsonl`

- [ ] **Step 1: Add the sidecar cache + incremental parser**

Categories: `mcp` (further keyed by server), `files` (Read/Glob/Grep), `web` (WebFetch/WebSearch), `bash` (Bash), `subagents` (Agent — EXACT via `toolUseResult.totalTokens`), `chat` (user+assistant text/thinking blocks), `other`. Attribution for non-subagent tools = `chars(result content)/4` (≈ tokens). Join `tool_result.tool_use_id` → tool name via an id→name map built from `tool_use` blocks.

```js
// src/utils/token-breakdown.ts
var TOKENS_CACHE_PATH = path2.join(os2.homedir(), ".claude", ".statusline-tokens.json");

function _approxTokens(content) {
  // content: string | array of blocks
  let chars = 0;
  if (typeof content === "string") chars = content.length;
  else if (Array.isArray(content)) {
    for (const b of content) {
      if (typeof b === "string") chars += b.length;
      else if (b?.type === "text" && typeof b.text === "string") chars += b.text.length;
      else if (b?.type === "image") chars += 6400; // flat ~1600 tok image ≈ 6400 "chars"
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
function _serverFor(toolName) {           // mcp__<server>__<tool>
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
      return cache.result; // unchanged → reuse
    }
    // incremental: reuse offset/state if same file and not truncated
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
    // keep only complete lines; stash trailing partial by adjusting offset
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
            if (cat === "subagents") continue; // counted via toolUseResult below (exact)
            const key = cat === "mcp" ? `mcp:${_serverFor(name)}` : cat;
            sums[key] = (sums[key] || 0) + _approxTokens(b.content);
          }
        }
      }
      // exact subagent tokens
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
```

NOTE: `tool_result` blocks live in `user`-role messages (results are sent back as user turns) — the loop above iterates every line's `message.content`, so both assistant `tool_use` and user `tool_result` are covered as long as the id→name map is built before/within the same pass (append-only order guarantees tool_use precedes its result).

- [ ] **Step 2: Create a fake transcript for deterministic verification**

Write `E:\DEV\Statusline\_fake_transcript.jsonl` (each line one JSON object):
```
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"mcp__plugin_serena_serena__find_symbol","input":{}},{"type":"tool_use","id":"t2","name":"Read","input":{}},{"type":"text","text":"hello there general"}]}}
{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},{"type":"tool_result","tool_use_id":"t2","content":"BBBBBBBB"}]}}
{"type":"user","toolUseResult":{"totalTokens":5000,"agentType":"general-purpose"},"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t3","content":"x"}]}}
```
(t1 mcp result = 32 chars → 8 tok; t2 Read = 8 chars → 2 tok; chat text 19 chars → ~5 tok; subagents = 5000 exact.)

- [ ] **Step 3: Verify parser output**

Run:
```
node -e "const m=require('E:/DEV/Statusline/dist/index.js')" 2>$null   # bundle auto-runs main on import; instead test via a temp harness:
```
Because the bundle calls `main()` on load, test the function by a temporary inline eval is awkward. Instead verify END-TO-END in Task 9 (the segment prints the numbers). Minimal check now: `node --check` passes and (after Task 9) the rendered breakdown matches: subagents 5000 dominant, mcp:plugin_serena_serena 8, files 2, chat ~5.

---

## Task 9: Token-breakdown segment (relative ≈ bars)

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (`Renderer.renderTokens`; `getSegment` case `"tokenBreakdown"`; call `computeTokenBreakdown` in `main()`)

- [ ] **Step 1: Compute in main() and pass to renderer**

In `main()`:
```js
const tokenSums = config.tokenBreakdown?.enabled ? computeTokenBreakdown(envInfo.transcriptPath) : null;
renderer.tokenSums = tokenSums;
```

- [ ] **Step 2: Implement renderTokens**

```js
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
  const top = entries.slice(0, maxCats)
    .map(([k,v]) => `${label(k)} ${Math.round(v/total*100)}%`);
  const icon = "≈"; // ≈ marks approximate
  return { text: ` ${icon} ${top.join(" · ")} `, colors: this.theme.context };
}
```

- [ ] **Step 3: Wire getSegment**

Add `case "tokenBreakdown": return this.renderTokens(ctx);`.

- [ ] **Step 4: Verify end-to-end (covers Task 8)**

With `_fake_transcript.jsonl` from Task 8 and the sample pointing `transcript_path` at it, run at COLUMNS=160:
```
$env:COLUMNS=160; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js
```
Expected line 2 contains `≈ subagents 99% · plugin_serena_serena 0% · files 0% · chat 0%` (subagents 5000 dwarfs the rest — proves exact subagent path + approx tool path both populate). Adjust the fake transcript to larger tool results to see balanced percentages. Confirm the cache sidecar `~/.claude/.statusline-tokens.json` is written and a second run with unchanged file is instant (mtime hit). `node --check` passes.

---

## Task 10: Cross-terminal aggregation (sessions sidecar + aggregate segment)

**Why:** The user runs Claude Code in ≥5 terminals at once and wants line-2 to show totals across ALL live sessions. The 5h/weekly rate-limits are already account-wide (the API returns account utilization, so prognosis already covers all terminals). The NEW part is summing PER-SESSION metrics — session count, cost, context tokens, and token burn-rate — across every live window via a shared sidecar.

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (new `// src/utils/aggregate.ts` section near history; `main()` upsert; `Renderer.renderAggregate`; `getSegment` case `"aggregate"`)

- [ ] **Step 1: Shared sessions sidecar (upsert + prune + aggregate)**

```js
// src/utils/aggregate.ts
var SESSIONS_PATH = path2.join(os2.homedir(), ".claude", ".statusline-sessions.json");

function _loadSessions() {
  try {
    if (!fs2.existsSync(SESSIONS_PATH)) return {};
    const o = JSON.parse(fs2.readFileSync(SESSIONS_PATH, "utf-8"));
    return (o && typeof o === "object") ? o : {};
  } catch (e) { debug("sessions load error:", e); return {}; }
}

// Upsert this terminal's entry, compute its own token burn-rate from the ctx delta,
// prune entries whose ts is older than ttlMs, return the fresh aggregate.
// Last-writer-wins; no lock needed (small file, races tolerable — a dropped write just
// means one window's number is one tick stale).
function upsertAndAggregate(sessionId, costUsd, ctxTokens, ttlMs) {
  const now = Date.now();
  let map = _loadSessions();
  if (sessionId) {
    const prev = map[sessionId];
    let tokRate = prev?.tokRate ?? 0;                 // tokens/min
    if (prev && ctxTokens != null && prev.ctx != null) {
      const dMin = (now - prev.ts) / 60000;
      if (dMin > 0.05) {                              // ignore sub-3s deltas (noisy)
        const dTok = ctxTokens - prev.ctx;
        tokRate = dTok > 0 ? Math.round(dTok / dMin) : 0;
      }
    }
    map[sessionId] = { ts: now, cost: costUsd ?? prev?.cost ?? 0, ctx: ctxTokens ?? prev?.ctx ?? 0, tokRate };
  }
  // prune stale
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
```

- [ ] **Step 2: Call from main(), pass aggregate to renderer**

In `main()`, after `envInfo` is built (and after the history append from Task 5):
```js
const agg = config.aggregate?.enabled
  ? upsertAndAggregate(envInfo.sessionId, envInfo.costUsd, envInfo.ctxTokens,
      (config.aggregate?.ttlSeconds ?? 90) * 1000)
  : null;
renderer.aggregate = agg;
```

- [ ] **Step 3: Implement renderAggregate**

```js
renderAggregate(ctx) {
  if (!this.config.aggregate?.enabled) return null;
  const a = this.aggregate;
  if (!a || a.count <= 0) return null;
  // With showSingle:false, only show when >1 terminal is live (the feature's point).
  if (!(this.config.aggregate?.showSingle ?? true) && a.count <= 1) return null;
  const screens = this.usePowerline ? "🖥️" : "[]";
  const parts = [`${screens}×${a.count}`];
  if (a.totalCost > 0) parts.push(`$${a.totalCost.toFixed(2)}`);
  if (a.totalCtx > 0) parts.push(`Σ${_fmtTokens(a.totalCtx)}`);
  if (a.totalRate > 0 && !ctx.compact) parts.push(`🔥${_fmtTokens(a.totalRate)}/м`);
  return { text: ` ${parts.join(" ")} `, colors: this.theme.model };
}
```

- [ ] **Step 4: Wire getSegment**

Add `case "aggregate": return this.renderAggregate(ctx);`.

- [ ] **Step 5: Verify multi-session aggregation**

Simulate two live terminals by pre-seeding the sidecar, then render a third:
```
node -e "const f=require('fs');const p=process.env.USERPROFILE+'/.claude/.statusline-sessions.json';f.writeFileSync(p,JSON.stringify({s1:{ts:Date.now(),cost:0.50,ctx:120000,tokRate:3000},s2:{ts:Date.now(),cost:1.00,ctx:80000,tokRate:5000}}));"
$env:COLUMNS=160; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js
```
Expected line 2 contains `🖥️×3 $1.92 Σ320k 🔥…/м` (s1+s2 + this render's own session = 3; cost 0.50+1.00+0.42; ctx 120k+80k+ctxTokens-of-sample). Then re-seed with one entry's `ts` set 200s in the past and `ttlSeconds:90` → that entry is pruned, count drops. Confirm `~/.claude/.statusline-sessions.json` is rewritten without the stale id. `node --check` passes.

---

## Task 11: Integration, rubber-fit on line 2, cleanup, install

**Files:**
- Modify: `E:\DEV\Statusline\dist\index.js` (final review)
- Delete: `E:\DEV\Statusline\_sample.json`, `E:\DEV\Statusline\_fake_transcript.jsonl`

- [ ] **Step 1: Verify both lines + rubber-fit together**

Enable all segments. Run at COLUMNS=200, 120, 80, 60:
```
foreach ($c in 200,120,80,60) { $env:COLUMNS=$c; "=== $c ==="; Get-Content E:\DEV\Statusline\_sample.json -Raw | node E:\DEV\Statusline\dist\index.js; "" }
```
Expected: TWO output lines at each width; each line independently rubber-fits within `COLUMNS-2` (verify with the same ANSI-stripped wide-aware recount used previously). At 60 both lines degrade gracefully (bars MIN / segments drop), no overflow beyond the documented physical floor. Line 1 still shows `Opus 4.8`, the grey bars, and the black wedge.

- [ ] **Step 2: Confirm safe degradation when fields absent**

Run with a minimal sample (only `model.id`, `cwd`): 
```
$env:COLUMNS=120; '{"model":{"id":"claude-opus-4-8"},"cwd":"E:\\DEV\\Statusline"}' | node E:\DEV\Statusline\dist\index.js
```
Expected: line 1 renders (path+model+context 0%); line 2 collapses to nothing (no rate_limits→prognosis flat or hidden, no cost, no effort/thinking, no transcript→no tokens) and produces NO empty second row / no trailing newline. Exit 0, no crash.

- [ ] **Step 3: Delete temp files**

```
Remove-Item E:\DEV\Statusline\_sample.json, E:\DEV\Statusline\_fake_transcript.jsonl -ErrorAction SilentlyContinue
```

- [ ] **Step 4: Install globally**

```
npm install -g . --prefix $env:APPDATA\npm   # from E:\DEV\Statusline; or simply: npm install -g .
```
Run from `E:\DEV\Statusline`. Expected: success; the global `morgott-statusline` bin contains the new code. Final live check: pipe a real-ish sample and confirm two rows render.

---

## Self-Review

**Spec coverage:**
- Multi-line layout → Task 4. ✓
- Prognosis + trend fix (stdin history) → Tasks 3, 5. ✓
- Cost detector (hide on subscription) → Task 6. ✓
- Effort/thinking → Task 7. ✓
- ≈Token breakdown (mtime-gated incremental transcript parse, subagents exact, rest approx) → Tasks 8, 9. ✓
- Cross-terminal aggregation (sessions sidecar: count, Σcost, Σctx, Σtoken-rate) → Task 10. ✓
- Rubber-fit must still work per line + fitByTruncatingDir guard preserved per line → Task 4 (incl. integration note) + Task 11 Step 1. ✓
- Don't break line 1 / hybrid source / model fix / fit-bug fix → Task 4 Step 3, Task 11. ✓

**Placeholder scan:** No "TODO/implement later"; all code blocks are concrete. Heuristics (char/4, image flat 6400) are explicit, not vague.

**Type consistency:** `envInfo` fields added in Task 2 are consumed by exact names in Tasks 5–9 (`fiveHourPercent`, `costUsd`, `effortLevel`, `thinkingEnabled`, `transcriptPath`, `hasRateLimits`). History sample shape `{ts,five,seven}` consistent across Tasks 3 and 5. `computeTokenBreakdown` returns the `sums` object consumed by `renderTokens` (Task 9) with `mcp:<server>` keys produced in Task 8. `renderOneLine`/`buildOutput` names consistent in Task 4.

**Known approximation caveats (documented, by design):** token breakdown is ±25%, system prompt/tool-schema preamble invisible, images flat-estimated; only subagent tokens are exact. Surfaced to the user via the `≈` prefix.
