// lib/session-restore.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAutoRestore } from './session-restore.js';

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
