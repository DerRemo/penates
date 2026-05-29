import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as moshi from './moshi-hook.js';

const USAGE_JSON = JSON.stringify([{
  accountId: 'claude:abc', accountLabel: 'Max 5x', agent: 'claude-code',
  hostName: 'Mac', capturedAt: '2026-05-29T13:31:54Z',
  windows: [
    { label: '5h', usedPercentage: 7, resetsAt: '2026-05-29T14:30:00Z' },
    { label: '7d', usedPercentage: 8, resetsAt: '2026-06-04T04:00:01Z' },
  ],
}]);

const DIRS_JSON = JSON.stringify([
  { cwd: '/Users/x/a', sources: ['claude'], lastUsed: 1780056840 },
  { cwd: '/Users/x/b', sources: ['codex', 'cursor'], lastUsed: 1780056813 },
]);

test('getUsage parses valid usage JSON', () => {
  moshi._resetCache();
  moshi._setRunner((args) => { assert.deepEqual(args, ['usage']); return USAGE_JSON; });
  const u = moshi.getUsage({ now: 1000 });
  assert.equal(u.length, 1);
  assert.equal(u[0].accountLabel, 'Max 5x');
  assert.equal(u[0].agent, 'claude-code');
  assert.equal(u[0].windows[0].label, '5h');
  assert.equal(u[0].windows[0].usedPercentage, 7);
});

test('getRecentDirs parses cwd-list JSON with sources', () => {
  moshi._resetCache();
  moshi._setRunner((args) => {
    assert.deepEqual(args, ['cwd-list', '--json', '--limit', '8']);
    return DIRS_JSON;
  });
  const d = moshi.getRecentDirs({ limit: 8, now: 1000 });
  assert.equal(d.length, 2);
  assert.equal(d[0].cwd, '/Users/x/a');
  assert.deepEqual(d[1].sources, ['codex', 'cursor']);
});

test('getUsage returns null on non-zero exit', () => {
  moshi._resetCache();
  moshi._setRunner(() => { throw new Error('command failed'); });
  assert.equal(moshi.getUsage({ now: 1 }), null);
});

test('getUsage returns null on broken JSON', () => {
  moshi._resetCache();
  moshi._setRunner(() => '{not json');
  assert.equal(moshi.getUsage({ now: 1 }), null);
});

test('getUsage caches within TTL', () => {
  moshi._resetCache();
  let calls = 0;
  moshi._setRunner(() => { calls++; return USAGE_JSON; });
  moshi.getUsage({ now: 1000 });
  moshi.getUsage({ now: 1000 + 29_000 }); // innerhalb 30s
  assert.equal(calls, 1);
  moshi.getUsage({ now: 1000 + 31_000 }); // nach TTL
  assert.equal(calls, 2);
});

test('isAvailable returns false when CLI throws', () => {
  moshi._resetCache();
  moshi._setRunner(() => { throw new Error('not found'); });
  assert.equal(moshi.isAvailable(), false);
});

test('isAvailable returns true when CLI succeeds', () => {
  moshi._resetCache();
  moshi._setRunner(() => '1.0.0');
  assert.equal(moshi.isAvailable(), true);
});

test('getRecentDirs caches within TTL', () => {
  moshi._resetCache();
  let calls = 0;
  moshi._setRunner(() => { calls++; return JSON.stringify([{ cwd: '/x', sources: ['claude'], lastUsed: 1 }]); });
  moshi.getRecentDirs({ limit: 8, now: 1000 });
  moshi.getRecentDirs({ limit: 8, now: 1000 + 9_000 }); // innerhalb 10s
  assert.equal(calls, 1);
  moshi.getRecentDirs({ limit: 8, now: 1000 + 11_000 }); // nach TTL
  assert.equal(calls, 2);
});
