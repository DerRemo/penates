// lib/penates-home.test.js
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { homedir } from 'os';
import { penatesHome } from './penates-home.js';

let saved;
beforeEach(() => { saved = process.env.PENATES_HOME; delete process.env.PENATES_HOME; });
afterEach(() => { if (saved === undefined) delete process.env.PENATES_HOME; else process.env.PENATES_HOME = saved; });

test('defaults to ~/.penates when PENATES_HOME is unset', () => {
  assert.equal(penatesHome(), join(homedir(), '.penates'));
});

test('returns the override when PENATES_HOME is set', () => {
  process.env.PENATES_HOME = '/tmp/somewhere';
  assert.equal(penatesHome(), '/tmp/somewhere');
});

test('reads the env lazily (change between calls is reflected)', () => {
  assert.equal(penatesHome(), join(homedir(), '.penates'));
  process.env.PENATES_HOME = '/tmp/changed';
  assert.equal(penatesHome(), '/tmp/changed');
});
