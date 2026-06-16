// lib/session-restore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAutoRestore, RESTORE_MAX_AGE_MS } from './session-restore.js';

const mk = (over = {}) => ({ name: 'cc-a', directory: '/p/a', command: 'claude --permission-mode auto', ...over });

test('dormant + not stopped → in plan with continue-command', () => {
  const plan = planAutoRestore({ known: [mk()], liveNames: [], continueEnabled: true });
  assert.deepEqual(plan, [{ name: 'cc-a', directory: '/p/a', command: 'claude --continue --permission-mode auto' }]);
});
test('live session → excluded (hub-restart no-op: all live → [])', () => {
  assert.deepEqual(planAutoRestore({ known: [mk()], liveNames: ['cc-a'], continueEnabled: true }), []);
});
test('dormant + manuallyStopped → excluded', () => {
  const plan = planAutoRestore({ known: [mk({ manuallyStopped: true })], liveNames: [], continueEnabled: true });
  assert.deepEqual(plan, []);
});
test('continueEnabled=false → plain command in plan', () => {
  const plan = planAutoRestore({ known: [mk()], liveNames: [], continueEnabled: false });
  assert.deepEqual(plan, [{ name: 'cc-a', directory: '/p/a', command: 'claude --permission-mode auto' }]);
});
test('unknown CLI → plain command in plan (continueCommand null)', () => {
  const plan = planAutoRestore({ known: [mk({ command: 'bash -lc foo' })], liveNames: [], continueEnabled: true });
  assert.deepEqual(plan, [{ name: 'cc-a', directory: '/p/a', command: 'bash -lc foo' }]);
});
test('preserves input order, mixes live/dormant correctly', () => {
  const known = [mk({ name: 'cc-1' }), mk({ name: 'cc-2' }), mk({ name: 'cc-3' })];
  const plan = planAutoRestore({ known, liveNames: ['cc-2'], continueEnabled: false });
  assert.deepEqual(plan.map(p => p.name), ['cc-1', 'cc-3']);
});
test('empty/missing input → []', () => {
  assert.deepEqual(planAutoRestore({}), []);
  assert.deepEqual(planAutoRestore(), []);
});

// ── Recency-Gate (7-Tage-Fenster) ──────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-16T12:00:00Z');
const isoAgo = (ms) => new Date(NOW - ms).toISOString();

test('RESTORE_MAX_AGE_MS is 7 days', () => {
  assert.equal(RESTORE_MAX_AGE_MS, 7 * DAY);
});
test('recent lastSeenAt (within window) → restored', () => {
  const plan = planAutoRestore({ known: [mk({ lastSeenAt: isoAgo(2 * DAY) })], liveNames: [], continueEnabled: false, now: NOW });
  assert.deepEqual(plan.map(p => p.name), ['cc-a']);
});
test('old lastSeenAt (older than window) → skipped', () => {
  const plan = planAutoRestore({ known: [mk({ lastSeenAt: isoAgo(10 * DAY) })], liveNames: [], continueEnabled: false, now: NOW });
  assert.deepEqual(plan, []);
});
test('lastSeenAt exactly at window edge → restored (inclusive)', () => {
  const plan = planAutoRestore({ known: [mk({ lastSeenAt: isoAgo(7 * DAY) })], liveNames: [], continueEnabled: false, now: NOW });
  assert.deepEqual(plan.map(p => p.name), ['cc-a']);
});
test('missing lastSeenAt → restored (backward-compat, no surprise drop)', () => {
  const plan = planAutoRestore({ known: [mk()], liveNames: [], continueEnabled: false, now: NOW });
  assert.deepEqual(plan.map(p => p.name), ['cc-a']);
});
test('unparseable lastSeenAt → restored (kept, not dropped)', () => {
  const plan = planAutoRestore({ known: [mk({ lastSeenAt: 'not-a-date' })], liveNames: [], continueEnabled: false, now: NOW });
  assert.deepEqual(plan.map(p => p.name), ['cc-a']);
});
test('old lastSeenAt but custom maxAgeMs covers it → restored', () => {
  const plan = planAutoRestore({ known: [mk({ lastSeenAt: isoAgo(10 * DAY) })], liveNames: [], continueEnabled: false, now: NOW, maxAgeMs: 30 * DAY });
  assert.deepEqual(plan.map(p => p.name), ['cc-a']);
});
