import { test } from 'node:test';
import assert from 'node:assert';
import { deriveShellCounts } from './shell-counts.js';

test('zählt aktiv/ruhend + activity-Verteilung', () => {
  const sessions = [
    { status: 'running', activity: 'working' },
    { status: 'running', activity: 'working' },
    { status: 'running', activity: 'waiting' },
    { status: 'running', activity: 'idle' },
    { status: 'foreign',  activity: 'unknown' },
    { status: 'dormant' },
    { status: 'dormant' },
  ];
  assert.deepStrictEqual(deriveShellCounts(sessions), {
    total: 7, active: 5, dormant: 2,
    working: 2, waiting: 1, idle: 1, unknown: 1,
  });
});

test('leere/fehlende Eingabe → Nullen', () => {
  const zero = { total: 0, active: 0, dormant: 0, working: 0, waiting: 0, idle: 0, unknown: 0 };
  assert.deepStrictEqual(deriveShellCounts([]), zero);
  assert.deepStrictEqual(deriveShellCounts(undefined), zero);
});

test('running ohne bekannte activity → unknown', () => {
  const c = deriveShellCounts([{ status: 'running' }, { status: 'running', activity: 'bogus' }]);
  assert.strictEqual(c.active, 2);
  assert.strictEqual(c.unknown, 2);
});
