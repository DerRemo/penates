import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import * as limits from './usage-limits.js';

let dir, logPath;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cchub-limits-'));
  logPath = join(dir, 'usage-limits.jsonl');
  limits._setLogPath(logPath);
  limits._reset();
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const ACCOUNTS = [{
  accountId: 'claude:abc', accountLabel: 'Max 5x', agent: 'claude-code',
  windows: [
    { label: '5h', usedPercentage: 95, resetsAt: '2026-05-29T14:30:00Z' },
    { label: '7d', usedPercentage: 40, resetsAt: '2026-06-04T04:00:01Z' },
  ],
}, {
  accountId: 'codex:xyz', accountLabel: 'Pro', agent: 'codex',
  windows: [{ label: '5h', usedPercentage: 10, resetsAt: '2026-05-29T15:00:00Z' }],
}];

test('recordUsageSnapshot exposes accounts + logs per-account points', async () => {
  limits.recordUsageSnapshot(ACCOUNTS, { now: 1_000_000 });
  const h = await limits.getLimitHistory({ days: 7 });
  assert.equal(h.accounts.length, 2);
  assert.equal(h.accounts[0].accountLabel, 'Max 5x');
  assert.equal(h.points.length, 2);
  assert.ok(h.points.every(p => p.acct));
  assert.equal(h.peaks5h, 1);
});

test('legacy points without acct map to a default account', async () => {
  writeFileSync(logPath, JSON.stringify({ t: '2026-05-29T10:00:00.000Z', '5h': 50, '7d': 20 }) + '\n');
  const h = await limits.getLimitHistory({ days: 7 });
  assert.equal(h.points.length, 1);
  assert.equal(h.points[0].acct, 'default');
});

test('recordStatusline no longer writes limit points', async () => {
  limits.recordStatusline('cc-foo', { pct5h: 99, pct7d: 99, costUsd: 1.5, linesAdded: 10 });
  const h = await limits.getLimitHistory({ days: 7 });
  assert.equal(h.points.length, 0);
  const costs = limits.getAllSessionCosts();
  assert.equal(costs.totalUsd, 1.5);
  assert.equal(costs.totalLinesAdded, 10);
});

test('snapshot logging throttles within window but always updates accounts', async () => {
  limits.recordUsageSnapshot(ACCOUNTS, { now: 1_000_000 });
  limits.recordUsageSnapshot(ACCOUNTS, { now: 1_000_000 + 60_000 });
  const h = await limits.getLimitHistory({ days: 7 });
  // Nur der ERSTE Snapshot wird geloggt (ein Punkt pro Account); der zweite
  // Call liegt innerhalb des 5-min-Throttles → kein weiterer Punkt. Wäre er
  // NICHT gethrottlet, stünden hier 2*ACCOUNTS.length Punkte.
  assert.equal(h.points.length, ACCOUNTS.length);
  assert.equal(h.accounts.length, 2);
});
