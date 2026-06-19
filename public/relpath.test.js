import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentRel, basename } from './relpath.js';

test('parentRel: nested → parent', () => {
  assert.equal(parentRel('a/b/c'), 'a/b');
  assert.equal(parentRel('a/b'), 'a');
});

test('parentRel: single segment and empty → empty', () => {
  assert.equal(parentRel('a'), '');
  assert.equal(parentRel(''), '');
});

test('basename: nested → last segment', () => {
  assert.equal(basename('a/b/c'), 'c');
});

test('basename: single segment and empty', () => {
  assert.equal(basename('a'), 'a');
  assert.equal(basename(''), '');
});
