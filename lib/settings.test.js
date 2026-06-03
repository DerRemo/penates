// lib/settings.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import * as settings from './settings.js';

const PATH = settings._internal.STORE_PATH;

async function rmStore() { try { await fs.unlink(PATH); } catch {} }

beforeEach(async () => { await rmStore(); settings._internal.reset(); });

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

test('corrupt file is backed up and treated as empty', async () => {
  await fs.mkdir(settings._internal.STORE_DIR, { recursive: true });
  await fs.writeFile(PATH, '{ this is not json', 'utf-8');
  await settings.load({ tmuxMouse: 'on', remoteApproval: true });
  assert.deepEqual(settings.get(), { tmuxMouse: 'on', remoteApproval: true });
});
