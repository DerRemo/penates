import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getLog, getBranches, showCommit } from './git-history.js';

// Baut ein Temp-Git-Repo: 3 Commits auf main + ein zweiter lokaler Branch.
// Liefert { dir, shas } (shas in Commit-Reihenfolge: [c1(root), c2, c3]).
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'penates-githist-'));
  const g = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 'Tester');
  g('config', 'commit.gpgsign', 'false');
  const commit = (file, content, msg) => {
    writeFileSync(join(dir, file), content);
    g('add', '.');
    g('commit', '-qm', msg);
    return g('rev-parse', 'HEAD').trim();
  };
  const c1 = commit('a.txt', 'one\n', 'feat: add a');           // root commit
  const c2 = commit('b.txt', 'two\n', 'fix: add b');
  const c3 = commit('a.txt', 'one\nmore\n', 'docs: edit a');
  g('branch', 'feature/x');
  return { dir, shas: [c1, c2, c3], cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('getLog returns commits newest-first with parsed fields', () => {
  const repo = makeRepo();
  try {
    const { commits, hasMore } = getLog(repo.dir, { limit: 50 });
    assert.equal(commits.length, 3);
    assert.equal(hasMore, false);
    const top = commits[0];
    assert.equal(top.sha, repo.shas[2]);
    assert.equal(top.shortSha, repo.shas[2].slice(0, 7));
    assert.equal(top.subject, 'docs: edit a');
    assert.equal(top.authorName, 'Tester');
    assert.match(top.isoDate, /^\d{4}-\d{2}-\d{2}T/);
    // HEAD-Branch ist als Ref am Top-Commit gelistet (master oder main je nach git default).
    assert.ok(top.refs.some(r => /^(main|master)$/.test(r)), `refs=${JSON.stringify(top.refs)}`);
  } finally { repo.cleanup(); }
});

test('getLog paginates with limit+1 → hasMore and skip', () => {
  const repo = makeRepo();
  try {
    const page1 = getLog(repo.dir, { limit: 2 });
    assert.equal(page1.commits.length, 2);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.commits[0].sha, repo.shas[2]);
    const page2 = getLog(repo.dir, { limit: 2, skip: 2 });
    assert.equal(page2.commits.length, 1);
    assert.equal(page2.hasMore, false);
    assert.equal(page2.commits[0].sha, repo.shas[0]);
  } finally { repo.cleanup(); }
});

test('getLog on a non-repo returns empty + hasMore:false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'penates-nonrepo-'));
  try {
    assert.deepEqual(getLog(dir, { limit: 50 }), { commits: [], hasMore: false });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('getBranches lists local branches with current marker', () => {
  const repo = makeRepo();
  try {
    const { local, remote } = getBranches(repo.dir);
    const names = local.map(b => b.name).sort();
    assert.deepEqual(names, ['feature/x', ...['main', 'master'].filter(n => names.includes(n))].sort());
    const head = local.find(b => b.current);
    assert.ok(head, 'expected one current branch');
    assert.ok(/^(main|master)$/.test(head.name));
    assert.equal(head.upstream, '');      // kein Remote im Fixture
    assert.equal(head.ahead, 0);
    assert.equal(head.behind, 0);
    assert.deepEqual(remote, []);          // kein Remote → leer (origin/HEAD gefiltert)
  } finally { repo.cleanup(); }
});

test('getBranches on a non-repo returns empty lists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'penates-nonrepo2-'));
  try {
    assert.deepEqual(getBranches(dir), { local: [], remote: [] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('showCommit returns header + per-file diffs for a normal commit', () => {
  const repo = makeRepo();
  try {
    const c = showCommit(repo.dir, repo.shas[2]); // 'docs: edit a' (touches a.txt)
    assert.equal(c.sha, repo.shas[2]);
    assert.equal(c.shortSha, repo.shas[2].slice(0, 7));
    assert.equal(c.subject, 'docs: edit a');
    assert.equal(c.authorName, 'Tester');
    assert.equal(c.files.length, 1);
    const f = c.files[0];
    assert.equal(f.path, 'a.txt');
    assert.equal(f.status, 'M');
    assert.equal(f.additions, 1);
    assert.equal(f.deletions, 0);
    assert.equal(f.binary, false);
    assert.equal(f.oversize, false);
    assert.match(f.diff, /^diff --git a\/a\.txt b\/a\.txt/m);
  } finally { repo.cleanup(); }
});

test('showCommit handles the root commit (no parent)', () => {
  const repo = makeRepo();
  try {
    const c = showCommit(repo.dir, repo.shas[0]); // root: adds a.txt
    assert.equal(c.subject, 'feat: add a');
    assert.equal(c.files.length, 1);
    assert.equal(c.files[0].path, 'a.txt');
    assert.equal(c.files[0].status, 'A');
    assert.match(c.files[0].diff, /new file mode/);
  } finally { repo.cleanup(); }
});

test('showCommit rejects an invalid sha', () => {
  const repo = makeRepo();
  try {
    assert.equal(showCommit(repo.dir, 'zzzz'), null);
    assert.equal(showCommit(repo.dir, '../etc'), null);
  } finally { repo.cleanup(); }
});

test('showCommit oversize: a big file diff is flagged, not inlined', () => {
  const repo = makeRepo();
  try {
    const g = (...a) => execFileSync('git', ['-C', repo.dir, ...a], { encoding: 'utf8' });
    writeFileSync(join(repo.dir, 'big.txt'), 'x\n'.repeat(50));
    g('add', '.'); g('commit', '-qm', 'chore: big');
    const sha = g('rev-parse', 'HEAD').trim();
    const c = showCommit(repo.dir, sha, { maxFileBytes: 10 });
    const f = c.files.find(x => x.path === 'big.txt');
    assert.equal(f.oversize, true);
    assert.equal(f.diff, null);
  } finally { repo.cleanup(); }
});
