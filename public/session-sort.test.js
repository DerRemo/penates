import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionLabel, compareByLabel, isBoardSession,
  partitionOverview, orderSidebar,
} from './session-sort.js';

// Minimal session factory — only fields the ordering logic reads.
const S = (over = {}) => ({ name: 'cc-x', status: 'running', pinned: false, boardCard: null, ...over });

test('sessionLabel strips the cc- prefix', () => {
  assert.equal(sessionLabel(S({ name: 'cc-alpha' })), 'alpha');
});

test('sessionLabel uses the board idea title when present', () => {
  assert.equal(sessionLabel(S({ name: 'cc-slug', boardCard: { title: 'Dark mode' } })), 'Dark mode');
});

test('compareByLabel is case-insensitive', () => {
  assert.ok(compareByLabel(S({ name: 'cc-Apple' }), S({ name: 'cc-banana' })) < 0);
});

test('compareByLabel is natural-numeric (s2 before s10)', () => {
  assert.ok(compareByLabel(S({ name: 'cc-s2' }), S({ name: 'cc-s10' })) < 0);
});

test('isBoardSession requires a board card AND running status', () => {
  assert.equal(isBoardSession(S({ boardCard: { title: 'x' }, status: 'running' })), true);
  assert.equal(isBoardSession(S({ boardCard: { title: 'x' }, status: 'dormant' })), false);
  assert.equal(isBoardSession(S({ boardCard: null })), false);
});

test('partitionOverview: pinned running + pinned dormant land in pinned, alphabetical', () => {
  const zzz = S({ name: 'cc-zzz', status: 'running', pinned: true });
  const apple = S({ name: 'cc-apple', status: 'dormant', pinned: true });
  const g = partitionOverview([zzz, apple]);
  assert.deepEqual(g.pinned.map(s => s.name), ['cc-apple', 'cc-zzz']);
  assert.equal(g.active.length, 0);
  assert.equal(g.dormant.length, 0);
});

test('partitionOverview: a pinned board session stays in board and floats to its top', () => {
  const pinnedBoard = S({ name: 'cc-zeta', status: 'running', pinned: true, boardCard: { title: 'Zeta idea' } });
  const plainBoard  = S({ name: 'cc-alpha', status: 'running', pinned: false, boardCard: { title: 'Alpha idea' } });
  const g = partitionOverview([plainBoard, pinnedBoard]);
  assert.deepEqual(g.board.map(s => s.name), ['cc-zeta', 'cc-alpha']); // pinned first, then alpha
  assert.equal(g.pinned.length, 0); // NOT pulled into Angeheftet
});

test('partitionOverview: foreign sessions never enter pinned and stay in foreign', () => {
  const f = S({ name: 'cc-f', status: 'foreign', pinned: true }); // defensive: foreign w/ stray pinned
  const g = partitionOverview([f]);
  assert.equal(g.pinned.length, 0);
  assert.deepEqual(g.foreign.map(s => s.name), ['cc-f']);
});

test('partitionOverview: unpinned running→active, unpinned dormant→dormant, each alphabetical', () => {
  const r2 = S({ name: 'cc-b', status: 'running' });
  const r1 = S({ name: 'cc-a', status: 'running' });
  const d1 = S({ name: 'cc-d', status: 'dormant' });
  const g = partitionOverview([r2, r1, d1]);
  assert.deepEqual(g.active.map(s => s.name), ['cc-a', 'cc-b']);
  assert.deepEqual(g.dormant.map(s => s.name), ['cc-d']);
});

test('partitionOverview: every session lands in exactly one group', () => {
  const list = [
    S({ name: 'cc-p', pinned: true }),
    S({ name: 'cc-b', boardCard: { title: 'B' } }),
    S({ name: 'cc-r' }),
    S({ name: 'cc-d', status: 'dormant' }),
    S({ name: 'cc-f', status: 'foreign' }),
  ];
  const g = partitionOverview(list);
  const total = g.pinned.length + g.board.length + g.active.length + g.dormant.length + g.foreign.length;
  assert.equal(total, list.length);
});

test('orderSidebar: pinned first then alphabetical, no attached-first', () => {
  const zzz = S({ name: 'cc-zzz', pinned: true, attached: false });
  const aaa = S({ name: 'cc-aaa', pinned: false, attached: true }); // attached must NOT win
  assert.deepEqual(orderSidebar([aaa, zzz]).map(s => s.name), ['cc-zzz', 'cc-aaa']);
});

test('partitionOverview tolerates non-array input', () => {
  const g = partitionOverview(undefined);
  assert.deepEqual(g, { pinned: [], board: [], active: [], dormant: [], foreign: [] });
});
