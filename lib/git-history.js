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

// Parst "[ahead 2]" / "[behind 1]" / "[ahead 1, behind 3]" / "[gone]" / "".
function parseTrack(track) {
  const a = /ahead (\d+)/.exec(track || '');
  const b = /behind (\d+)/.exec(track || '');
  return { ahead: a ? parseInt(a[1], 10) : 0, behind: b ? parseInt(b[1], 10) : 0 };
}

export function getBranches(cwd) {
  if (!isRepo(cwd)) return { local: [], remote: [] };
  let localRaw = '', remoteRaw = '';
  try {
    localRaw = git(cwd, ['for-each-ref',
      '--format=%(refname:short)\t%(HEAD)\t%(upstream:short)\t%(upstream:track)', 'refs/heads']);
    remoteRaw = git(cwd, ['for-each-ref', '--format=%(refname:short)\t%(symref)', 'refs/remotes']);
  } catch { return { local: [], remote: [] }; }
  const local = localRaw.split('\n').filter(Boolean).map((line) => {
    const [name, head, upstream, track] = line.split('\t');
    const { ahead, behind } = parseTrack(track);
    return { name, current: head === '*', upstream: upstream || '', ahead, behind };
  });
  const remote = remoteRaw.split('\n').filter(Boolean).map((line) => {
    const [name, symref] = line.split('\t');
    return { name, symref: symref || '' };
  }).filter(r => !r.symref) // origin/HEAD-Symbolic (bare "origin") rauswerfen
    .map(r => ({ name: r.name }));
  return { local, remote };
}

// Stub — echte Implementierung folgt in Task 4. ESM-Named-Import braucht
// auflösbare Exports, sonst SyntaxError beim Modul-Load.
export function showCommit() { return null; }
