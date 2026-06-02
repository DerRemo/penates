import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paceLabel, formatEtaShort, buildTrendPath } from './usage-format.js';

// Stub translator: echoes key + appended params so assertions are stable.
const t = (key, params) => params ? `${key}(${JSON.stringify(params)})` : key;

test('paceLabel: null pace -> null (caller omits note)', () => {
  assert.equal(paceLabel(null, t), null);
});

test('paceLabel: behind = good/slower, lastsToReset', () => {
  const r = paceLabel({ stage: 'behind', deltaPct: -10, lastsToReset: true, etaSeconds: null }, t);
  assert.equal(r.cls, 'good');
  assert.ok(r.text.includes('usage.pace.slower'));
  assert.ok(r.text.includes('usage.pace.lastsToReset'));
});

test('paceLabel: ahead = bad/faster, runsOutIn with eta', () => {
  const r = paceLabel({ stage: 'ahead', deltaPct: 9, lastsToReset: false, etaSeconds: 9 * 86400 }, t);
  assert.equal(r.cls, 'bad');
  assert.ok(r.text.includes('usage.pace.faster'));
  assert.ok(r.text.includes('usage.pace.runsOutIn'));
});

test('paceLabel: onTrack = neutral', () => {
  const r = paceLabel({ stage: 'onTrack', deltaPct: 1, lastsToReset: true }, t);
  assert.equal(r.cls, 'neutral');
  assert.ok(r.text.includes('usage.pace.onTrack'));
});

test('formatEtaShort: minute/hour/day bands', () => {
  assert.match(formatEtaShort(30 * 60, t), /usage\.eta\.min/);     // 30 min
  assert.match(formatEtaShort(5 * 3600, t), /usage\.eta\.hour/);   // 5 h
  assert.match(formatEtaShort(9 * 86400, t), /usage\.eta\.day/);   // 9 d
});

test('buildTrendPath: empty and single-point are safe', () => {
  assert.deepEqual(buildTrendPath([], 600, 120), { line: '', area: '' });
  const one = buildTrendPath([5], 600, 120);
  assert.ok(one.line.startsWith('M'));
});

test('buildTrendPath: scales to max and closes the area', () => {
  const { line, area } = buildTrendPath([0, 10], 100, 100);
  assert.match(line, /^M0,/);
  assert.ok(area.trimEnd().endsWith('Z'));
});
