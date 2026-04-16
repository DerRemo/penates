// Parser für Claude-Code-Usage aus ~/.claude/projects/**.jsonl
//
// Jede JSONL-Zeile ist ein Event; nur `type: "assistant"`-Events haben
// `message.usage` mit Token-Zahlen. Context-Füllung eines Turns ≈
// input_tokens + cache_creation_input_tokens + cache_read_input_tokens
// (der nächste API-Call bekommt genau diese Summe als Input zurück).
//
// Cwd-Mangling: /Users/jane/Projects/foo → -Users-jane-Projects-foo
//
// Zwei Public APIs:
//   getCurrentContext(cwd) → {tokens, model} aus dem letzten assistant-Event
//                             der neuesten JSONL-Datei im Projekt
//   getDailyUsage({days})  → Tages-Aggregate über ALLE Projekte der letzten
//                             N Tage + Monatstotals

import { promises as fs, openSync, readSync, closeSync, statSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECTS_ROOT = join(homedir(), '.claude', 'projects');
const CACHE_MAX = 200;

// Context-Fenster pro Model. Wer neuere Modelle nutzt, trägt sie hier ein.
// Die Hub-Installation dieses Users läuft auf der 1M-Variante von Opus 4.6
// und Sonnet 4.6 — default 200k wäre bei >200k Context-Werten unlogisch.
const MODEL_CONTEXT_LIMITS = {
  'claude-opus-4-6': 1_000_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-6': 1_000_000,
  'claude-sonnet-4-5': 1_000_000,
  'claude-haiku-4-5': 200_000,
};
const DEFAULT_CONTEXT_LIMIT = 200_000;

function modelContextLimit(model) {
  if (!model) return DEFAULT_CONTEXT_LIMIT;
  // Tolerant gegenüber Versions-Suffixen (`claude-opus-4-6-20260101` etc.)
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.startsWith(key)) return limit;
  }
  return DEFAULT_CONTEXT_LIMIT;
}

// mtime-basierter Cache für vollständige Datei-Parses (getDailyUsage)
// Key: absolute Datei-Pfad, Value: {mtimeMs, entries: [{date, model, input, output}]}
const fileCache = new Map();

function cacheGet(key) {
  const v = fileCache.get(key);
  if (!v) return null;
  // Move to end (LRU)
  fileCache.delete(key);
  fileCache.set(key, v);
  return v;
}
function cacheSet(key, value) {
  if (fileCache.has(key)) fileCache.delete(key);
  fileCache.set(key, value);
  while (fileCache.size > CACHE_MAX) {
    const first = fileCache.keys().next().value;
    fileCache.delete(first);
  }
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
  // Wenn wir mittendrin in einer Zeile gestartet sind, ist lines[0] unvollständig.
  // Das ist okay — wir verwerfen sie beim Parse-Fail.
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

// ── getDailyUsage ──────────────────────────────────────────────────
// Scannt alle JSONL-Dateien, aggregiert pro Tag. Jede Datei ist
// mtime-gecacht als vorparste Liste von {date, model, input, output, ctx}.

async function parseFileFull(path) {
  const st = safeStat(path);
  if (!st) return [];
  const cached = cacheGet(path);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.entries;

  let raw;
  try { raw = await fs.readFile(path, 'utf8'); } catch { return []; }
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const u = extractUsage(obj);
    if (!u) continue;
    const ts = obj.timestamp;
    if (!ts) continue;
    const d = new Date(ts);
    if (isNaN(d)) continue;
    const date = localDateStr(d);
    entries.push({ date, model: u.model, input: u.input, output: u.output });
  }
  cacheSet(path, { mtimeMs: st.mtimeMs, entries });
  return entries;
}

export async function getDailyUsage({ days = 30 } = {}) {
  let projectDirs;
  try { projectDirs = readdirSync(PROJECTS_ROOT); } catch {
    return { days: [], monthTotal: 0, monthByModel: {} };
  }

  const files = [];
  for (const dir of projectDirs) {
    const p = join(PROJECTS_ROOT, dir);
    const st = safeStat(p);
    if (!st || !st.isDirectory()) continue;
    let inner;
    try { inner = readdirSync(p); } catch { continue; }
    for (const name of inner) {
      if (name.endsWith('.jsonl')) files.push(join(p, name));
    }
  }

  // Alle Dateien parsen (parallel)
  const allEntries = (await Promise.all(files.map(parseFileFull))).flat();

  // Bucketing nach lokaler Datum (nur letzte `days` Tage)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = localDateStr(cutoff);

  const monthStart = localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));

  const byDate = new Map();
  let monthTotal = 0;
  const monthByModel = {};

  for (const e of allEntries) {
    const total = e.input + e.output;
    if (e.date >= monthStart) {
      monthTotal += total;
      const m = e.model || 'unknown';
      monthByModel[m] = (monthByModel[m] || 0) + total;
    }
    if (e.date < cutoffStr) continue;
    let d = byDate.get(e.date);
    if (!d) { d = { date: e.date, input: 0, output: 0, byModel: {} }; byDate.set(e.date, d); }
    d.input += e.input;
    d.output += e.output;
    const m = e.model || 'unknown';
    d.byModel[m] = (d.byModel[m] || 0) + total;
  }

  // Neueste zuerst, Lücken für Tage ohne Daten
  const result = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    result.push(byDate.get(dateStr) || { date: dateStr, input: 0, output: 0, byModel: {} });
  }

  return { days: result, monthTotal, monthByModel };
}
