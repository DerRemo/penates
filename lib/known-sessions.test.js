// lib/known-sessions.test.js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as known from './known-sessions.js';

let dir;
let savedHome;
beforeEach(async () => {
  savedHome = process.env.PENATES_HOME;
  dir = await fs.mkdtemp(join(tmpdir(), 'known-'));
  process.env.PENATES_HOME = dir;
});
afterEach(async () => {
  if (savedHome === undefined) delete process.env.PENATES_HOME; else process.env.PENATES_HOME = savedHome;
  await fs.rm(dir, { recursive: true, force: true });
});

test('storePath resolves under PENATES_HOME (never the real home)', () => {
  assert.equal(known._internal.storePath(), join(dir, 'sessions.json'));
});

test('add + load round-trips inside the isolated dir', async () => {
  await known.load();
  await known.add({ name: 'cc-x', directory: '/tmp', command: 'claude' });
  await known.load();
  const found = known.find('cc-x');
  assert.equal(found.directory, '/tmp');
  assert.equal(found.command, 'claude');
});

test('corrupt file is backed up inside PENATES_HOME and treated as empty', async () => {
  await fs.writeFile(join(dir, 'sessions.json'), '{ not json', 'utf-8');
  await known.load();
  assert.deepEqual(known.list(), []);
  const files = await fs.readdir(dir);
  assert.ok(files.some(f => f.startsWith('sessions.json.corrupt-')), 'corrupt backup landed in temp dir');
});
