// lib/git-history.js — Git-History-Datenschicht (Express-frei, unit-testbar).
// Alle git-Aufrufe via execFileSync mit Argv-Array — kein Shell-Interp.
// Fehlertolerant: kein Repo / git fehlt → leere/null Payloads (nie werfen).
// Teilt git()/splitUnifiedDiff()/parseNumstat() mit lib/git-diff.js (DRY).
import { git, splitUnifiedDiff, parseNumstat } from './git-diff.js';

const US = '\x1f'; // unit separator (Felder)
const RS = '\x1e'; // record separator (Commits)
const SHA_RE = /^[0-9a-f]{4,40}$/;

// Prüft, ob cwd ein Work-Tree ist (git()-Throw → false).
function isRepo(cwd) {
  if (!cwd) return false;
  try { return git(cwd, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'; }
  catch { return false; }
}

// %D-Dekorationen → saubere Ref-Namen (HEAD/HEAD->/tag:-Präfixe + origin/HEAD raus).
function parseRefs(decoration) {
  if (!decoration) return [];
  return decoration.split(', ').map(s => s.trim())
    .map(s => s.replace(/^HEAD -> /, '').replace(/^tag: /, ''))
    .filter(s => s && s !== 'HEAD' && s !== 'origin/HEAD');
}

export function getLog(cwd, { limit = 50, before, skip } = {}) {
  if (!isRepo(cwd)) return { commits: [], hasMore: false };
  const fmt = ['%H', '%h', '%s', '%an', '%aI', '%D'].join(US) + RS;
  const args = ['log', `-n`, String(limit + 1), `--pretty=format:${fmt}`];
  if (Number.isInteger(skip) && skip > 0) args.push(`--skip=${skip}`);
  if (before) args.push(`--before=${before}`);
  let raw;
  try { raw = git(cwd, args); } catch { return { commits: [], hasMore: false }; }
  const records = raw.split(RS)
    .map(r => r.replace(/^\n/, '')) // git setzt ein \n zwischen Records
    .filter(r => r.trim() !== '');
  const hasMore = records.length > limit;
  const commits = records.slice(0, limit).map((rec) => {
    const [sha, shortSha, subject, authorName, isoDate, decoration] = rec.split(US);
    return { sha, shortSha, subject, authorName, isoDate, refs: parseRefs(decoration) };
  });
  return { commits, hasMore };
}

// Stubs — echte Implementierung folgt in Task 3/4. ESM-Named-Import braucht
// auflösbare Exports, sonst SyntaxError beim Modul-Load.
export function getBranches() { return { local: [], remote: [] }; }
export function showCommit() { return null; }
