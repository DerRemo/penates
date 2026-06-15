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

test('manuallyStopped: set/clear round-trips, false not persisted', async () => {
  await known.load();
  await known.add({ name: 'cc-a', directory: '/tmp', command: 'claude' });
  assert.equal(known.isManuallyStopped('cc-a'), false);
  assert.equal(await known.setManuallyStopped('cc-a', true), true);
  assert.equal(known.isManuallyStopped('cc-a'), true);
  const raw = JSON.parse(await fs.readFile(join(dir, 'sessions.json'), 'utf-8'));
  assert.equal(raw.knownSessions[0].manuallyStopped, true);
  assert.equal(await known.setManuallyStopped('cc-a', false), true);
  assert.equal(known.isManuallyStopped('cc-a'), false);
  const raw2 = JSON.parse(await fs.readFile(join(dir, 'sessions.json'), 'utf-8'));
  assert.equal('manuallyStopped' in raw2.knownSessions[0], false);
});
test('manuallyStopped: unknown name → false, setter no-ops', async () => {
  await known.load();
  assert.equal(known.isManuallyStopped('cc-nope'), false);
  assert.equal(await known.setManuallyStopped('cc-nope', true), false);
});
test('manuallyStopped: add() clears the flag (restore makes it a candidate again)', async () => {
  await known.load();
  await known.add({ name: 'cc-b', directory: '/tmp', command: 'claude' });
  await known.setManuallyStopped('cc-b', true);
  await known.add({ name: 'cc-b', directory: '/tmp', command: 'claude' });
  assert.equal(known.isManuallyStopped('cc-b'), false);
});
