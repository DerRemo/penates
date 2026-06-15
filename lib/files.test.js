import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync, realpathSync } from 'fs';
import { Readable } from 'stream';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeTempProject } from './files.test-helpers.js';
import { resolveSafe, listDir, FileError, readFile, streamFileToResponse, createEmptyFile, writeStream, resolveTrashBin } from './files.js';

test('resolveSafe rejects parent traversal', () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  assert.throws(
    () => resolveSafe(root, '../../../etc/passwd'),
    (err) => err instanceof FileError && err.code === 'forbidden'
  );
  cleanup();
});

test('resolveSafe rejects symlink that escapes', () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  symlinkSync('/etc', join(root, 'out'));
  assert.throws(
    () => resolveSafe(root, 'out/passwd'),
    (err) => err instanceof FileError && err.code === 'forbidden'
  );
  cleanup();
});

test('resolveSafe rejects missing child below symlink that escapes', () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  const outside = realpathSync(tmpdir());
  symlinkSync(outside, join(root, 'out'));
  assert.throws(
    () => resolveSafe(root, 'out/new-file.txt'),
    (err) => err instanceof FileError && err.code === 'forbidden'
  );
  cleanup();
});

test('resolveSafe normalizes relative paths inside root', () => {
  const { root, cleanup } = makeTempProject({ 'a/b.txt': 'hi' });
  const abs = resolveSafe(root, './a/../a/b.txt');
  assert.equal(abs, join(realpathSync(root), 'a/b.txt'));
  cleanup();
});

test('mkdir returns a clean root-relative path on a realpath-differing root', async () => {
  // mkdtemp roots liegen unter /var/folders (realpath /private/var/folders) —
  // genau der Fall, der den ../../private/... Müllpfad provoziert hat.
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  try {
    const r = await mkdir(root, '', 'newdir');
    assert.equal(r.path, 'newdir');
  } finally { cleanup(); }
});

test('writeStream returns a clean root-relative path', async () => {
  const { root, cleanup } = makeTempProject({});
  try {
    const r = await writeStream(root, '', 'up.txt', Readable.from(['hello']), { onConflict: 'overwrite' });
    assert.equal(r.path, 'up.txt');
    assert.equal(r.name, 'up.txt');
  } finally { cleanup(); }
});

test('readFile treats an empty (0-byte) file as text, not unsupported binary', async () => {
  const { root, cleanup } = makeTempProject({ 'empty.txt': '' });
  try {
    const r = await readFile(root, 'empty.txt');
    assert.equal(r.kind, 'text');
    assert.equal(r.size, 0);
  } finally { cleanup(); }
});

test('deleteToTrash with no paths is a no-op (does not invoke trash)', async () => {
  const { root, cleanup } = makeTempProject({});
  try {
    assert.deepEqual(await deleteToTrash(root, []), { count: 0 });
  } finally { cleanup(); }
});

test('listDir returns sorted entries, dirs first, hides ignores', () => {
  const { root, cleanup } = makeTempProject({
    'src/index.js': 'x',
    'src/lib/a.js': 'x',
    'README.md': '#',
    'node_modules/x/p.json': '{}',
    '.git/HEAD': 'ref',
  });
  const result = listDir(root, '');
  const names = result.entries.map(e => e.name);
  assert.deepEqual(names, ['src', 'README.md']);
  cleanup();
});

test('listDir with all=true includes dotfiles', () => {
  const { root, cleanup } = makeTempProject({
    '.env': 'KEY=1',
    'README.md': '#',
  });
  const result = listDir(root, '', { all: true });
  assert.deepEqual(result.entries.map(e => e.name).sort(), ['.env', 'README.md']);
  cleanup();
});

test('readFile returns text content with detected mime', async () => {
  const { root, cleanup } = makeTempProject({ 'a.js': 'console.log(1);' });
  const result = await readFile(root, 'a.js');
  assert.equal(result.kind, 'text');
  assert.equal(result.buffer.toString('utf8'), 'console.log(1);');
  assert.equal(result.detectedLang, 'javascript');
  cleanup();
});

test('readFile rejects text over 2 MB', async () => {
  const { root, cleanup } = makeTempProject({ 'big.txt': 'x'.repeat(2_200_000) });
  await assert.rejects(
    readFile(root, 'big.txt'),
    (err) => err.code === 'oversize' && err.meta.size > 2_000_000
  );
  cleanup();
});

test('readFile accepts 9 MB image', async () => {
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(9_000_000),
  ]);
  const { root, cleanup } = makeTempProject({});
  const { writeFileSync } = await import('fs');
  writeFileSync(join(root, 'big.png'), png);
  const result = await readFile(root, 'big.png');
  assert.equal(result.kind, 'image');
  assert.equal(result.mime, 'image/png');
  cleanup();
});

test('readFile rejects binary non-image non-pdf', async () => {
  const { root, cleanup } = makeTempProject({});
  const { writeFileSync } = await import('fs');
  writeFileSync(join(root, 'app.bin'), Buffer.from([0, 1, 2, 3, 4, 5, 0, 0, 0]));
  await assert.rejects(
    readFile(root, 'app.bin'),
    (err) => err.code === 'unsupported'
  );
  cleanup();
});

import { mkdir, renameOrMove, copy, deleteToTrash, nextFreeName, resolveMoveTarget } from './files.js';
import { existsSync, readFileSync, mkdirSync as _mkdirSync } from 'fs';

test('nextFreeName returns foo-1.txt then foo-2.txt as collisions grow', () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'a' });
  assert.equal(nextFreeName(root, 'foo.txt'), 'foo-1.txt');
  writeFileSync(join(root, 'foo-1.txt'), 'b');
  assert.equal(nextFreeName(root, 'foo.txt'), 'foo-2.txt');
  cleanup();
});

test('nextFreeName handles a name without extension', () => {
  const { root, cleanup } = makeTempProject({ 'README': 'a' });
  assert.equal(nextFreeName(root, 'README'), 'README-1');
  cleanup();
});

test('resolveMoveTarget appends basename when "to" is an existing folder', () => {
  const { root, cleanup } = makeTempProject({ 'foo.js': 'x' });
  _mkdirSync(join(root, 'src'));
  const { from, target } = resolveMoveTarget(root, 'foo.js', 'src');
  assert.equal(from, join(realpathSync(root), 'foo.js'));
  assert.equal(target, join(realpathSync(root), 'src', 'foo.js'));
  cleanup();
});

test('resolveMoveTarget treats a non-existing "to" as the exact target path', () => {
  const { root, cleanup } = makeTempProject({ 'foo.js': 'x' });
  _mkdirSync(join(root, 'src'));
  const { target } = resolveMoveTarget(root, 'foo.js', 'src/bar.js');
  assert.equal(target, join(realpathSync(root), 'src', 'bar.js'));
  cleanup();
});

test('resolveMoveTarget throws not-found when source is missing', () => {
  const { root, cleanup } = makeTempProject({});
  assert.throws(
    () => resolveMoveTarget(root, 'ghost.js', ''),
    (e) => e instanceof FileError && e.code === 'not-found'
  );
  cleanup();
});

test('resolveMoveTarget throws not-found when destination parent is missing', () => {
  const { root, cleanup } = makeTempProject({ 'foo.js': 'x' });
  assert.throws(
    () => resolveMoveTarget(root, 'foo.js', 'no-such-dir/bar.js'),
    (e) => e instanceof FileError && e.code === 'not-found'
  );
  cleanup();
});

test('resolveMoveTarget throws same-path when target equals source', () => {
  const { root, cleanup } = makeTempProject({ 'foo.js': 'x' });
  assert.throws(
    () => resolveMoveTarget(root, 'foo.js', 'foo.js'),
    (e) => e instanceof FileError && e.code === 'same-path'
  );
  cleanup();
});

test('resolveMoveTarget throws into-self when moving a folder into its own subtree', () => {
  const { root, cleanup } = makeTempProject({ 'src/a.js': 'x' });
  _mkdirSync(join(root, 'src', 'sub'));
  assert.throws(
    () => resolveMoveTarget(root, 'src', 'src/sub'),
    (e) => e instanceof FileError && e.code === 'into-self'
  );
  cleanup();
});

test('resolveMoveTarget keeps the path-escape guard', () => {
  const { root, cleanup } = makeTempProject({ 'foo.js': 'x' });
  assert.throws(
    () => resolveMoveTarget(root, 'foo.js', '../escaped.js'),
    (e) => e instanceof FileError && e.code === 'forbidden'
  );
  cleanup();
});

test('renameOrMove: "to" = existing folder drops the file into it', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'hi' });
  _mkdirSync(join(root, 'src'));
  const r = await renameOrMove(root, 'foo.txt', 'src');
  assert.equal(r.path, join('src', 'foo.txt'));
  assert.equal(existsSync(join(root, 'src', 'foo.txt')), true);
  assert.equal(existsSync(join(root, 'foo.txt')), false);
  cleanup();
});

test('renameOrMove: explicit full path relocates the file', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'hi' });
  _mkdirSync(join(root, 'src'));
  await renameOrMove(root, 'foo.txt', 'src/bar.txt');
  assert.equal(existsSync(join(root, 'src', 'bar.txt')), true);
  cleanup();
});

test('renameOrMove: conflict without onConflict throws exists + suggested', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'a', 'src/foo.txt': 'b' });
  await assert.rejects(
    () => renameOrMove(root, 'foo.txt', 'src'),
    (e) => e instanceof FileError && e.code === 'exists' && e.meta.suggested === 'foo-1.txt'
  );
  assert.equal(existsSync(join(root, 'foo.txt')), true);
  cleanup();
});

test('renameOrMove: onConflict=rename writes foo-1.txt and keeps the existing target', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'NEW', 'src/foo.txt': 'OLD' });
  const r = await renameOrMove(root, 'foo.txt', 'src', { onConflict: 'rename' });
  assert.equal(r.path, join('src', 'foo-1.txt'));
  assert.equal(readFileSync(join(root, 'src', 'foo-1.txt'), 'utf8'), 'NEW');
  assert.equal(readFileSync(join(root, 'src', 'foo.txt'), 'utf8'), 'OLD');
  cleanup();
});

test('renameOrMove: onConflict=overwrite replaces a file', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'NEW', 'src/foo.txt': 'OLD' });
  await renameOrMove(root, 'foo.txt', 'src', { onConflict: 'overwrite' });
  assert.equal(readFileSync(join(root, 'src', 'foo.txt'), 'utf8'), 'NEW');
  assert.equal(existsSync(join(root, 'foo.txt')), false);
  cleanup();
});

test('renameOrMove: onConflict=overwrite refuses to clobber a directory', async () => {
  const { root, cleanup } = makeTempProject({ 'foo': 'file-content' });
  _mkdirSync(join(root, 'src'));
  _mkdirSync(join(root, 'src', 'foo'));
  await assert.rejects(
    () => renameOrMove(root, 'foo', 'src', { onConflict: 'overwrite' }),
    (e) => e instanceof FileError && e.code === 'exists'
  );
  cleanup();
});

test('copy: "to" = existing folder copies into it, source remains', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'hi' });
  _mkdirSync(join(root, 'src'));
  const r = await copy(root, 'foo.txt', 'src');
  assert.equal(r.path, join('src', 'foo.txt'));
  assert.equal(readFileSync(join(root, 'src', 'foo.txt'), 'utf8'), 'hi');
  assert.equal(existsSync(join(root, 'foo.txt')), true);
  cleanup();
});

test('copy: conflict without onConflict throws exists + suggested', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'a', 'src/foo.txt': 'b' });
  await assert.rejects(
    () => copy(root, 'foo.txt', 'src'),
    (e) => e instanceof FileError && e.code === 'exists' && e.meta.suggested === 'foo-1.txt'
  );
  cleanup();
});

test('copy: onConflict=rename makes a foo-1.txt duplicate', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'NEW', 'src/foo.txt': 'OLD' });
  const r = await copy(root, 'foo.txt', 'src', { onConflict: 'rename' });
  assert.equal(r.path, join('src', 'foo-1.txt'));
  assert.equal(readFileSync(join(root, 'src', 'foo-1.txt'), 'utf8'), 'NEW');
  assert.equal(readFileSync(join(root, 'src', 'foo.txt'), 'utf8'), 'OLD');
  cleanup();
});

test('copy: onConflict=overwrite replaces a file', async () => {
  const { root, cleanup } = makeTempProject({ 'foo.txt': 'NEW', 'src/foo.txt': 'OLD' });
  await copy(root, 'foo.txt', 'src', { onConflict: 'overwrite' });
  assert.equal(readFileSync(join(root, 'src', 'foo.txt'), 'utf8'), 'NEW');
  cleanup();
});

test('mkdir creates nested dirs', async () => {
  const { root, cleanup } = makeTempProject({});
  await mkdir(root, '', 'newfolder');
  assert.equal(existsSync(join(root, 'newfolder')), true);
  cleanup();
});

test('renameOrMove inside project', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  await renameOrMove(root, 'a.txt', 'b.txt');
  assert.equal(existsSync(join(root, 'b.txt')), true);
  assert.equal(existsSync(join(root, 'a.txt')), false);
  cleanup();
});

test('renameOrMove rejects target below escaping symlink', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  const outside = realpathSync(tmpdir());
  symlinkSync(outside, join(root, 'out'));
  await assert.rejects(
    renameOrMove(root, 'a.txt', 'out/escaped.txt'),
    (err) => err instanceof FileError && err.code === 'forbidden'
  );
  assert.equal(existsSync(join(root, 'a.txt')), true);
  cleanup();
});

test('copy file preserves content', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hello' });
  await copy(root, 'a.txt', 'b.txt');
  assert.equal(readFileSync(join(root, 'b.txt'), 'utf8'), 'hello');
  assert.equal(existsSync(join(root, 'a.txt')), true);
  cleanup();
});

test('deleteToTrash moves file to trash', async (t) => {
  const { root, cleanup } = makeTempProject({ 'gone.txt': 'bye' });
  try {
    await deleteToTrash(root, ['gone.txt']);
  } catch (e) {
    cleanup();
    if (e instanceof FileError && e.code === 'trash-failed') {
      t.skip(`trash unavailable in this environment: ${e.message}`);
      return;
    }
    throw e;
  }
  assert.equal(existsSync(join(root, 'gone.txt')), false);
  cleanup();
});

import { mkdtempSync, mkdirSync, rmSync } from 'fs';

function createMockRes() {
  const headers = {};
  const chunks = [];
  return {
    setHeader(k, v) { headers[k] = v; },
    getHeader(k) { return headers[k]; },
    on: () => {},
    once: () => {},
    emit: () => {},
    write(chunk) { chunks.push(chunk); return true; },
    end() { this._ended = true; },
    get _body() { return Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))).toString(); },
    _ended: false,
    _headers: headers,
  };
}

test('streamFileToResponse — sets headers and streams body', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cchub-dl-'));
  writeFileSync(join(dir, 'hello.txt'), 'Hello, World!');
  const res = createMockRes();
  const stream = streamFileToResponse(dir, 'hello.txt', res);
  await new Promise(r => stream.on('end', r));
  assert.equal(res.getHeader('Content-Length'), 13);
  assert.equal(res.getHeader('Content-Type'), 'application/octet-stream');
  assert.match(res.getHeader('Content-Disposition'), /attachment;.*filename="hello\.txt"/);
  rmSync(dir, { recursive: true, force: true });
});

test('streamFileToResponse — RFC5987 encodes non-ASCII filenames', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cchub-dl-'));
  writeFileSync(join(dir, 'Grüße.txt'), 'hi');
  const res = createMockRes();
  const rs = streamFileToResponse(dir, 'Grüße.txt', res);
  await new Promise(r => rs.on('end', r));
  const disp = res.getHeader('Content-Disposition');
  assert.match(disp, /filename\*=UTF-8''/);
  assert.match(disp, /Gr%C3%BC%C3%9Fe\.txt/);
  rmSync(dir, { recursive: true, force: true });
});

test('streamFileToResponse — path-guard rejects escape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cchub-dl-'));
  const res = createMockRes();
  assert.throws(() => streamFileToResponse(dir, '../../etc/passwd', res), FileError);
  rmSync(dir, { recursive: true, force: true });
});

test('streamFileToResponse — throws on directory (not a file)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cchub-dl-'));
  mkdirSync(join(dir, 'subdir'));
  const res = createMockRes();
  assert.throws(() => streamFileToResponse(dir, 'subdir', res), err => err.code === 'not-a-file');
  rmSync(dir, { recursive: true, force: true });
});

test('streamFileToResponse — throws FileError on missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cchub-dl-'));
  const res = createMockRes();
  assert.throws(() => streamFileToResponse(dir, 'missing.txt', res), err => err.code === 'not-found');
  rmSync(dir, { recursive: true, force: true });
});

// ── createEmptyFile ──────────────────────────────────────────────
test('createEmptyFile writes a 0-byte file under the project root', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  const r = await createEmptyFile(root, '', 'new.md');
  assert.equal(r.path, 'new.md');
  assert.ok(existsSync(join(root, 'new.md')));
  assert.equal(readFileSync(join(root, 'new.md'), 'utf8'), '');
  cleanup();
});

test('createEmptyFile rejects a name that already exists (409 → exists)', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  await assert.rejects(
    () => createEmptyFile(root, '', 'a.txt'),
    (err) => err instanceof FileError && err.code === 'exists'
  );
  cleanup();
});

test('createEmptyFile rejects path traversal via name', async () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'hi' });
  await assert.rejects(
    () => createEmptyFile(root, '', '../escape.txt'),
    (err) => err instanceof FileError && err.code === 'bad-name'
  );
  cleanup();
});

// ── listDir ignored marking (git check-ignore) ───────────────────
import { execFileSync } from 'child_process';

test('listDir marks gitignored entries with ignored:true', () => {
  const { root, cleanup } = makeTempProject({ 'keep.txt': 'a', 'node_modules/x.js': 'b', '.gitignore': 'node_modules\n' });
  execFileSync('git', ['init', '-q'], { cwd: root });
  // all:true zeigt auch dot/ignore-Einträge, damit node_modules in der Liste ist.
  const { entries } = listDir(root, '', { all: true });
  const nm = entries.find(e => e.name === 'node_modules');
  const keep = entries.find(e => e.name === 'keep.txt');
  assert.equal(nm.ignored, true);
  assert.equal(keep.ignored, false);
  cleanup();
});

test('listDir sets ignored:false everywhere when cwd is not a git repo', () => {
  const { root, cleanup } = makeTempProject({ 'a.txt': 'x', 'b.txt': 'y' });
  const { entries } = listDir(root, '', { all: true });
  assert.ok(entries.every(e => e.ignored === false));
  cleanup();
});

// ── resolveTrashBin ───────────────────────────────────────────────
test('resolveTrashBin prefers a PATH trash, falls back to /usr/bin/trash', () => {
  // PATH lookup hit:
  const found = resolveTrashBin({ lookup: (n) => n === 'trash' ? '/opt/homebrew/bin/trash' : null });
  assert.equal(found, '/opt/homebrew/bin/trash');
  // No PATH hit → fallback:
  const fallback = resolveTrashBin({ lookup: () => null });
  assert.equal(fallback, '/usr/bin/trash');
});
