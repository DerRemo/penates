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

// ── pruneStale: Boot-Cleanup veralteter Einträge ────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const seed = async (entries) =>
  fs.writeFile(join(dir, 'sessions.json'), JSON.stringify({ knownSessions: entries }), 'utf-8');

test('pruneStale removes only dormant entries older than the window', async () => {
  const now = Date.parse('2026-06-16T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  await seed([
    { name: 'cc-live-old', directory: '/t', command: 'claude', lastSeenAt: ago(30 * DAY) },
    { name: 'cc-dormant-old', directory: '/t', command: 'claude', lastSeenAt: ago(10 * DAY) },
    { name: 'cc-dormant-recent', directory: '/t', command: 'claude', lastSeenAt: ago(2 * DAY) },
    { name: 'cc-no-ts', directory: '/t', command: 'claude' },
  ]);
  await known.load();
  const removed = await known.pruneStale({ liveNames: ['cc-live-old'], now, maxAgeMs: 7 * DAY });
  assert.deepEqual(removed, ['cc-dormant-old']);
  assert.deepEqual(known.list().map(e => e.name).sort(), ['cc-dormant-recent', 'cc-live-old', 'cc-no-ts']);
  const raw = JSON.parse(await fs.readFile(join(dir, 'sessions.json'), 'utf-8'));
  assert.deepEqual(raw.knownSessions.map(e => e.name).sort(), ['cc-dormant-recent', 'cc-live-old', 'cc-no-ts']);
});
test('pruneStale: edge exactly at window → kept (inclusive)', async () => {
  const now = Date.parse('2026-06-16T12:00:00Z');
  await seed([{ name: 'cc-edge', directory: '/t', command: 'claude', lastSeenAt: new Date(now - 7 * DAY).toISOString() }]);
  await known.load();
  assert.deepEqual(await known.pruneStale({ liveNames: [], now, maxAgeMs: 7 * DAY }), []);
});
test('pruneStale: nothing stale → [], file untouched count', async () => {
  await known.load();
  await known.add({ name: 'cc-fresh', directory: '/t', command: 'claude' });
  assert.deepEqual(await known.pruneStale({ liveNames: [], now: Date.now(), maxAgeMs: 7 * DAY }), []);
  assert.equal(known.list().length, 1);
});
test('pruneStale: manuallyStopped entry is pruned when old, kept when recent', async () => {
  const now = Date.parse('2026-06-16T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  await seed([
    { name: 'cc-stopped-old', directory: '/t', command: 'claude', manuallyStopped: true, lastSeenAt: ago(10 * DAY) },
    { name: 'cc-stopped-recent', directory: '/t', command: 'claude', manuallyStopped: true, lastSeenAt: ago(1 * DAY) },
  ]);
  await known.load();
  const removed = await known.pruneStale({ liveNames: [], now, maxAgeMs: 7 * DAY });
  assert.deepEqual(removed, ['cc-stopped-old']);
  assert.deepEqual(known.list().map(e => e.name), ['cc-stopped-recent']);
});
test('pruneStale: unparseable lastSeenAt → kept (never delete unreasoned data)', async () => {
  const now = Date.parse('2026-06-16T12:00:00Z');
  await seed([{ name: 'cc-bad', directory: '/t', command: 'claude', lastSeenAt: 'garbage' }]);
  await known.load();
  assert.deepEqual(await known.pruneStale({ liveNames: [], now, maxAgeMs: 7 * DAY }), []);
  assert.equal(known.list().length, 1);
});
