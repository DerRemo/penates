import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncTtlCache } from './ttl-cache.js';

test('first get() calls the producer and returns its value', () => {
  let calls = 0;
  const cache = createSyncTtlCache(() => { calls++; return calls; }, 1000, () => 0);
  assert.equal(cache.get(), 1);
  assert.equal(calls, 1);
});

test('second get() within the TTL returns the cached value without re-calling', () => {
  let calls = 0;
  let nowMs = 0;
  const cache = createSyncTtlCache(() => { calls++; return calls; }, 1000, () => nowMs);
  assert.equal(cache.get(), 1);
  nowMs = 999;
  assert.equal(cache.get(), 1);
  assert.equal(calls, 1);
});

test('get() after the TTL elapses re-calls the producer', () => {
  let calls = 0;
  let nowMs = 0;
  const cache = createSyncTtlCache(() => { calls++; return calls; }, 1000, () => nowMs);
  assert.equal(cache.get(), 1);
  nowMs = 1000;
  assert.equal(cache.get(), 2);
  assert.equal(calls, 2);
});

test('invalidate() forces the next get() to re-call the producer', () => {
  let calls = 0;
  const cache = createSyncTtlCache(() => { calls++; return calls; }, 1000, () => 0);
  assert.equal(cache.get(), 1);
  cache.invalidate();
  assert.equal(cache.get(), 2);
  assert.equal(calls, 2);
});

test('a falsy producer result is still cached within the TTL', () => {
  let calls = 0;
  const cache = createSyncTtlCache(() => { calls++; return undefined; }, 1000, () => 0);
  assert.equal(cache.get(), undefined);
  assert.equal(cache.get(), undefined);
  assert.equal(calls, 1);
});
