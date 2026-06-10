// lib/worktree.js — git-Worktree-Isolation für P4-Implement-Agenten.
// Express-frei, hermetisch testbar. Alle git-Aufrufe execFileSync('git',
// ['-C', repo, …]) argv — kein Shell-Interp (repo/branch/base/path sind argv).
import { execFileSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { dirname, basename, join } from 'path';

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function tryGit(repo, args) { try { git(repo, args); return true; } catch { return false; } }

// Deterministischer Worktree-Pfad: Geschwister-Dir am Projekt, genested nach
// Projekt-Ordnername (zwei Projekte im selben Parent kollidieren nicht).
export function worktreePathFor(repo, slug) {
  return join(dirname(repo), '.cch-worktrees', basename(repo), slug);
}

// Gate: ist repo ein Git-Repo mit existierendem base-Branch?
export function canIsolate(repo, base) {
  if (!repo || !base) return false;
  if (!tryGit(repo, ['rev-parse', '--is-inside-work-tree'])) return false;
  return tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`]);
}

// Idempotent: stellt sicher, dass an wtPath ein Worktree auf `branch` existiert.
//   • wtPath schon ein Worktree (.git vorhanden) → reuse, no-op
//   • wtPath existiert ohne .git (stale dir)     → self-heal: Verzeichnis löschen, neu anlegen
//   • Branch existiert                           → git worktree add <wtPath> <branch>
//   • sonst                                      → git worktree add -b <branch> <wtPath> <base>
export function ensureWorktree(repo, branch, base, wtPath) {
  tryGit(repo, ['worktree', 'prune']);
  if (existsSync(join(wtPath, '.git'))) return { path: wtPath, created: false };
  if (existsSync(wtPath)) rmSync(wtPath, { recursive: true, force: true }); // stale dir ohne .git → self-heal
  const branchExists = tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (branchExists) git(repo, ['worktree', 'add', wtPath, branch]);
  else git(repo, ['worktree', 'add', '-b', branch, wtPath, base]);
  return { path: wtPath, created: true };
}

// Entfernt den Worktree (Disk + git-Admin). Branch BLEIBT unangetastet. Idempotent.
export function removeWorktree(repo, wtPath) {
  tryGit(repo, ['worktree', 'remove', '--force', wtPath]);
  if (existsSync(wtPath)) { try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* ignore */ } }
  tryGit(repo, ['worktree', 'prune']);
}

// Löscht den (gemergten) Branch. Nur nach erfolgreichem Merge aufrufen. Fehler geschluckt.
export function deleteBranch(repo, branch) {
  tryGit(repo, ['branch', '-d', branch]);
}
