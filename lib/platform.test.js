import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// platform.js reads process.platform at first call and caches it; importing a
// fresh module instance (query suffix) resets the cache so we can mock per test.
async function freshPlatform(plat) {
  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: plat, configurable: true });
  try {
    return await import(`./platform.js?p=${plat}-${Math.random().toString(36).slice(2)}`);
  } finally {
    Object.defineProperty(process, 'platform', orig);
  }
}

test('platform(): darwin → macos, linux → linux, other → linux', async () => {
  assert.equal((await freshPlatform('darwin')).platform(), 'macos');
  assert.equal((await freshPlatform('linux')).platform(), 'linux');
  assert.equal((await freshPlatform('win32')).platform(), 'linux'); // WSL2 = linux path
});

test('extraPaths(): macOS vs Linux ordering', async () => {
  const mac = (await freshPlatform('darwin')).extraPaths();
  assert.ok(mac.some((p) => p.endsWith('/.local/bin')));
  assert.ok(mac.includes('/opt/homebrew/bin'));
  const lin = (await freshPlatform('linux')).extraPaths();
  assert.ok(lin.includes('/usr/bin'));
  assert.ok(!lin.includes('/opt/homebrew/bin'));
});

test('resolveBin(): finds an executable on the given PATH, null otherwise', async () => {
  const { resolveBin } = await freshPlatform('linux');
  const dir = mkdtempSync(join(tmpdir(), 'plat-'));
  try {
    const bin = join(dir, 'mytool');
    writeFileSync(bin, '#!/bin/sh\n'); chmodSync(bin, 0o755);
    assert.equal(resolveBin('mytool', { env: { PATH: dir } }), bin);
    assert.equal(resolveBin('nope', { env: { PATH: dir } }), null);
    // non-executable file is not a match
    const noexec = join(dir, 'plain'); writeFileSync(noexec, 'x'); chmodSync(noexec, 0o644);
    assert.equal(resolveBin('plain', { env: { PATH: dir } }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolveTrash(): macOS prefers PATH trash, defaults to /usr/bin/trash', async () => {
  const { resolveTrash } = await freshPlatform('darwin');
  const t = resolveTrash();
  assert.ok(t && typeof t.bin === 'string');
  assert.deepEqual(t.args, []);
});

test('resolveTrash(): Linux uses gio trash, null if neither gio nor trash-put', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plat-trash-'));
  const prevPath = process.env.PATH;
  try {
    // gio present → { bin: <gio>, args:['trash'] }
    const gio = join(dir, 'gio'); writeFileSync(gio, '#!/bin/sh\n'); chmodSync(gio, 0o755);
    const lin = await freshPlatform('linux');
    process.env.PATH = dir;
    const t = lin.resolveTrash();
    assert.equal(t.bin, gio);
    assert.deepEqual(t.args, ['trash']);
  } finally { process.env.PATH = prevPath; rmSync(dir, { recursive: true, force: true }); }
});

test('resolveTrash(): Linux returns null when no trash tool found', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plat-empty-'));
  const prevPath = process.env.PATH;
  try {
    const lin = await freshPlatform('linux');
    process.env.PATH = dir; // empty dir → nothing on PATH
    assert.equal(lin.resolveTrash(), null);
  } finally { process.env.PATH = prevPath; rmSync(dir, { recursive: true, force: true }); }
});
