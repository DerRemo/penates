// lib/server-control.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildLaunchdTarget, isLaunchdManaged, tailFile, buildSystemdUnit, isSystemdManaged } from './server-control.js';

test('buildLaunchdTarget composes gui/<uid>/<label>', () => {
  assert.equal(buildLaunchdTarget(501, 'com.penates'), 'gui/501/com.penates');
});

test('isLaunchdManaged true when exec succeeds, false when it throws', () => {
  const ok = isLaunchdManaged('gui/501/x', () => 'printed output');
  assert.equal(ok, true);
  const bad = isLaunchdManaged('gui/501/x', () => { throw new Error('Could not find service'); });
  assert.equal(bad, false);
});

test('buildSystemdUnit returns the default user unit name', () => {
  assert.equal(buildSystemdUnit(), 'penates.service');
  assert.equal(buildSystemdUnit('custom'), 'custom.service');
  assert.equal(buildSystemdUnit('custom.service'), 'custom.service');
});

test('isSystemdManaged true when systemctl is-enabled succeeds, false when it throws', () => {
  const ok = isSystemdManaged('penates.service', (args) => {
    assert.deepEqual(args, ['--user', 'is-enabled', 'penates.service']);
    return 'enabled';
  });
  assert.equal(ok, true);
  const bad = isSystemdManaged('penates.service', () => { throw new Error('disabled'); });
  assert.equal(bad, false);
});

test('tailFile returns the last N lines', async () => {
  const p = join(tmpdir(), `pen-log-${process.pid}-${Date.now()}.log`);
  await fs.writeFile(p, Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n') + '\n');
  const out = await tailFile(p, 5, 64 * 1024);
  assert.equal(out.trim().split('\n').length, 5);
  assert.match(out, /line 50/);
  assert.doesNotMatch(out, /line 44\b/);
  await fs.unlink(p);
});

test('tailFile returns empty string for a missing file', async () => {
  const out = await tailFile(join(tmpdir(), 'definitely-not-here.log'), 10, 1024);
  assert.equal(out, '');
});

test('tailFile caps the bytes it reads (last maxBytes only)', async () => {
  const p = join(tmpdir(), `pen-big-${process.pid}-${Date.now()}.log`);
  await fs.writeFile(p, 'X'.repeat(10000) + '\nTAILMARKER\n');
  const out = await tailFile(p, 100, 64);
  assert.match(out, /TAILMARKER/);
  assert.doesNotMatch(out, /X{200}/);
  await fs.unlink(p);
});
