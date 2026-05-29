// StatusLine-Daten pro Session: In-Memory-State + historisches Limit-Log.
// Wird von POST /api/hooks/statusline gefüttert.

import { readFile, stat, writeFile } from 'fs/promises';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HUB_DIR = join(homedir(), '.claude-code-hub');
const FRESH_MS = 120_000;
const LOG_THROTTLE_MS = 5 * 60_000;
const MAX_LOG_SIZE = 5 * 1024 * 1024;

// Log-Pfad ist überschreibbar (Tests). Default: ~/.claude-code-hub/usage-limits.jsonl
let LIMITS_LOG = join(HUB_DIR, 'usage-limits.jsonl');
export function _setLogPath(p) { LIMITS_LOG = p; }

const states = new Map();          // per-Session Cost/Lines (StatusLine)
let latestAccounts = [];           // account-level Limits (moshi-hook usage)
let lastSnapshotLogAt = 0;

export function recordStatusline(sessionName, data) {
  const now = Date.now();
  states.set(sessionName, {
    pct5h: data.pct5h ?? null,
    pct7d: data.pct7d ?? null,
    resets5h: data.resets5h ?? null,
    resets7d: data.resets7d ?? null,
    costUsd: data.costUsd ?? null,
    durationMs: data.durationMs ?? null,
    apiDurationMs: data.apiDurationMs ?? null,
    linesAdded: data.linesAdded ?? null,
    linesRemoved: data.linesRemoved ?? null,
    model: data.model ?? null,
    contextPct: data.contextPct ?? null,
    contextSize: data.contextSize ?? null,
    updatedAt: now,
  });
}

// Account-weite Limit-Snapshots aus moshi-hook usage. Hält die aktuellen
// Accounts in-memory (für die Live-Anzeige) und appended throttled (5 min)
// einen History-Punkt pro Account ins jsonl.
export function recordUsageSnapshot(accounts, { now = Date.now() } = {}) {
  if (!Array.isArray(accounts)) return;
  latestAccounts = accounts;
  if (now - lastSnapshotLogAt < LOG_THROTTLE_MS) return;
  lastSnapshotLogAt = now;
  const t = new Date(Date.now()).toISOString(); // wall-clock timestamp for log
  let lines = '';
  for (const a of accounts) {
    const w5 = (a.windows || []).find(w => w.label === '5h');
    const w7 = (a.windows || []).find(w => w.label === '7d');
    lines += JSON.stringify({
      t,
      acct: a.accountId || 'default',
      label: a.accountLabel ?? null,
      agent: a.agent ?? null,
      '5h': w5 ? w5.usedPercentage : null,
      '7d': w7 ? w7.usedPercentage : null,
      r5h: w5 ? w5.resetsAt : null,
      r7d: w7 ? w7.resetsAt : null,
    }) + '\n';
  }
  if (lines) {
    try { appendFileSync(LIMITS_LOG, lines); } catch { /* ignore write errors */ }
    rotateMaybe().catch(() => {});
  }
}

export function getSessionStatusline(sessionName) {
  const s = states.get(sessionName);
  if (!s) return null;
  if (Date.now() - s.updatedAt >= FRESH_MS) return null;
  return s;
}

export function getAllSessionCosts() {
  let totalUsd = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let totalDurationMs = 0;
  let totalApiDurationMs = 0;
  const sessions = [];
  for (const [name, s] of states) {
    if (Date.now() - s.updatedAt >= FRESH_MS) continue;
    totalUsd += s.costUsd || 0;
    totalLinesAdded += s.linesAdded || 0;
    totalLinesRemoved += s.linesRemoved || 0;
    totalDurationMs += s.durationMs || 0;
    totalApiDurationMs += s.apiDurationMs || 0;
    sessions.push({ name, costUsd: s.costUsd, linesAdded: s.linesAdded, linesRemoved: s.linesRemoved });
  }
  return { totalUsd, totalLinesAdded, totalLinesRemoved, totalDurationMs, totalApiDurationMs, sessions };
}

export async function getLimitHistory({ days = 7, now = Date.now() } = {}) {
  let raw;
  try { raw = await readFile(LIMITS_LOG, 'utf8'); }
  catch { return { accounts: latestAccounts, points: [], peaks5h: 0, peaks7d: 0 }; }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  const points = [];
  let peaks5h = 0;
  let peaks7d = 0;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.t < cutoffStr) continue;
    if (!obj.acct) obj.acct = 'default'; // Rückwärtskompatibilität
    points.push(obj);
    if ((obj['5h'] ?? 0) >= 90) peaks5h++;
    if ((obj['7d'] ?? 0) >= 90) peaks7d++;
  }

  return { accounts: latestAccounts, points, peaks5h, peaks7d };
}

export function rename(oldName, newName) {
  if (oldName === newName) return;
  const s = states.get(oldName);
  if (!s) return;
  states.delete(oldName);
  states.set(newName, s);
}

export function forget(sessionName) {
  states.delete(sessionName);
}

async function rotateMaybe() {
  let st;
  try { st = await stat(LIMITS_LOG); } catch { return; }
  if (st.size < MAX_LOG_SIZE) return;
  let raw;
  try { raw = await readFile(LIMITS_LOG, 'utf8'); } catch { return; }
  const lines = raw.split('\n').filter(Boolean);
  const half = Math.floor(lines.length / 2);
  await writeFile(LIMITS_LOG, lines.slice(half).join('\n') + '\n');
}

export function _reset() {
  states.clear();
  latestAccounts = [];
  lastSnapshotLogAt = 0;
}
