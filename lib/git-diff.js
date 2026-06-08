// lib/git-diff.js — Git-Diff-Datenschicht (Express-frei, unit-testbar).
// Alle git-Aufrufe via execFileSync mit Argv-Array — kein Shell-Interp.
import { execFileSync } from 'child_process';

// Parst `git status --porcelain=v2 --branch -z` (NUL-getrennt).
// Liefert { branch, ahead, behind, files:[{category,path,oldPath?,status}] }
// oder null wenn keine gültige branch.head-Zeile.
export function parseStatusV2(raw) {
  const records = raw.split('\0');
  let branch = null, ahead = null, behind = null;
  const files = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    if (r.startsWith('# branch.head ')) {
      branch = r.slice('# branch.head '.length);
    } else if (r.startsWith('# branch.ab ')) {
      const m = r.match(/\+(\d+)\s+-(\d+)/);
      if (m) { ahead = parseInt(m[1], 10); behind = parseInt(m[2], 10); }
    } else if (r.startsWith('# ')) {
      // andere Header (branch.oid, branch.upstream) ignorieren
    } else if (r.startsWith('? ')) {
      files.push({ category: 'untracked', path: r.slice(2), status: '?' });
    } else if (r.startsWith('1 ') || r.startsWith('2 ')) {
      const isRename = r.startsWith('2 ');
      const parts = r.split(' ');
      const xy = parts[1];                       // z.B. "M.", ".M", "MM", "R."
      const X = xy[0], Y = xy[1];
      // Pfad ist alles ab dem 9. (type 1) bzw. 10. (type 2, hat extra <Xscore>) Feld.
      // type 1: 0=marker 1=xy 2=sub 3=mH 4=mI 5=mW 6=hH 7=hI 8=path
      // type 2: 0=marker 1=xy 2=sub 3=mH 4=mI 5=mW 6=hH 7=hI 8=Xscore 9=path
      const pathFieldStart = isRename ? 9 : 8;
      const path = parts.slice(pathFieldStart).join(' ');
      let oldPath;
      if (isRename) { oldPath = records[++i]; }   // origPath ist nächster NUL-Record
      const status = isRename ? 'R' : (X !== '.' ? X : Y);
      if (X !== '.') files.push({ category: 'staged', path, oldPath, status });
      if (Y !== '.') files.push({ category: 'unstaged', path, oldPath, status });
    }
  }
  if (!branch) return null;
  return { branch, ahead, behind, files };
}

// Leichter Status-Map-Helper für die Tree-Marker (NICHT der volle Diff).
// Liefert { <path>: 'staged'|'modified'|'untracked' } repo-weit, oder null
// wenn kein Repo / git fehlt. staged hat Vorrang vor unstaged auf gleichem Pfad.
export function gitStatusMap(cwd) {
  if (!cwd) return null;
  let raw;
  try {
    raw = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch', '-z'], {
      encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { return null; } // kein Repo / git fehlt
  const s = parseStatusV2(raw);
  if (!s) return null;
  const map = {};
  for (const f of s.files) {
    const status = f.category === 'untracked' ? 'untracked'
                 : f.category === 'staged' ? 'staged'
                 : 'modified'; // unstaged → modified
    // staged gewinnt, falls dieselbe Datei staged+unstaged ist.
    if (map[f.path] === 'staged') continue;
    map[f.path] = status;
  }
  return map;
}

export function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// Splittet einen multi-file Unified-Diff in Map<path, chunkText>.
// Grenzen sind Zeilen die mit "diff --git " beginnen. Pfad aus der
// "+++ b/<path>"-Zeile (robuster als das a/ b/ Quoting im Header);
// bei Delete (+++ /dev/null) den "--- a/<path>"-Pfad nehmen.
export function splitUnifiedDiff(text) {
  const map = new Map();
  if (!text) return map;
  const blocks = text.split(/\n(?=diff --git )/);
  for (const block of blocks) {
    if (!block.startsWith('diff --git ')) continue;
    const plus = block.match(/^\+\+\+ b\/(.*)$/m);
    const minus = block.match(/^--- a\/(.*)$/m);
    const path = (plus && plus[1] !== '/dev/null') ? plus[1] : (minus ? minus[1] : null);
    if (path) map.set(path, block.endsWith('\n') ? block : block + '\n');
  }
  return map;
}

// Parst `git diff --numstat -z` (NUL-getrennt) → Map<newpath, {additions, deletions, binary}>.
// Format pro Eintrag: "<add>\t<del>\t<path>\0" (non-rename) oder "<add>\t<del>\t\0<newpath>\0<oldpath>\0" (rename).
// Schlüssel ist immer der neue Pfad, damit `f.path` aus parseStatusV2 trifft.
export function parseNumstat(text) {
  const map = new Map();
  if (!text) return map;
  const fields = text.split('\0');
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (!field) { i++; continue; }
    const m = field.match(/^(\d+|-)\t(\d+|-)\t(.*)$/);
    if (!m) { i++; continue; }
    const binary = m[1] === '-' || m[2] === '-';
    const additions = binary ? 0 : parseInt(m[1], 10);
    const deletions = binary ? 0 : parseInt(m[2], 10);
    if (m[3] !== '') {
      // Normal entry: path is inline in this field.
      map.set(m[3], { additions, deletions, binary });
      i++;
    } else {
      // Rename entry: path part is empty.
      // git diff --numstat -z emits: "<add>\t<del>\t\0<oldpath>\0<newpath>\0"
      // So next field is oldpath, field after is newpath.
      const oldpath = fields[i + 1] || '';
      const newpath = fields[i + 2] || '';
      if (newpath) map.set(newpath, { additions, deletions, binary });
      i += 3;
    }
  }
  return map;
}

export function getDiff(cwd, { maxFileBytes = 200_000, maxUntracked = 100 } = {}) {
  if (!cwd) return { isRepo: false };
  try {
    const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']).trim();
    if (inside !== 'true') return { isRepo: false };
  } catch {
    return { isRepo: false };
  }

  const status = parseStatusV2(git(cwd, ['status', '--porcelain=v2', '--branch', '-z']));
  if (!status) return { isRepo: true, branch: null, ahead: null, behind: null, files: [] };

  // Gebündelte Aufrufe — NICHT pro Datei.
  const unstagedDiffs = splitUnifiedDiff(git(cwd, ['diff']));
  const stagedDiffs = splitUnifiedDiff(git(cwd, ['diff', '--cached']));
  const unstagedNum = parseNumstat(git(cwd, ['diff', '--numstat', '-z']));
  const stagedNum = parseNumstat(git(cwd, ['diff', '--cached', '--numstat', '-z']));

  let untrackedSeen = 0;
  const files = status.files.map((f) => {
    const out = { ...f, additions: 0, deletions: 0, binary: false, oversize: false, diff: null };
    if (f.category === 'untracked') {
      if (untrackedSeen++ >= maxUntracked) return out;
      let text = '';
      try {
        text = git(cwd, ['diff', '--no-index', '--', '/dev/null', f.path]);
      } catch (err) {
        // --no-index liefert exit 1 bei Unterschied → Diff steht in stdout.
        text = (err && err.stdout) ? String(err.stdout) : '';
      }
      if (!text || /^Binary files /m.test(text) || /\0/.test(text)) {
        out.binary = true; return out;
      }
      const single = splitUnifiedDiff(text);
      const chunk = single.get(f.path) || text;
      out.additions = (chunk.match(/^\+/gm) || []).length - (chunk.match(/^\+\+\+ /gm) || []).length;
      if (chunk.length > maxFileBytes) { out.oversize = true; }
      else { out.diff = chunk; }
      return out;
    }
    const num = (f.category === 'staged' ? stagedNum : unstagedNum).get(f.path);
    if (num) { out.additions = num.additions; out.deletions = num.deletions; out.binary = num.binary; }
    if (out.binary) return out;
    const chunk = (f.category === 'staged' ? stagedDiffs : unstagedDiffs).get(f.path);
    if (!chunk) return out;
    if (chunk.length > maxFileBytes) { out.oversize = true; }
    else { out.diff = chunk; }
    return out;
  });

  return { isRepo: true, branch: status.branch, ahead: status.ahead, behind: status.behind, files };
}
