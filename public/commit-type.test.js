import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitType, commitTypeColor } from './commit-type.js';

test('commitType extracts the conventional-commit type', () => {
  assert.equal(commitType('feat: add x'), 'feat');
  assert.equal(commitType('fix(scope): bug'), 'fix');
  assert.equal(commitType('refactor!: breaking'), 'refactor');
  assert.equal(commitType('docs(readme): tidy'), 'docs');
  assert.equal(commitType('no type here'), null);
  assert.equal(commitType('Merge branch main'), null);
});

test('commitTypeColor maps types to token var names', () => {
  assert.equal(commitTypeColor('feat: x'), '--green');
  assert.equal(commitTypeColor('fix: x'), '--orange');
  assert.equal(commitTypeColor('refactor: x'), '--accent');
  assert.equal(commitTypeColor('docs: x'), '--text-muted');
  assert.equal(commitTypeColor('perf: x'), '--green');
  assert.equal(commitTypeColor('chore: x'), '--text-muted');
});

test('commitTypeColor falls back to null for unknown / no type', () => {
  assert.equal(commitTypeColor('wip random'), null);
  assert.equal(commitTypeColor('zzz: x'), null);
});
