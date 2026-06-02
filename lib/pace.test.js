import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowMinutes, paceStage, computePace } from './pace.js';

test('windowMinutes parses labels', () => {
  assert.equal(windowMinutes('5h'), 300);
  assert.equal(windowMinutes('7d'), 10080);
  assert.equal(windowMinutes('30d'), 43200);
  assert.equal(windowMinutes('weird'), null);
});

test('paceStage thresholds', () => {
  assert.equal(paceStage(0), 'onTrack');
  assert.equal(paceStage(-2), 'onTrack');
  assert.equal(paceStage(5), 'slightlyAhead');
  assert.equal(paceStage(-5), 'slightlyBehind');
  assert.equal(paceStage(10), 'ahead');
  assert.equal(paceStage(-10), 'behind');
  assert.equal(paceStage(20), 'farAhead');
  assert.equal(paceStage(-20), 'farBehind');
});

test('computePace: behind (slower than clock) when used below elapsed', () => {
  const now = 1_000_000_000_000; // ms
  const resetsAt = Math.floor(now / 1000) + (3 * 3600 + 56 * 60); // unix sec
  const p = computePace({ usedPercent: 11, resetsAt, windowMinutes: 300 }, now);
  assert.ok(p);
  assert.ok(p.expectedPct > 20 && p.expectedPct < 22); // ~21%
  assert.equal(p.actualPct, 11);
  assert.ok(p.deltaPct < 0);          // behind = good
  assert.equal(p.stage, 'behind');
  assert.equal(p.lastsToReset, true); // 11% in 21% of window -> lasts
});

test('computePace: ahead with ETA when burning fast', () => {
  const now = 1_000_000_000_000;
  const resets30 = Math.floor(now / 1000) + (29 * 86400 + 13 * 3600);
  const p = computePace({ usedPercent: 25, resetsAt: resets30, windowMinutes: 43200 }, now);
  assert.ok(p);
  assert.ok(p.deltaPct > 0);          // ahead = burning fast
  assert.ok(p.expectedPct < 5);
  assert.ok(p.etaSeconds > 0 && p.lastsToReset === false);
});

test('computePace: null when window mismatch or resetsAt missing', () => {
  const now = 1_000_000_000_000;
  assert.equal(computePace({ usedPercent: 10, resetsAt: null, windowMinutes: 300 }, now), null);
  const far = Math.floor(now / 1000) + 400 * 60;
  assert.equal(computePace({ usedPercent: 10, resetsAt: far, windowMinutes: 300 }, now), null);
});
