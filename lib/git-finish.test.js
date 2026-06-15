import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preflightFinish, finishCard } from './git-finish.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function g(repo, ...args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); }

// Repo mit bare-origin als Push-Ziel + Feature-Branch + CHANGELOG (## In Development).
function makeRepoWithOrigin() {
  const origin = mkdtempSync(join(tmpdir(), 'pen-orig-'));
  execFileSync('git', ['init', '--bare', '-b', 'main', origin]);
  const dir = mkdtempSync(join(tmpdir(), 'pen-gf-'));
  g(dir, 'init', '-b', 'main');
  g(dir, 'config', 'user.email', 't@t'); g(dir, 'config', 'user.name', 'T');
  writeFileSync(join(dir, 'CHANGELOG.md'), '## In Development: v1\n\n- [ ] existing\n');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  g(dir, 'add', '-A'); g(dir, 'commit', '-m', 'init');
  g(dir, 'remote', 'add', 'origin', origin);
  g(dir, 'push', '-u', 'origin', 'main');
  g(dir, 'checkout', '-b', 'idea/x');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  g(dir, 'add', '-A'); g(dir, 'commit', '-m', 'feature work');
  g(dir, 'checkout', 'main');
  return { dir, origin };
}
const cleanup = (...d) => d.forEach(x => rmSync(x, { recursive: true, force: true }));

// Changelog-Writer wie ihn die Route baut: schreibt im übergebenen workdir.
function changelogWriter(title) {
  return (workdir) => {
    const p = join(workdir, 'CHANGELOG.md');
    const c = readFileSync(p, 'utf8');
    writeFileSync(p, c.replace('## In Development: v1\n', `## In Development: v1\n\n- [x] ${title}\n`));
    return 'CHANGELOG.md';
  };
}

test('preflightFinish ok on a clean repo with origin + base + branch', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try { assert.deepEqual(preflightFinish(dir, 'idea/x', 'main'), { ok: true }); }
  finally { cleanup(dir, origin); }
});

test('preflightFinish flags dirty-tree', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try {
    writeFileSync(join(dir, 'a.txt'), 'dirty\n');
    assert.deepEqual(preflightFinish(dir, 'idea/x', 'main'), { ok: false, reason: 'dirty-tree' });
  } finally { cleanup(dir, origin); }
});

test('preflightFinish flags no-branch', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try { assert.deepEqual(preflightFinish(dir, 'idea/nope', 'main'), { ok: false, reason: 'no-branch' }); }
  finally { cleanup(dir, origin); }
});

test('preflightFinish flags conflict', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try {
    writeFileSync(join(dir, 'a.txt'), 'one\nBASE\n');
    g(dir, 'add', '-A'); g(dir, 'commit', '-m', 'base diverge');
    assert.deepEqual(preflightFinish(dir, 'idea/x', 'main'), { ok: false, reason: 'conflict' });
  } finally { cleanup(dir, origin); }
});

test('finishCard merges + writes changelog + pushes (in-place, on base)', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try {
    finishCard(dir, 'idea/x', 'main', 'Feature X', changelogWriter('Feature X'));
    assert.match(readFileSync(join(dir, 'a.txt'), 'utf8'), /two/);
    assert.match(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), /- \[x\] Feature X/);
    const log = g(dir, 'log', '--oneline', 'main');
    assert.match(log, /Merge idea\/x: Feature X/);
    assert.match(log, /docs\(changelog\)/);
    assert.match(g(dir, 'log', '--oneline', 'origin/main'), /Merge idea\/x/);
  } finally { cleanup(dir, origin); }
});

test('finishCard is idempotent — re-run after merge is a no-op merge (only push)', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try {
    finishCard(dir, 'idea/x', 'main', 'Feature X', changelogWriter('Feature X'));
    const before = g(dir, 'rev-parse', 'main');
    finishCard(dir, 'idea/x', 'main', 'Feature X', changelogWriter('Feature X'));
    assert.equal(g(dir, 'rev-parse', 'main'), before);
  } finally { cleanup(dir, origin); }
});

test('finishCard merges via detached worktree when checkout is on another branch', () => {
  const { dir, origin } = makeRepoWithOrigin();
  try {
    g(dir, 'checkout', 'idea/x');
    const headBefore = g(dir, 'rev-parse', 'HEAD').trim();
    finishCard(dir, 'idea/x', 'main', 'Feature X', changelogWriter('Feature X'));
    assert.equal(g(dir, 'rev-parse', 'HEAD').trim(), headBefore);
    assert.equal(g(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'idea/x');
    assert.match(g(dir, 'log', '--oneline', 'main'), /Merge idea\/x: Feature X/);
    assert.match(g(dir, 'log', '--oneline', 'origin/main'), /Merge idea\/x/);
    assert.doesNotMatch(g(dir, 'worktree', 'list'), /pen-finish-wt/);
  } finally { cleanup(dir, origin); }
});
