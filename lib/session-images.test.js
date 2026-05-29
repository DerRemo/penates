import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, utimesSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveSessionImage, cleanupOldImages } from './session-images.js';
import { FileError } from './files.js';

// Minimal valid 1x1 PNG (same bytes the E2E fixture uses).
const PNG = Buffer.from([
  0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, 0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, 0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
  0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41, 0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00,
  0x00,0x00,0x02,0x00,0x01,0xe2,0x21,0xbc, 0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,
  0x44,0xae,0x42,0x60,0x82,
]);

function tmpCwd() { return mkdtempSync(join(tmpdir(), 'sessimg-')); }

test('saveSessionImage writes a PNG into .cch-images/ with timestamp filename', () => {
  const cwd = tmpCwd();
  try {
    const { rel, abs } = saveSessionImage(cwd, PNG);
    assert.ok(rel.startsWith('.cch-images/'), `rel was ${rel}`);
    const fname = rel.slice('.cch-images/'.length);
    assert.match(fname, /^\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.png$/, `filename was ${fname}`);
    assert.ok(existsSync(abs), 'abs file exists');
    assert.deepEqual(readFileSync(abs), PNG, 'bytes round-trip');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('saveSessionImage ensures .gitignore has .cch-images/ exactly once, idempotent', () => {
  const cwd = tmpCwd();
  try {
    saveSessionImage(cwd, PNG);
    const gi = join(cwd, '.gitignore');
    assert.ok(existsSync(gi), '.gitignore created');
    const after1 = readFileSync(gi, 'utf8');
    assert.ok(/^\.cch-images\/$/m.test(after1), 'line present');
    saveSessionImage(cwd, PNG);  // second save
    const after2 = readFileSync(gi, 'utf8');
    const count = (after2.match(/^\.cch-images\/$/gm) || []).length;
    assert.equal(count, 1, 'entry added only once');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('saveSessionImage preserves an existing unrelated .gitignore', () => {
  const cwd = tmpCwd();
  try {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n*.log\n');
    saveSessionImage(cwd, PNG);
    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8');
    assert.ok(gi.includes('node_modules/'), 'existing kept');
    assert.ok(/^\.cch-images\/$/m.test(gi), 'new line appended');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('saveSessionImage path-guard blocks an escaping ext', () => {
  const cwd = tmpCwd();
  try {
    assert.throws(
      () => saveSessionImage(cwd, PNG, { ext: 'png/../../../etc/evil' }),
      (e) => e instanceof FileError && e.code === 'forbidden',
    );
    // nothing was written outside cwd
    const dir = join(cwd, '.cch-images');
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    assert.ok(!entries.some(n => n.includes('evil')), 'no escaped file');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('cleanupOldImages deletes only PNGs older than maxAgeDays; missing dir is a no-op', () => {
  const cwd = tmpCwd();
  try {
    const dir = join(cwd, '.cch-images');
    mkdirSync(dir, { recursive: true });
    const old = join(dir, 'old.png');
    const fresh = join(dir, 'fresh.png');
    writeFileSync(old, PNG);
    writeFileSync(fresh, PNG);
    // backdate old.png 10 days
    const tenDaysAgo = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(old, tenDaysAgo, tenDaysAgo);

    cleanupOldImages(cwd, { maxAgeDays: 7 });
    assert.ok(!existsSync(old), 'old removed');
    assert.ok(existsSync(fresh), 'fresh kept');

    // missing dir must not throw
    const empty = tmpCwd();
    assert.doesNotThrow(() => cleanupOldImages(empty));
    rmSync(empty, { recursive: true, force: true });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
