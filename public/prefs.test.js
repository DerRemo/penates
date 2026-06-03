// public/prefs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, coerceInt, coerceEnum, coerceBool, coercePercent } from './prefs.js';

test('DEFAULTS match current app behavior', () => {
  assert.equal(DEFAULTS.termFontSize, 13);
  assert.equal(DEFAULTS.termScrollback, 5000);
  assert.equal(DEFAULTS.termCursor, 'bar');
  assert.equal(DEFAULTS.termCopyOnSelect, false);
  assert.equal(DEFAULTS.termBell, false);
  assert.equal(DEFAULTS.soundVolume, 100);
  assert.equal(DEFAULTS.animations, true);
  assert.equal(DEFAULTS.density, 'normal');
  assert.equal(DEFAULTS.landingView, 'last');
  assert.equal(DEFAULTS.confirmKill, true);
});

test('coerceInt clamps to range and falls back on garbage', () => {
  assert.equal(coerceInt('20', 11, 18, 13), 18);
  assert.equal(coerceInt('9', 11, 18, 13), 11);
  assert.equal(coerceInt('15', 11, 18, 13), 15);
  assert.equal(coerceInt('abc', 11, 18, 13), 13);
  assert.equal(coerceInt(null, 11, 18, 13), 13);
  assert.equal(coerceInt('7000', 500, 10000, 5000), 7000);
});

test('coerceEnum returns value if allowed, else fallback', () => {
  assert.equal(coerceEnum('block', ['block','bar','underline'], 'bar'), 'block');
  assert.equal(coerceEnum('nope', ['block','bar','underline'], 'bar'), 'bar');
  assert.equal(coerceEnum(null, ['a','b'], 'a'), 'a');
});

test('coerceBool maps "1"/"0"/true/false', () => {
  assert.equal(coerceBool('1', false), true);
  assert.equal(coerceBool('0', true), false);
  assert.equal(coerceBool(null, true), true);
  assert.equal(coerceBool('garbage', false), false);
});

test('coercePercent clamps 0..100 to a 0..1 gain factor', () => {
  assert.equal(coercePercent('100', 100), 1);
  assert.equal(coercePercent('0', 100), 0);
  assert.equal(coercePercent('50', 100), 0.5);
  assert.equal(coercePercent('500', 100), 1);
  assert.equal(coercePercent('abc', 100), 1);
});
