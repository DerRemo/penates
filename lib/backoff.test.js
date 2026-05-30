import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBackoffMs } from './backoff.js';

test('nextBackoffMs: mid-jitter equals base (rand=0.5)', () => {
  assert.equal(nextBackoffMs(0, () => 0.5), 1000);   // base 1000
  assert.equal(nextBackoffMs(1, () => 0.5), 2000);   // base 2000
  assert.equal(nextBackoffMs(2, () => 0.5), 4000);   // base 4000
});

test('nextBackoffMs: jitter bounds (rand=0 → -20%, rand=1 → +20%)', () => {
  assert.equal(nextBackoffMs(0, () => 0), 800);
  assert.equal(nextBackoffMs(0, () => 1), 1200);
});

test('nextBackoffMs: caps base at 20s before jitter', () => {
  assert.equal(nextBackoffMs(5, () => 0.5), 20000);  // 32000 → cap 20000
  assert.equal(nextBackoffMs(40, () => 1), 24000);   // 20000 + 20%
  assert.equal(nextBackoffMs(40, () => 0), 16000);   // 20000 - 20%
});

test('nextBackoffMs: default rand stays within jittered bounds', () => {
  for (let a = 0; a < 8; a++) {
    const base = Math.min(1000 * 2 ** a, 20000);
    const v = nextBackoffMs(a);
    assert.ok(v >= Math.round(base * 0.8) && v <= Math.round(base * 1.2), `attempt ${a} → ${v}`);
  }
});
