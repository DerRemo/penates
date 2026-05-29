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

// Stub — wird in Task 2 vollständig implementiert.
export function getDiff() {}
