import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugifySessionName, buildBrainstormPriming, resolveBrainstormSpawn, ideaGenSessionName, buildIdeaGenPriming } from './brainstorm-spawn.js';

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

test('ideaGenSessionName derives a deterministic ideas-<slug> name', () => {
  assert.equal(ideaGenSessionName('Claude Code Hub', 'claude-code-hub'), 'ideas-claude-code-hub');
  // same input → same output (deterministic / idempotency key)
  assert.equal(ideaGenSessionName('Claude Code Hub', 'claude-code-hub'),
               ideaGenSessionName('Claude Code Hub', 'claude-code-hub'));
});

test('ideaGenSessionName is whitelist-safe and falls back to projectId then "x"', () => {
  const WL = /^[\w\-. ]{1,64}$/;
  assert.ok(WL.test(ideaGenSessionName('Föö: Bar!!', 'p-1')));
  assert.equal(ideaGenSessionName('', 'my-proj'), 'ideas-my-proj');
  assert.equal(ideaGenSessionName('', ''), 'ideas-x');
  assert.ok(ideaGenSessionName('x'.repeat(100), 'p').length <= 46);
});

test('buildIdeaGenPriming includes project name+id, dedup query, collab POST, single-line', () => {
  const p = buildIdeaGenPriming('claude-code-hub', 'Claude Code Hub');
  assert.ok(p.includes('Claude Code Hub'));
  assert.ok(p.includes('claude-code-hub'));
  assert.ok(p.includes('cards?projectId=claude-code-hub'));   // dedup hint
  assert.ok(p.includes('"origin":"collab"'));
  assert.ok(p.includes('"stage":"idea"'));
  assert.ok(p.includes('notes'));
  assert.ok(!/[\n\r]/.test(p), 'must be single line');
});

test('buildIdeaGenPriming strips control chars from name/id', () => {
  const p = buildIdeaGenPriming('a\nb', 'X\tY');
  assert.ok(!/[\n\r\t]/.test(p));
});
