import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { parseStatusV2, getDiff } from './git-diff.js';

// NUL-getrennte porcelain=v2 -z Records als ein String.
function rec(...parts) { return parts.join('\0') + '\0'; }

test('parseStatusV2 liest branch/ahead/behind + kategorisiert Dateien', () => {
  const raw = rec(
    '# branch.head main',
    '# branch.ab +2 -1',
    '1 M. N... 100644 100644 100644 aaa bbb staged-only.txt',
    '1 .M N... 100644 100644 100644 ccc ddd unstaged-only.txt',
    '1 MM N... 100644 100644 100644 eee fff both.txt',
    '? untracked.txt',
  );
  const r = parseStatusV2(raw);
  assert.equal(r.branch, 'main');
  assert.equal(r.ahead, 2);
  assert.equal(r.behind, 1);
  const staged = r.files.filter(f => f.category === 'staged').map(f => f.path).sort();
  const unstaged = r.files.filter(f => f.category === 'unstaged').map(f => f.path).sort();
  const untracked = r.files.filter(f => f.category === 'untracked').map(f => f.path);
  assert.deepEqual(staged, ['both.txt', 'staged-only.txt']);
  assert.deepEqual(unstaged, ['both.txt', 'unstaged-only.txt']);
  assert.deepEqual(untracked, ['untracked.txt']);
});

test('parseStatusV2 erkennt Rename mit oldPath', () => {
  const raw = rec(
    '# branch.head main',
    '# branch.ab +0 -0',
    '2 R. N... 100644 100644 100644 aaa bbb R100 new-name.txt',
    'old-name.txt',
  );
  const r = parseStatusV2(raw);
  const renamed = r.files.find(f => f.path === 'new-name.txt');
  assert.equal(renamed.status, 'R');
  assert.equal(renamed.oldPath, 'old-name.txt');
  assert.equal(renamed.category, 'staged');
});

test('parseStatusV2 ohne branch.head → null', () => {
  assert.equal(parseStatusV2(''), null);
});

// Temp-Git-Repo-Helper: deterministisch, ohne globale git-Config.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gitdiff-'));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  git('init', '-q', '-b', 'main');
  return { dir, git, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('getDiff kategorisiert unstaged + staged + untracked', () => {
  const { dir, git, cleanup } = makeRepo();
  try {
    writeFileSync(join(dir, 'tracked.txt'), 'line1\nline2\n');
    git('add', 'tracked.txt'); git('commit', '-q', '-m', 'init');
    writeFileSync(join(dir, 'tracked.txt'), 'line1\nCHANGED\n');   // unstaged mod
    writeFileSync(join(dir, 'staged.txt'), 'new\n');
    git('add', 'staged.txt');                                      // staged add
    writeFileSync(join(dir, 'fresh.txt'), 'hello\n');              // untracked

    const r = getDiff(dir);
    assert.equal(r.isRepo, true);
    assert.equal(r.branch, 'main');
    const cats = (c) => r.files.filter(f => f.category === c).map(f => f.path);
    assert.deepEqual(cats('unstaged'), ['tracked.txt']);
    assert.deepEqual(cats('staged'), ['staged.txt']);
    assert.deepEqual(cats('untracked'), ['fresh.txt']);
    const mod = r.files.find(f => f.path === 'tracked.txt');
    assert.ok(mod.diff.includes('CHANGED'));
    assert.equal(mod.additions, 1);
    assert.equal(mod.deletions, 1);
    const fresh = r.files.find(f => f.path === 'fresh.txt');
    assert.ok(fresh.diff.includes('hello'));   // all-added über --no-index
  } finally { cleanup(); }
});

test('getDiff splittet mehrere unstaged-Dateien in getrennte Chunks', () => {
  const { dir, git, cleanup } = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    git('add', '.'); git('commit', '-q', '-m', 'init');
    writeFileSync(join(dir, 'a.txt'), 'a-changed\n');
    writeFileSync(join(dir, 'b.txt'), 'b-changed\n');

    const r = getDiff(dir);
    const a = r.files.find(f => f.path === 'a.txt');
    const b = r.files.find(f => f.path === 'b.txt');
    assert.ok(a.diff.includes('a-changed') && !a.diff.includes('b-changed'));
    assert.ok(b.diff.includes('b-changed') && !b.diff.includes('a-changed'));
  } finally { cleanup(); }
});

test('getDiff markiert binary und oversize', () => {
  const { dir, git, cleanup } = makeRepo();
  try {
    writeFileSync(join(dir, 'big.txt'), 'x\n');
    git('add', 'big.txt'); git('commit', '-q', '-m', 'init');
    writeFileSync(join(dir, 'big.txt'), 'y\n'.repeat(1000));
    writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 2, 0, 255, 0, 3]));  // untracked binary

    const r = getDiff(dir, { maxFileBytes: 50 });
    const big = r.files.find(f => f.path === 'big.txt');
    assert.equal(big.oversize, true);
    assert.equal(big.diff, null);
    const bin = r.files.find(f => f.path === 'bin.dat');
    assert.equal(bin.binary, true);
    assert.equal(bin.diff, null);
  } finally { cleanup(); }
});

test('getDiff: Nicht-Repo-cwd → {isRepo:false}', () => {
  const dir = mkdtempSync(join(tmpdir(), 'norepo-'));
  try {
    const r = getDiff(dir);
    assert.equal(r.isRepo, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getDiff zählt Zeilen bei Rename mit Inhaltsänderung', () => {
  const { dir, git, cleanup } = makeRepo();
  try {
    writeFileSync(join(dir, 'old.txt'), 'a\nb\n');
    git('add', '.'); git('commit', '-q', '-m', 'init');
    git('mv', 'old.txt', 'new.txt');
    writeFileSync(join(dir, 'new.txt'), 'a\nb\nc\n');   // +1 line
    git('add', 'new.txt');
    const r = getDiff(dir);
    const ren = r.files.find(f => f.status === 'R' && f.path === 'new.txt');
    assert.ok(ren, 'rename entry present');
    assert.equal(ren.oldPath, 'old.txt');
    assert.ok(ren.additions >= 1, `expected additions, got ${ren.additions}`);
  } finally { cleanup(); }
});
