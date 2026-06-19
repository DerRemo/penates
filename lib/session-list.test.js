import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeSessions } from './session-list.js';

// Neutrale Default-Deps; jeder Test überschreibt nur das Relevante.
function compose(overrides = {}) {
  return composeSessions({
    live: [],
    known: [],
    sessionPrefix: 'cc-',
    projects: [],
    getHookActivity: () => null,
    getStatusline: () => null,
    getContext: () => ({ tokens: null, model: null, limit: null, pct: null }),
    getGitStatus: () => null,
    isMuted: () => false,
    isPinned: () => false,
    findBoardCard: () => null,
    ...overrides,
  });
}

const liveSession = (o = {}) => ({ name: 'cc-a', created: 1000, windows: 1, attached: false, path: '/p', ...o });
const knownEntry = (o = {}) => ({ name: 'cc-a', directory: '/p', command: 'claude', ...o });

test('classifies a cc-prefixed live session as running', () => {
  const r = compose({ live: [liveSession()] });
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'running');
});

test('classifies a known live session as running even without the cc- prefix', () => {
  const r = compose({ live: [liveSession({ name: 'mysession' })], known: [knownEntry({ name: 'mysession' })] });
  assert.equal(r[0].status, 'running');
});

test('classifies a non-cc, non-known live session as foreign', () => {
  const r = compose({ live: [liveSession({ name: 'randomtmux' })] });
  assert.equal(r[0].status, 'foreign');
});

test('classifies a known session absent from tmux as dormant with mapped fields', () => {
  const r = compose({
    known: [knownEntry({ name: 'cc-d', directory: '/d', command: 'codex', createdAt: '2026-01-01T00:00:00Z', lastSeenAt: 123 })],
  });
  assert.equal(r.length, 1);
  assert.deepEqual(
    { status: r[0].status, path: r[0].path, command: r[0].command, windows: r[0].windows, attached: r[0].attached, lastSeenAt: r[0].lastSeenAt },
    { status: 'dormant', path: '/d', command: 'codex', windows: 0, attached: false, lastSeenAt: 123 },
  );
  assert.equal(r[0].created, Date.parse('2026-01-01T00:00:00Z'));
});

test('orders the output running, then dormant, then foreign', () => {
  const r = compose({
    live: [liveSession({ name: 'cc-run' }), liveSession({ name: 'foreigntmux' })],
    known: [knownEntry({ name: 'cc-run' }), knownEntry({ name: 'cc-dorm' })],
  });
  assert.deepEqual(r.map(s => s.status), ['running', 'dormant', 'foreign']);
});

test('activity falls back to "unknown" without a fresh hook value', () => {
  assert.equal(compose({ live: [liveSession()] })[0].activity, 'unknown');
  assert.equal(compose({ live: [liveSession()], getHookActivity: () => 'idle' })[0].activity, 'idle');
});

test('cost is mapped from the statusline, else null', () => {
  assert.equal(compose({ live: [liveSession()] })[0].cost, null);
  const sl = { costUsd: 1.5, durationMs: 100, linesAdded: 5, linesRemoved: 2 };
  assert.deepEqual(compose({ live: [liveSession()], getStatusline: () => sl })[0].cost,
    { totalUsd: 1.5, durationMs: 100, linesAdded: 5, linesRemoved: 2 });
});

test('context prefers a fresh statusline pct over the JSONL estimate', () => {
  const sl = { contextPct: 42, contextSize: 200000, model: 'opus' };
  const r = compose({ live: [liveSession()], getStatusline: () => sl, getContext: () => { throw new Error('should not be called'); } })[0];
  assert.equal(r.contextPct, 42);
  assert.equal(r.contextLimit, 200000);
  assert.equal(r.contextTokens, Math.round(200000 * 42 / 100));
  assert.equal(r.contextModel, 'opus');
});

test('context falls back to getContext when no fresh statusline pct', () => {
  const r = compose({ live: [liveSession()], getContext: () => ({ tokens: 10, model: 'sonnet', limit: 100, pct: 10 }) })[0];
  assert.equal(r.contextPct, 10);
  assert.equal(r.contextModel, 'sonnet');
  assert.equal(r.contextTokens, 10);
  assert.equal(r.contextLimit, 100);
});

test('context degrades to nulls when getContext throws', () => {
  const r = compose({ live: [liveSession()], getContext: () => { throw new Error('no jsonl'); } })[0];
  assert.deepEqual(
    { pct: r.contextPct, tokens: r.contextTokens, model: r.contextModel, limit: r.contextLimit },
    { pct: null, tokens: null, model: null, limit: null },
  );
});

test('project matches by exact path or subdirectory, else null', () => {
  const projects = [{ id: 'p1', path: '/proj', displayName: 'Proj' }];
  assert.deepEqual(compose({ live: [liveSession({ path: '/proj' })], projects })[0].project, { id: 'p1', name: 'Proj' });
  assert.deepEqual(compose({ live: [liveSession({ path: '/proj/sub' })], projects })[0].project, { id: 'p1', name: 'Proj' });
  assert.equal(compose({ live: [liveSession({ path: '/other' })], projects })[0].project, null);
});

test('boardCard is a minimal subset, null when none or when the lookup throws', () => {
  assert.equal(compose({ live: [liveSession()] })[0].boardCard, null);
  const card = { id: 'c1', title: 'Idea', stage: 'implement', extra: 'ignored' };
  assert.deepEqual(compose({ live: [liveSession()], findBoardCard: () => card })[0].boardCard,
    { id: 'c1', title: 'Idea', stage: 'implement' });
  assert.equal(compose({ live: [liveSession()], findBoardCard: () => { throw new Error('x'); } })[0].boardCard, null);
});

test('muted / pinned / git come from the injected sources', () => {
  const r = compose({ live: [liveSession()], isMuted: () => true, isPinned: () => true, getGitStatus: () => ({ dirty: true }) })[0];
  assert.equal(r.muted, true);
  assert.equal(r.pinned, true);
  assert.deepEqual(r.git, { dirty: true });
});

test('a running session takes its command from known-sessions (tmux omits it)', () => {
  const r = compose({ live: [liveSession({ name: 'cc-a' })], known: [knownEntry({ name: 'cc-a', command: 'codex' })] })[0];
  assert.equal(r.command, 'codex');
});

test('a foreign session with no known entry has a null command', () => {
  const r = compose({ live: [liveSession({ name: 'foreigntmux' })] })[0];
  assert.equal(r.command, null);
});
