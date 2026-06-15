import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveSessionFile, readSessionFile, SessionFileError } from './session-files.js';

function freshCwd() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'penates-sf-')));
}

test('resolveSessionFile: relative path resolves under cwd', () => {
  const cwd = freshCwd();
  writeFileSync(join(cwd, 'note.md'), '# hi');
  const abs = resolveSessionFile(cwd, 'note.md', { tmpRoots: [] });
  assert.equal(abs, join(cwd, 'note.md'));
});

test('resolveSessionFile: absolute path inside a temp root is allowed', () => {
  const tmp = freshCwd();                       // a dir under os.tmpdir()
  writeFileSync(join(tmp, 'dump.png'), 'x');
  const otherCwd = freshCwd();
  // default tmpRoots include os.tmpdir() realpath → allowed even though != cwd
  const abs = resolveSessionFile(otherCwd, join(tmp, 'dump.png'));
  assert.equal(abs, join(tmp, 'dump.png'));
});

test('resolveSessionFile: /etc/passwd → EOUTSIDE', () => {
  const cwd = freshCwd();
  assert.throws(
    () => resolveSessionFile(cwd, '/etc/passwd', { tmpRoots: [] }),
    (e) => e instanceof SessionFileError && e.code === 'EOUTSIDE',
  );
});

test('resolveSessionFile: <cwd>/../escape → EOUTSIDE (cwd-only scope)', () => {
  const cwd = freshCwd();
  assert.throws(
    () => resolveSessionFile(cwd, '../escape.png', { tmpRoots: [] }),
    (e) => e instanceof SessionFileError && e.code === 'EOUTSIDE',
  );
});

test('resolveSessionFile: symlink pointing outside scope → EOUTSIDE', () => {
  const cwd = freshCwd();
  const outside = freshCwd();
  writeFileSync(join(outside, 'secret.txt'), 'top secret');
  symlinkSync(join(outside, 'secret.txt'), join(cwd, 'link.txt'));
  assert.throws(
    () => resolveSessionFile(cwd, 'link.txt', { tmpRoots: [] }),
    (e) => e instanceof SessionFileError && e.code === 'EOUTSIDE',
  );
});

test('readSessionFile: missing file → ENOENT', async () => {
  const cwd = freshCwd();
  await assert.rejects(
    () => readSessionFile(cwd, 'nope.md', { tmpRoots: [] }),
    (e) => e instanceof SessionFileError && e.code === 'ENOENT',
  );
});

test('readSessionFile: classifies png as image, md as text+lang, pdf as pdf', async () => {
  const cwd = freshCwd();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  writeFileSync(join(cwd, 'a.png'), png);
  writeFileSync(join(cwd, 'b.md'), '# title\ntext');
  writeFileSync(join(cwd, 'c.pdf'), '%PDF-1.4\n...');
  const img = await readSessionFile(cwd, 'a.png', { tmpRoots: [] });
  assert.equal(img.kind, 'image');
  assert.equal(img.mime, 'image/png');
  const txt = await readSessionFile(cwd, 'b.md', { tmpRoots: [] });
  assert.equal(txt.kind, 'text');
  assert.equal(txt.detectedLang, 'markdown');
  const pdf = await readSessionFile(cwd, 'c.pdf', { tmpRoots: [] });
  assert.equal(pdf.kind, 'pdf');
  assert.equal(pdf.mime, 'application/pdf');
});

test('readSessionFile: oversize text → TOOLARGE', async () => {
  const cwd = freshCwd();
  writeFileSync(join(cwd, 'big.txt'), 'x'.repeat(2.5 * 1024 * 1024));
  await assert.rejects(
    () => readSessionFile(cwd, 'big.txt', { tmpRoots: [] }),
    (e) => e instanceof SessionFileError && e.code === 'TOOLARGE',
  );
});

test('readSessionFile: ~ expands to homedir override', async () => {
  const home = freshCwd();
  writeFileSync(join(home, 'h.md'), '# home');
  const cwd = freshCwd();
  const txt = await readSessionFile(cwd, '~/h.md', { tmpRoots: [home], homedir: home });
  assert.equal(txt.kind, 'text');
});
