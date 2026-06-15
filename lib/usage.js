// Parser für Claude-Code-Usage aus ~/.claude/projects/**.jsonl
//
// Jede JSONL-Zeile ist ein Event; nur `type: "assistant"`-Events haben
// `message.usage` mit Token-Zahlen. Context-Füllung eines Turns ≈
// input_tokens + cache_creation_input_tokens + cache_read_input_tokens
// (der nächste API-Call bekommt genau diese Summe als Input zurück).
//
// Cwd-Mangling: /Users/jane/Projects/foo → -Users-jane-Projects-foo
//
// Public APIs:
//   getCurrentContext(cwd) → {tokens, model} aus dem letzten assistant-Event
//                             der neuesten JSONL-Datei im Projekt

import { promises as fs, openSync, readSync, closeSync, statSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { parseClaudeFile, claudeProjectRoots } from './usage-scan/providers/claude.js';
import { parseCodexFile, codexSessionRoots } from './usage-scan/providers/codex.js';
import { cachedParse } from './usage-scan/cache.js';
import { byProviderFromRows } from './usage-scan/aggregate.js';

const PROJECTS_ROOT = join(homedir(), '.claude', 'projects');

// Context-Fenster pro Model. Wer neuere Modelle nutzt, trägt sie hier ein
// (Prefix-Match, daher decken die Keys auch Versions-/[1m]-Suffixe ab). Die
// Hub-Installation dieses Users läuft auf den 1M-Varianten von Opus 4.x und
// Sonnet 4.6 — default 200k wäre bei >200k Context-Werten unlogisch. In Sync
// mit den ausgelieferten Modellen halten (vgl. pricing.js).
const MODEL_CONTEXT_LIMITS = {
  'claude-opus-4-8': 1_000_000,
  'claude-opus-4-7': 1_000_000,
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5': 1_000_000,
  'claude-haiku-4-5': 200_000,
};
const DEFAULT_CONTEXT_LIMIT = 200_000;

// Cost is computed once per row via costOf() in lib/usage-scan/pricing.js
// (single pricing source for both days[].cost and byProvider[]).

function modelContextLimit(model) {
  if (!model) return DEFAULT_CONTEXT_LIMIT;
  // Tolerant gegenüber Versions-Suffixen (`claude-opus-4-6-20260101` etc.)
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.startsWith(key)) return limit;
  }
  return DEFAULT_CONTEXT_LIMIT;
}

function mangle(cwd) {
  // Absoluter Pfad erwartet. Slashes durch Bindestriche, führender `-`.
  return cwd.replace(/\//g, '-');
}

function safeStat(path) {
  try { return statSync(path); } catch { return null; }
}

function extractUsage(obj) {
  // Rückgabe: {input, output, ctx, model} oder null.
  //
  // `ctx` = voller Kontext beim Call (input + cache_creation + cache_read)
  //         → was auf der Session-Karte als "aktuell genutzter Context" steht
  // `input` = *neu* gesendete Tokens (input + cache_creation, OHNE cache_read)
  //         → was im Daily-Usage als "Input" zählt; cache_reads doppelt zu
  //           zählen würde das Tages-Total absurd aufblasen
  if (obj?.type !== 'assistant') return null;
  const u = obj?.message?.usage;
  if (!u) return null;
  const inputRaw = (u.input_tokens || 0);
  const cacheCreate = (u.cache_creation_input_tokens || 0);
  const cacheRead = (u.cache_read_input_tokens || 0);
  const output = (u.output_tokens || 0);
  return {
    input: inputRaw + cacheCreate,
    output,
    ctx: inputRaw + cacheCreate + cacheRead,
    model: obj.message?.model || null,
  };
}

function localDateStr(date) {
  // YYYY-MM-DD in lokaler Zeitzone (nicht UTC — der User denkt in Local).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── getCurrentContext ──────────────────────────────────────────────
// Liest die letzten ~32KB der neuesten JSONL-Datei im Projekt-Dir und
// findet rückwärts das letzte assistant-Event mit usage. Das ist der
// aktuelle Context-Stand nach dem letzten Turn.
export function getCurrentContext(cwd) {
  const empty = { tokens: null, model: null, limit: null, pct: null };
  if (!cwd || typeof cwd !== 'string' || !cwd.startsWith('/')) {
    return empty;
  }
  const dir = join(PROJECTS_ROOT, mangle(cwd));
  let entries;
  try { entries = readdirSync(dir); } catch { return empty; }

  // Neueste .jsonl nach mtime
  let newest = null;
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const p = join(dir, name);
    const st = safeStat(p);
    if (!st || !st.isFile()) continue;
    if (!newest || st.mtimeMs > newest.mtimeMs) newest = { path: p, mtimeMs: st.mtimeMs, size: st.size };
  }
  if (!newest) return empty;

  // Letzte ~32KB lesen (genug für mehrere Events am Ende)
  const TAIL = 32 * 1024;
  const start = Math.max(0, newest.size - TAIL);
  const len = newest.size - start;
  const buf = Buffer.alloc(len);
  let fd;
  try {
    fd = openSync(newest.path, 'r');
    readSync(fd, buf, 0, len, start);
  } catch {
    if (fd) try { closeSync(fd); } catch {}
    return empty;
  }
  closeSync(fd);

  // Zeilen vom Ende rückwärts durchgehen
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  // Wenn wir mittendrin in einer Zeile gestartet sind (Tail-Offset > 0), ist
  // lines[0] unvollständig und der UTF-8-Decode am Offset kann sie verstümmeln —
  // explizit verwerfen statt auf den Parse-Fail zu hoffen.
  if (start > 0 && lines.length > 1) lines.shift();
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const u = extractUsage(obj);
    if (u) {
      const limit = modelContextLimit(u.model);
      const pct = Math.min(100, Math.round((u.ctx / limit) * 100));
      return { tokens: u.ctx, model: u.model, limit, pct };
    }
  }
  return empty;
}

// ── getDailyUsageV2 ────────────────────────────────────────────────
// Erweiterte Tages-Aggregate mit Projekt-, Heatmap-, Cache-, Tool-
// und Error-Daten.

export async function getDailyUsageV2({ days = 30 } = {}) {
  // ── Claude rows: walk every projects-root, keep filesByProject + parsedByFile
  // exactly as before (byProject depends on them), but feed the unified scanner.
  const filesByProject = new Map(); // projectDir NAME → [filePath]
  const parsedByFile = new Map();   // filePath → rows[]
  for (const root of claudeProjectRoots()) {
    let projectDirs;
    try { projectDirs = readdirSync(root); } catch { continue; } // missing root → skip
    for (const dir of projectDirs) {
      const p = join(root, dir);
      const st = safeStat(p);
      if (!st || !st.isDirectory()) continue;
      let inner;
      try { inner = readdirSync(p); } catch { continue; }
      const files = [];
      for (const name of inner) {
        if (name.endsWith('.jsonl')) files.push(join(p, name));
      }
      if (!files.length) continue;
      for (const f of files) parsedByFile.set(f, cachedParse(f, parseClaudeFile));
      // Same project dir name across roots → merge file lists.
      const existing = filesByProject.get(dir);
      if (existing) existing.push(...files);
      else filesByProject.set(dir, files);
    }
  }
  const claudeRows = [...parsedByFile.values()].flat();

  // ── Codex rows: walk session roots recursively for rollout-*.jsonl. Codex is
  // NOT attributed to projects in v1 — collected separately, never into parsedByFile.
  const codexRows = [];
  for (const root of codexSessionRoots()) {
    for (const f of walkRollouts(root)) {
      codexRows.push(...cachedParse(f, parseCodexFile));
    }
  }

  const allEntries = [...claudeRows, ...codexRows];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Tage über einen Mittags-Anker zählen, nicht durch wiederholtes setDate() von
  // Mitternacht: an einem DST-Übergang kann eine 1h-Verschiebung von Mitternacht
  // aus eine Kalender-Datum doppelt treffen / überspringen. 12:00 ± 1h bleibt im Tag.
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1), 12, 0, 0, 0);
  const cutoffStr = localDateStr(cutoff);
  const monthStart = localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));

  // ── Day buckets (legacy + extended) ──
  const byDate = new Map();
  let monthTotal = 0;
  const monthByModel = {};

  // ── Month aggregates (new) ──
  const projectTokens = new Map();   // mangled dir → tokens
  const heatmapMap = new Map();      // "dow:hour" → tokens
  let monthCacheRead = 0, monthCacheTotal = 0;
  let monthToolUse = 0, monthEndTurn = 0, monthStopTotal = 0;
  const toolCounts = new Map();
  const sessionsByDate = new Map();  // date → Set<sessionId>
  const monthSessions = new Set();
  let errorTotal = 0;
  const errorsByDate = new Map();

  for (const e of allEntries) {
    if (e.kind === 'error') {
      if (e.date >= monthStart) {
        errorTotal++;
        errorsByDate.set(e.date, (errorsByDate.get(e.date) || 0) + 1);
      }
      if (e.date >= cutoffStr) {
        let d = byDate.get(e.date);
        if (!d) { d = _emptyDay(e.date); byDate.set(e.date, d); }
        d.errors++;
      }
      continue;
    }

    // kind === 'usage'
    const total = e.input + e.output;

    if (e.date >= monthStart) {
      monthTotal += total;
      const m = e.model || 'unknown';
      monthByModel[m] = (monthByModel[m] || 0) + total;

      // Cache / Stop reason / Tools are Claude-only metrics (codex rows carry no
      // stopReason/tools and a different cache convention) — guard explicitly.
      if (e.provider === 'claude') {
        // Cache
        monthCacheRead += e.cacheRead;
        monthCacheTotal += e.input + e.cacheRead; // input already includes cache_creation

        // Stop reason
        if (e.stopReason) {
          monthStopTotal++;
          if (e.stopReason === 'tool_use') monthToolUse++;
          else if (e.stopReason === 'end_turn') monthEndTurn++;
        }

        // Tools
        for (const t of e.tools) {
          toolCounts.set(t, (toolCounts.get(t) || 0) + 1);
        }
      }

      // Sessions
      if (e.sessionId) {
        monthSessions.add(e.sessionId);
        if (!sessionsByDate.has(e.date)) sessionsByDate.set(e.date, new Set());
        sessionsByDate.get(e.date).add(e.sessionId);
      }

      // Heatmap
      const hk = `${e.dow}:${e.hour}`;
      heatmapMap.set(hk, (heatmapMap.get(hk) || 0) + total);
    }

    if (e.date < cutoffStr) continue;
    let d = byDate.get(e.date);
    if (!d) { d = _emptyDay(e.date); byDate.set(e.date, d); }
    d.input += e.input;
    d.output += e.output;
    const m = e.model || 'unknown';
    d.byModel[m] = (d.byModel[m] || 0) + total;
    d.cost += (e.cost || 0); // row cost via costOf — single pricing source, matches byProvider
    if (e.sessionId) {
      if (!d._sessions) d._sessions = new Set();
      d._sessions.add(e.sessionId);
    }
  }

  // ── byProject: aggregate tokens per project dir (month) ──
  // byProject is Claude-only in v1 (codex rows carry no project/cwd yet)
  for (const [dir, files] of filesByProject) {
    let tokens = 0;
    let cwd = null;
    for (const f of files) {
      const entries = parsedByFile.get(f) || [];
      for (const e of entries) {
        if (!cwd && e.cwd) cwd = e.cwd;                 // echten Pfad aus den Rows ziehen
        if (e.kind === 'usage' && e.date >= monthStart) {
          tokens += e.input + e.output;
        }
      }
    }
    if (tokens > 0) {
      // Bevorzugt den echten cwd; das Unmangling (-Users-jane-my-proj →
      // /Users/jane/my/proj) ist NICHT umkehrbar, sobald ein Pfad-Segment ein `-`
      // enthält (z.B. "my-cool-proj" → ".../my/cool/proj"). Fallback bleibt.
      const path = cwd || dir.replace(/^-/, '/').replace(/-/g, '/');
      const project = path.split('/').pop() || dir;
      projectTokens.set(dir, { project, path, tokens });
    }
  }

  // ── Build result arrays ──
  const daysResult = [];
  for (let i = 0; i < days; i++) {
    // Mittags-Anker (siehe cutoff oben) — DST-sicheres Durchzählen der Kalendertage.
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12, 0, 0, 0);
    const dateStr = localDateStr(dt);
    const d = byDate.get(dateStr) || _emptyDay(dateStr);
    d.sessions = d._sessions ? d._sessions.size : 0;
    delete d._sessions;
    daysResult.push(d);
  }

  const byProject = [...projectTokens.values()].sort((a, b) => b.tokens - a.tokens);

  const heatmap = [];
  for (const [key, tokens] of heatmapMap) {
    const [dow, hour] = key.split(':').map(Number);
    heatmap.push({ dow, hour, tokens });
  }

  const cacheRate = {
    read: monthCacheRead,
    total: monthCacheTotal,
    pct: monthCacheTotal > 0 ? Math.round((monthCacheRead / monthCacheTotal) * 10000) / 100 : 0,
  };

  const workStyle = {
    toolUse: monthToolUse,
    endTurn: monthEndTurn,
    total: monthStopTotal,
  };

  const toolUsage = [...toolCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dailySessions = {};
  for (const [date, set] of sessionsByDate) {
    dailySessions[date] = set.size;
  }

  const errByDate = [...errorsByDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── byProvider: month-window rollup across ALL providers (claude + codex) ──
  const monthRows = allEntries.filter(e => e.kind === 'usage' && e.date >= monthStart);
  const byProvider = byProviderFromRows(monthRows);

  return {
    days: daysResult,
    monthTotal,
    monthByModel,
    byProject,
    heatmap,
    cacheRate,
    workStyle,
    toolUsage,
    dailySessions,
    monthSessions: monthSessions.size,
    errors: { total: errorTotal, byDate: errByDate },
    byProvider,
  };
}

// Recursively collect rollout-*.jsonl under a codex sessions root. Sessions are
// nested YYYY/MM/DD/rollout-*.jsonl; archived_sessions may be flat. Missing root → [].
function walkRollouts(root) {
  const out = [];
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    const p = join(root, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkRollouts(p));
    } else if (ent.isFile() && ent.name.startsWith('rollout-') && ent.name.endsWith('.jsonl')) {
      out.push(p);
    }
  }
  return out;
}

function _emptyDay(date) {
  return { date, input: 0, output: 0, byModel: {}, cost: 0, sessions: 0, errors: 0 };
}

