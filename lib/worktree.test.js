import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worktreePathFor, canIsolate, ensureWorktree, removeWorktree, deleteBranch } from './worktree.js';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, basename, join } from 'path';

function g(repo, ...args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); }
const existsSyncJoin = (a, b) => existsSync(join(a, b));

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cch-wt-'));
  g(dir, 'init', '-b', 'main');
  g(dir, 'config', 'user.email', 't@t'); g(dir, 'config', 'user.name', 'T');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  g(dir, 'add', '-A'); g(dir, 'commit', '-m', 'init');
  return dir;
}
// räumt Repo + den zugehörigen .cch-worktrees-Geschwisterbaum
const cleanup = (dir) => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(dirname(dir), '.cch-worktrees', basename(dir)), { recursive: true, force: true });
};

test('worktreePathFor: Geschwister-Dir, genested nach Projekt-Ordnername', () => {
  const p = worktreePathFor('/home/u/proj', 'idea-x');
  assert.equal(p, '/home/u/.cch-worktrees/proj/idea-x');
});

test('canIsolate: true für Repo mit Base', () => {
  const dir = makeRepo();
  try { assert.equal(canIsolate(dir, 'main'), true); } finally { cleanup(dir); }
});

test('canIsolate: false für fehlende Base', () => {
  const dir = makeRepo();
  try { assert.equal(canIsolate(dir, 'nope'), false); } finally { cleanup(dir); }
});

test('canIsolate: false für Nicht-Repo', () => {
  const d = mkdtempSync(join(tmpdir(), 'cch-norepo-'));
  try { assert.equal(canIsolate(d, 'main'), false); } finally { rmSync(d, { recursive: true, force: true }); }
});

test('ensureWorktree: legt Worktree+Branch frisch an (created:true)', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-x');
  try {
    const r = ensureWorktree(dir, 'idea/x', 'main', wt);
    assert.equal(r.created, true);
    assert.ok(existsSyncJoin(wt, '.git'));
    assert.equal(g(wt, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'idea/x');
  } finally { cleanup(dir); }
});

test('ensureWorktree: zweiter Aufruf ist no-op (created:false), wirft nicht', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-x');
  try {
    ensureWorktree(dir, 'idea/x', 'main', wt);
    const r = ensureWorktree(dir, 'idea/x', 'main', wt);
    assert.equal(r.created, false);
  } finally { cleanup(dir); }
});

test('ensureWorktree: hängt an bestehenden Branch an (kein -b)', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-y');
  try {
    g(dir, 'branch', 'idea/y');               // Branch existiert, kein Worktree
    const r = ensureWorktree(dir, 'idea/y', 'main', wt);
    assert.equal(r.created, true);
    assert.equal(g(wt, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'idea/y');
  } finally { cleanup(dir); }
});

test('ensureWorktree: heilt ein stale Verzeichnis ohne .git (kein Wurf)', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-z');
  try {
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, 'leftover.txt'), 'stale\n'); // Dir existiert, aber kein .git
    const r = ensureWorktree(dir, 'idea/z', 'main', wt);
    assert.equal(r.created, true);
    assert.equal(g(wt, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'idea/z');
  } finally { cleanup(dir); }
});

test('removeWorktree: Worktree weg, Branch + Commits BLEIBEN', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-x');
  try {
    ensureWorktree(dir, 'idea/x', 'main', wt);
    writeFileSync(join(wt, 'a.txt'), 'one\ntwo\n');
    g(wt, 'add', '-A'); g(wt, 'commit', '-m', 'work');
    removeWorktree(dir, wt);
    assert.equal(existsSync(wt), false);
    // Branch existiert noch:
    let exists = true;
    try { g(dir, 'rev-parse', '--verify', '--quiet', 'refs/heads/idea/x'); } catch { exists = false; }
    assert.equal(exists, true);
  } finally { cleanup(dir); }
});

test('removeWorktree: idempotent (schon weg → kein Wurf)', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-x');
  try {
    ensureWorktree(dir, 'idea/x', 'main', wt);
    removeWorktree(dir, wt);
    removeWorktree(dir, wt); // zweimal
    assert.equal(existsSync(wt), false);
  } finally { cleanup(dir); }
});

test('deleteBranch: löscht gemergten Branch', () => {
  const dir = makeRepo();
  const wt = worktreePathFor(dir, 'idea-x');
  try {
    ensureWorktree(dir, 'idea/x', 'main', wt);
    writeFileSync(join(wt, 'a.txt'), 'one\ntwo\n');
    g(wt, 'add', '-A'); g(wt, 'commit', '-m', 'work');
    removeWorktree(dir, wt);
    g(dir, 'merge', '--no-ff', 'idea/x', '-m', 'merge');
    deleteBranch(dir, 'idea/x');
    let exists = true;
    try { g(dir, 'rev-parse', '--verify', '--quiet', 'refs/heads/idea/x'); } catch { exists = false; }
    assert.equal(exists, false);
  } finally { cleanup(dir); }
});
