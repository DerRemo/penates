import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugifySessionName, buildBrainstormPriming, resolveBrainstormSpawn } from './brainstorm-spawn.js';

test('slugifySessionName lowercases and replaces unsafe chars', () => {
  assert.equal(slugifySessionName('Multi-CLI: Auth via .env'), 'multi-cli-auth-via-.env');
});

test('slugifySessionName falls back to "idea" for empty/garbage', () => {
  assert.equal(slugifySessionName(''), 'idea');
  assert.equal(slugifySessionName('!!!'), 'idea');
  assert.equal(slugifySessionName(null), 'idea');
});

test('slugifySessionName caps length to 48', () => {
  assert.ok(slugifySessionName('x'.repeat(100)).length <= 48);
});

test('buildBrainstormPriming includes title, card id, and is single-line', () => {
  const p = buildBrainstormPriming('My idea', 'card-123');
  assert.ok(p.includes('My idea'));
  assert.ok(p.includes('card-123'));
  assert.ok(p.includes('brainstormDoc'));
  assert.ok(!/[\n\r]/.test(p), 'must be single line');
});

test('buildBrainstormPriming strips control chars/newlines from the title', () => {
  const p = buildBrainstormPriming('a\nb\tc', 'id1');
  assert.ok(!/[\n\r\t]/.test(p));
});

test('resolveBrainstormSpawn reuses a live linked session', () => {
  assert.deepEqual(
    resolveBrainstormSpawn({ sessionRef: 'cc-x' }, ['cc-x', 'cc-y']),
    { reuse: true, session: 'cc-x' });
});

test('resolveBrainstormSpawn spawns when no live link', () => {
  assert.deepEqual(resolveBrainstormSpawn({ sessionRef: 'cc-x' }, ['cc-y']), { reuse: false });
  assert.deepEqual(resolveBrainstormSpawn({ sessionRef: null }, ['cc-x']), { reuse: false });
});
