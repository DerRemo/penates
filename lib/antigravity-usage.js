// Antigravity (Google "agy" CLI) usage — limited-state only.
//
// Antigravity läuft auf der Gemini-Free-Tier-Quota. Anders als Claude/Codex
// gibt es KEINE saubere Prozent-Quelle, die ein Always-on-Dashboard nutzen
// kann: die Cloud-Code-API (`fetchAvailableModels` mit `quotaInfo`) liefert
// für Free-Tier 403, und ein Prozentwert kommt nur vom lokalen Antigravity-
// Language-Server, der bloß läuft solange die IDE offen ist. Das einzige
// robuste, persistente Signal ist der 429-Eintrag, den der CLI in seine Logs
// schreibt, wenn die Quota erschöpft ist:
//
//   E0601 07:35:46.846 ... RESOURCE_EXHAUSTED (code 429): Individual quota
//   reached. ... Resets in 129h55m4s.
//
// Daraus leiten wir ab: Quota erreicht (ja/nein) + absoluter Reset-Zeitpunkt.
// Kein 429 mit Reset in der Zukunft → null (Antigravity erscheint dann nicht).

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_LOG_DIR = join(homedir(), '.gemini', 'antigravity-cli', 'log');
const TTL_MS = 30_000;
const SCAN_FILES = 5; // neueste N Logdateien durchsuchen

// glog-Prefix:  E0601 07:35:46  → level, MM, DD, HH, MM, SS (Jahr fehlt → aus Dateiname)
const GLOG_RE = /^[EWIF](\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const FILE_DATE_RE = /^cli-(\d{4})(\d{2})(\d{2})_\d{6}\.log$/;
const RESET_RE = /Resets in ((?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?)/;

let cache = { ts: 0, val: undefined };

function parseDurationMs(s) {
  const m = String(s).match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return null;
  const ms = ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000;
  return ms > 0 ? ms : null;
}

function computeResetMs(logDir, file, line) {
  const dur = parseDurationMs((line.match(RESET_RE) || [])[1]);
  if (!dur) return 0;
  const g = line.match(GLOG_RE);
  const fd = file.match(FILE_DATE_RE);
  let eventMs;
  if (g && fd) {
    // Jahr aus Dateiname, Monat/Tag/Zeit aus der glog-Zeile (lokale Zeit).
    eventMs = new Date(+fd[1], +g[1] - 1, +g[2], +g[3], +g[4], +g[5]).getTime();
  } else {
    // Fallback: mtime der Datei (selten — nur wenn der glog-Prefix fehlt).
    try { eventMs = statSync(join(logDir, file)).mtimeMs; } catch { return 0; }
  }
  return eventMs + dur;
}

function compute(logDir, now) {
  let files;
  try { files = readdirSync(logDir).filter(f => FILE_DATE_RE.test(f)); }
  catch { return null; } // kein Antigravity installiert → kein Eintrag
  if (!files.length) return null;

  files.sort().reverse(); // jüngste zuerst (Zeitstempel im Namen)
  let bestReset = 0;
  for (const file of files.slice(0, SCAN_FILES)) {
    let content;
    try { content = readFileSync(join(logDir, file), 'utf8'); } catch { continue; }
    if (!content.includes('RESOURCE_EXHAUSTED')) continue;
    for (const line of content.split('\n')) {
      if (!line.includes('Resets in')) continue;
      const reset = computeResetMs(logDir, file, line);
      if (reset > bestReset) bestReset = reset;
    }
  }

  if (bestReset <= now) return null; // nicht (mehr) limitiert
  return {
    accountId: 'antigravity',
    accountLabel: null,
    agent: 'antigravity',
    limited: true,
    windows: [{ limited: true, resetsAt: Math.floor(bestReset / 1000) }],
  };
}

// Liefert ein account-förmiges Objekt (kompatibel zu /api/usage/limits
// accounts[]) wenn Antigravity aktuell quota-limitiert ist, sonst null.
export function getAntigravityUsage({ logDir = DEFAULT_LOG_DIR, now = Date.now() } = {}) {
  if (cache.val !== undefined && now - cache.ts < TTL_MS) return cache.val;
  const val = compute(logDir, now);
  cache = { ts: now, val };
  return val;
}

export function _resetCache() { cache = { ts: 0, val: undefined }; }
