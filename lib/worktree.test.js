import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worktreePathFor, canIsolate } from './worktree.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, basename, join } from 'path';

function g(repo, ...args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); }

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
