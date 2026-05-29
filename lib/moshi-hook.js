// Read-only-Wrapper um die moshi-hook-CLI (getmoshi.app). Liefert account-
// weite Usage-Snapshots und recency-rankte Arbeitsverzeichnisse. Jede
// Funktion ist fehlertolerant: fehlt die CLI / Exit≠0 / kaputtes JSON → null.
// Kein Daemon, kein pair/install — nur Datenabfrage.

import { execFileSync } from 'child_process';

const TIMEOUT_MS = 3000;
const USAGE_TTL_MS = 30_000;
const DIRS_TTL_MS = 10_000;

let _runner = null; // Test-Injection
export function _setRunner(fn) { _runner = fn; }

function run(args) {
  if (_runner) return _runner(args);
  return execFileSync('moshi-hook', args, { encoding: 'utf8', timeout: TIMEOUT_MS });
}

const cache = { usage: { ts: 0, val: null }, dirs: { ts: 0, val: null } };

function parseJSON(s) { try { return JSON.parse(s); } catch { return null; } }

export function getUsage({ now = Date.now() } = {}) {
  if (cache.usage.val && now - cache.usage.ts < USAGE_TTL_MS) return cache.usage.val;
  let out;
  try { out = run(['usage']); } catch { return null; }
  const parsed = parseJSON(out);
  if (!Array.isArray(parsed)) return null;
  const val = parsed.map(a => ({
    accountId: a.accountId ?? null,
    accountLabel: a.accountLabel ?? null,
    agent: a.agent ?? null,
    hostName: a.hostName ?? null,
    capturedAt: a.capturedAt ?? null,
    // resetsAt auf unix-Sekunden normalisieren: moshi liefert ISO-8601-String,
    // das Frontend (formatResetCountdown) erwartet unix seconds.
    windows: Array.isArray(a.windows) ? a.windows.map(w => ({
      label: w.label ?? null,
      usedPercentage: typeof w.usedPercentage === 'number' ? w.usedPercentage : null,
      resetsAt: w.resetsAt && !Number.isNaN(Date.parse(w.resetsAt)) ? Math.floor(Date.parse(w.resetsAt) / 1000) : null,
    })) : [],
  }));
  cache.usage = { ts: now, val };
  return val;
}

export function getRecentDirs({ limit = 8, now = Date.now() } = {}) {
  if (cache.dirs.val && now - cache.dirs.ts < DIRS_TTL_MS) return cache.dirs.val;
  let out;
  try { out = run(['cwd-list', '--json', '--limit', String(limit)]); } catch { return null; }
  const parsed = parseJSON(out);
  if (!Array.isArray(parsed)) return null;
  const val = parsed.map(d => ({
    cwd: d.cwd ?? null,
    sources: Array.isArray(d.sources) ? d.sources : [],
    lastUsed: typeof d.lastUsed === 'number' ? d.lastUsed : null,
  })).filter(d => d.cwd);
  cache.dirs = { ts: now, val };
  return val;
}

export function _resetCache() {
  cache.usage = { ts: 0, val: null };
  cache.dirs = { ts: 0, val: null };
  _runner = null;
}
