// lib/git-finish.js — git-WRITE-Mechanik für Phase 5 (Review→Fertig).
// Bewusst getrennt von git-diff.js (read-only). Alle Aufrufe execFileSync('git',
// ['-C', repo, …]) argv — kein Shell-Interp. branch/base/title sind argv-Elemente.
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function tryGit(repo, args) { try { git(repo, args); return true; } catch { return false; } }

// Read-only Preflight. Kein einziger Aufruf mutiert. → {ok:true} | {ok:false, reason}
export function preflightFinish(repo, branch, base) {
  if (git(repo, ['status', '--porcelain']).trim() !== '') return { ok: false, reason: 'dirty-tree' };
  if (!tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`])) return { ok: false, reason: 'no-base' };
  if (!tryGit(repo, ['remote', 'get-url', 'origin'])) return { ok: false, reason: 'no-remote' };
  if (!tryGit(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) return { ok: false, reason: 'no-branch' };
  try {
    execFileSync('git', ['-C', repo, 'merge-tree', '--write-tree', base, branch],
      { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (typeof e.status === 'number' && e.status === 1) return { ok: false, reason: 'conflict' };
  }
  return { ok: true };
}

function stageError(stage, e) {
  const err = new Error(`git ${stage} failed: ${(e && e.stderr) || (e && e.message) || stage}`);
  err.stage = stage;
  return err;
}

// Eigentlicher Finish NACH bestandenem Preflight.
// changelogWrite(workdir) → schreibt das Changelog im workdir + gibt den
// relativen Pfad (zum git add) zurück.
export function finishCard(repo, branch, base, title, changelogWrite) {
  if (tryGit(repo, ['merge-base', '--is-ancestor', branch, base])) {
    try { git(repo, ['push', 'origin', base]); } catch (e) { throw stageError('push', e); }
    return { merged: false, pushed: true };
  }
  const primary = (() => { try { return git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { return ''; } })();
  const mergeMsg = `Merge ${branch}: ${title}`;
  const clMsg = `docs(changelog): ${title}`;

  if (primary === base) {
    try { git(repo, ['merge', '--no-ff', branch, '-m', mergeMsg]); } catch (e) { throw stageError('merge', e); }
    const rel = changelogWrite(repo);
    try { git(repo, ['add', rel]); git(repo, ['commit', '-m', clMsg]); } catch (e) { throw stageError('commit', e); }
    try { git(repo, ['push', 'origin', base]); } catch (e) { throw stageError('push', e); }
    return { merged: true, pushed: true };
  }

  const wt = mkdtempSync(join(tmpdir(), 'cch-finish-wt-'));
  try {
    try { git(repo, ['worktree', 'add', '--detach', wt, base]); } catch (e) { throw stageError('merge', e); }
    try { git(wt, ['merge', '--no-ff', branch, '-m', mergeMsg]); } catch (e) { throw stageError('merge', e); }
    const rel = changelogWrite(wt);
    try { git(wt, ['add', rel]); git(wt, ['commit', '-m', clMsg]); } catch (e) { throw stageError('commit', e); }
    const sha = git(wt, ['rev-parse', 'HEAD']).trim();
    try { git(repo, ['branch', '-f', base, sha]); } catch (e) { throw stageError('commit', e); }
    try { git(repo, ['push', 'origin', base]); } catch (e) { throw stageError('push', e); }
    return { merged: true, pushed: true };
  } finally {
    tryGit(repo, ['worktree', 'remove', '--force', wt]);
    rmSync(wt, { recursive: true, force: true });
  }
}
