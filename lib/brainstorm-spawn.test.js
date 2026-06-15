import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugifySessionName, buildBrainstormPriming, resolveBrainstormSpawn, ideaGenSessionName, buildIdeaGenPriming, looksLikeTrustPrompt, implementSessionName, implementBranchName, isValidImplementBranch, buildImplementPriming, promptedSpawnCommand } from './brainstorm-spawn.js';

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
  assert.equal(ideaGenSessionName('Penates', 'penates'), 'ideas-penates');
  assert.equal(ideaGenSessionName('My Cool App', 'x'), 'ideas-my-cool-app');
});

test('ideaGenSessionName is whitelist-safe and falls back to projectId then "x"', () => {
  const WL = /^[\w\-. ]{1,64}$/;
  assert.ok(WL.test(ideaGenSessionName('Föö: Bar!!', 'p-1')));
  assert.equal(ideaGenSessionName('', 'my-proj'), 'ideas-my-proj');
  assert.equal(ideaGenSessionName('', ''), 'ideas-x');
  assert.ok(ideaGenSessionName('x'.repeat(100), 'p').length <= 46);
});

test('buildIdeaGenPriming includes project name+id, dedup query, collab POST, single-line', () => {
  const p = buildIdeaGenPriming('penates', 'Penates');
  assert.ok(p.includes('Penates'));
  assert.ok(p.includes('penates'));
  assert.ok(p.includes('cards?projectId=penates'));   // dedup hint
  assert.ok(p.includes('"origin":"collab"'));
  assert.ok(p.includes('"stage":"idea"'));
  assert.ok(p.includes('notes'));
  assert.ok(!/[\n\r]/.test(p), 'must be single line');
});

test('buildIdeaGenPriming strips control chars from name/id', () => {
  const p = buildIdeaGenPriming('a\nb', 'X\tY');
  assert.ok(!/[\n\r\t]/.test(p));
});

// Real capture of claude's folder-trust gate (v2.1.169), used to harden priming.
const TRUST_PANE = [
  ' Accessing workspace:',
  ' /Users/rocky/penates-trust-probe',
  ' Quick safety check: Is this a project you created or one you trust? (Like your',
  " own code, a well-known open source project, or work from your team).",
  " Claude Code'll be able to read, edit, and execute files here.",
  ' ❯ 1. Yes, I trust this folder',
  '   2. No, exit',
  ' Enter to confirm · Esc to cancel',
].join('\n');

test('looksLikeTrustPrompt detects the claude folder-trust gate', () => {
  assert.equal(looksLikeTrustPrompt(TRUST_PANE), true);
});

test('looksLikeTrustPrompt is false for a ready composer / welcome pane', () => {
  assert.equal(looksLikeTrustPrompt('❯ \n ~/proj | Opus 4.8 (1M context)'), false);
  assert.equal(looksLikeTrustPrompt("Welcome back Remo!   What's new"), false);
  assert.equal(looksLikeTrustPrompt(''), false);
  assert.equal(looksLikeTrustPrompt(null), false);
});

test('looksLikeTrustPrompt does not false-positive on our priming text', () => {
  assert.equal(looksLikeTrustPrompt(buildIdeaGenPriming('p', 'Proj')), false);
  assert.equal(looksLikeTrustPrompt(buildBrainstormPriming('Some idea', 'id1')), false);
});

// ── Phase 4: Implement-Session helpers ──

test('implementSessionName derives a deterministic impl-<slug> name', () => {
  assert.equal(implementSessionName('Dark mode toggle'), 'impl-dark-mode-toggle');
  assert.equal(implementSessionName(''), 'impl-idea');
});

test('implementSessionName is whitelist-safe and bounded', () => {
  const WL = /^[\w\-. ]{1,64}$/;
  assert.ok(WL.test(implementSessionName('Föö: Bar!!')));
  assert.ok(implementSessionName('x'.repeat(100)).length <= 53); // "impl-" + 48
});

test('implementBranchName is idea/<slug>', () => {
  assert.equal(implementBranchName('Dark mode toggle'), 'idea/dark-mode-toggle');
  assert.equal(implementBranchName(''), 'idea/idea');
});

test('buildImplementPriming includes spec path, branch, callback PATCH, no-push, single-line', () => {
  const p = buildImplementPriming({ id: 'card-9', title: 'Dark mode', brainstormDoc: 'docs/spec.md' });
  assert.ok(p.includes('Dark mode'));
  assert.ok(p.includes('docs/spec.md'));
  assert.ok(p.includes('idea/dark-mode'));
  assert.ok(p.includes('/api/board/cards/card-9'));
  assert.ok(p.includes('"stage":"review"'));
  assert.ok(p.includes('implementSummary'));
  assert.ok(/kein\s+git\s+push/i.test(p), 'must instruct no push');
  assert.ok(!/[\n\r]/.test(p), 'must be single line');
});

test('buildImplementPriming strips control chars from title/doc', () => {
  const p = buildImplementPriming({ id: 'i', title: 'a\nb', brainstormDoc: 'd\toc' });
  assert.ok(!/[\n\r\t]/.test(p));
});

// ── argv-Prompt-Spawn (ersetzt send-keys-Priming) ──

test('promptedSpawnCommand appends the env-var reference as a quoted initial prompt', () => {
  assert.equal(promptedSpawnCommand('claude'), 'claude "$PENATES_PRIME_PROMPT"');
  assert.equal(
    promptedSpawnCommand('claude --dangerously-skip-permissions'),
    'claude --dangerously-skip-permissions "$PENATES_PRIME_PROMPT"');
});

// Regression: the control-char cleaner must NOT touch hyphens/punctuation.
// Guards against a future regex of /[ -]+/ (space..hyphen range) that would
// corrupt dated spec paths like 2026-06-09-foo.md -> "2026 06 09 foo.md".
test('buildImplementPriming preserves hyphens in spec path and title', () => {
  const p = buildImplementPriming({ id: 'id', title: 'multi-cli auth', brainstormDoc: 'docs/superpowers/specs/2026-06-09-foo-design.md' });
  assert.ok(p.includes('docs/superpowers/specs/2026-06-09-foo-design.md'), 'hyphenated spec path must survive verbatim');
  assert.ok(p.includes('multi-cli auth'), 'hyphenated title must survive');
});

test('buildImplementPriming isolated: erwähnt Deps-Install, kein checkout -b', () => {
  const card = { id: 'c1', title: 'Mein Feature', brainstormDoc: '/x/spec.md' };
  const p = buildImplementPriming(card, { isolated: true });
  assert.match(p, /installiere/i);
  assert.match(p, /idea\/mein-feature/);
  assert.equal(/Lege einen Branch/i.test(p), false);
});

test('buildImplementPriming fallback: heutiger Text (Agent legt Branch an)', () => {
  const card = { id: 'c1', title: 'Mein Feature', brainstormDoc: '/x/spec.md' };
  const p = buildImplementPriming(card); // ohne Optionen
  assert.match(p, /Lege einen Branch idea\/mein-feature/i);
});

test('isValidImplementBranch akzeptiert einen normalen idea-Branch', () => {
  assert.equal(isValidImplementBranch(implementBranchName('Mein Feature')), true);
  assert.equal(isValidImplementBranch('idea/multi-cli-auth-via-.env'), true);
});

test('isValidImplementBranch lehnt ".." ab (Titel a..b → idea/a..b)', () => {
  assert.equal(isValidImplementBranch(implementBranchName('a..b')), false);
});

test('isValidImplementBranch lehnt ein .lock-Suffix ab (Titel x.lock)', () => {
  assert.equal(isValidImplementBranch(implementBranchName('x.lock')), false);
});

test('isValidImplementBranch lehnt leer/nicht-String ab', () => {
  assert.equal(isValidImplementBranch(''), false);
  assert.equal(isValidImplementBranch(null), false);
});
