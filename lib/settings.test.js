// lib/settings.test.js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as settings from './settings.js';

let dir;
let savedHome;
beforeEach(async () => {
  savedHome = process.env.PENATES_HOME;
  dir = await fs.mkdtemp(join(tmpdir(), 'settings-'));
  process.env.PENATES_HOME = dir;
  settings._internal.reset();
});
afterEach(async () => {
  if (savedHome === undefined) delete process.env.PENATES_HOME; else process.env.PENATES_HOME = savedHome;
  await fs.rm(dir, { recursive: true, force: true });
});

test('storePath resolves under PENATES_HOME (never the real home)', () => {
  assert.equal(settings._internal.storePath(), join(dir, 'settings.json'));
});

test('get() returns env defaults when no file exists', async () => {
  await settings.load({ tmuxMouse: 'off', remoteApproval: false });
  assert.deepEqual(settings.get(), { tmuxMouse: 'off', remoteApproval: false });
});

test('patch() persists and merges over defaults', async () => {
  await settings.load({ tmuxMouse: 'on', remoteApproval: true });
  const merged = await settings.patch({ tmuxMouse: 'off' });
  assert.equal(merged.tmuxMouse, 'off');
  assert.equal(merged.remoteApproval, true);
  settings._internal.reset();
  await settings.load({ tmuxMouse: 'on', remoteApproval: true });
  assert.equal(settings.get().tmuxMouse, 'off');
});

test('patch() ignores unknown keys and invalid values', async () => {
  await settings.load({ tmuxMouse: 'on', remoteApproval: true });
  await settings.patch({ tmuxMouse: 'sideways', bogus: 123, remoteApproval: 'yes' });
  assert.equal(settings.get().tmuxMouse, 'on');
  assert.equal(settings.get().remoteApproval, true);
  assert.equal('bogus' in settings.get(), false);
});

test('corrupt file is backed up (inside PENATES_HOME) and treated as empty', async () => {
  await fs.writeFile(join(dir, 'settings.json'), '{ this is not json', 'utf-8');
  await settings.load({ tmuxMouse: 'on', remoteApproval: true });
  assert.deepEqual(settings.get(), { tmuxMouse: 'on', remoteApproval: true });
  const files = await fs.readdir(dir);
  assert.ok(files.some(f => f.startsWith('settings.json.corrupt-')), 'corrupt backup landed in temp dir');
});
