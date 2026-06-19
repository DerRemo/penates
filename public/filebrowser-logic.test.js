import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  highlightMatch, selectionRange, seqGate, moveCopyDecision,
  dropEffect, resolveFileSource, breadcrumbRootName, nextBackoff, isEntryVisible,
} from './filebrowser-logic.js';

// ── highlightMatch ──
test('highlightMatch: no match → escaped name only', () => {
  assert.equal(highlightMatch('a&b<c>', null), 'a&amp;b&lt;c&gt;');
  assert.equal(highlightMatch('x"y', { indices: [] }), 'x&quot;y');
});
test('highlightMatch: single range wraps matched slice', () => {
  assert.equal(highlightMatch('readme', { indices: [[0, 2]] }), '<span class="hl">rea</span>dme');
});
test('highlightMatch: multiple ranges + escaping around', () => {
  assert.equal(highlightMatch('a<b>c', { indices: [[0, 0], [2, 2]] }),
    '<span class="hl">a</span>&lt;<span class="hl">b</span>&gt;c');
});

// ── selectionRange ──
test('selectionRange: forward range inclusive', () => {
  assert.deepEqual(selectionRange(['a', 'b', 'c', 'd'], 'b', 'd'), ['b', 'c', 'd']);
});
test('selectionRange: reverse range normalized', () => {
  assert.deepEqual(selectionRange(['a', 'b', 'c', 'd'], 'd', 'b'), ['b', 'c', 'd']);
});
test('selectionRange: same anchor and target → single', () => {
  assert.deepEqual(selectionRange(['a', 'b'], 'b', 'b'), ['b']);
});
test('selectionRange: anchor or target missing → null', () => {
  assert.equal(selectionRange(['a', 'b'], 'zzz', 'b'), null);
  assert.equal(selectionRange(['a', 'b'], 'a', 'zzz'), null);
});

// ── seqGate ──
test('seqGate: first event (last=0) accepts', () => {
  assert.deepEqual(seqGate(0, 5), { accept: true, next: 5 });
});
test('seqGate: lower/equal seq rejected, keeps last', () => {
  assert.deepEqual(seqGate(5, 3), { accept: false, next: 5 });
  assert.deepEqual(seqGate(5, 5), { accept: false, next: 5 });
});
test('seqGate: higher seq accepted', () => {
  assert.deepEqual(seqGate(5, 6), { accept: true, next: 6 });
});
test('seqGate: non-number seq accepted, last unchanged', () => {
  assert.deepEqual(seqGate(5, undefined), { accept: true, next: 5 });
});

// ── moveCopyDecision ──
test('moveCopyDecision: move into own parent → noop', () => {
  assert.equal(moveCopyDecision('a/b/c', 'a/b', false), 'noop');
});
test('moveCopyDecision: copy into own parent → apply', () => {
  assert.equal(moveCopyDecision('a/b/c', 'a/b', true), 'apply');
});
test('moveCopyDecision: into self or descendant → self-error', () => {
  assert.equal(moveCopyDecision('a/b', 'a/b', false), 'self-error');
  assert.equal(moveCopyDecision('a/b', 'a/b/c', false), 'self-error');
});
test('moveCopyDecision: into other dir → apply', () => {
  assert.equal(moveCopyDecision('a/b/c', 'x', false), 'apply');
});

// ── dropEffect ──
test('dropEffect: files always copy', () => {
  assert.equal(dropEffect(true, false), 'copy');
  assert.equal(dropEffect(true, true), 'copy');
});
test('dropEffect: internal move unless modifier', () => {
  assert.equal(dropEffect(false, false), 'move');
  assert.equal(dropEffect(false, true), 'copy');
});

// ── resolveFileSource ──
const findMatch = (path, cache) => cache.find(p => p.path === path) || null;
test('resolveFileSource: project match wins', () => {
  const session = { name: 'cc-x', path: '/p' };
  const cache = [{ id: 'proj1', path: '/p', displayName: 'Proj', name: 'proj' }];
  assert.deepEqual(resolveFileSource(session, cache, findMatch, 'cc-x'),
    { id: 'proj1', path: '/p', name: 'Proj', needsRetry: false });
});
test('resolveFileSource: no match → session pseudo-id', () => {
  const session = { name: 'cc-x', path: '/q' };
  assert.deepEqual(resolveFileSource(session, [], findMatch, 'cc-x'),
    { id: 'session:cc-x', path: '/q', name: 'cc-x', needsRetry: false });
});
test('resolveFileSource: cold cache → needsRetry', () => {
  const session = { name: 'cc-x', path: '/q' };
  assert.deepEqual(resolveFileSource(session, null, findMatch, 'cc-x'),
    { id: 'session:cc-x', path: '/q', name: 'cc-x', needsRetry: true });
});
test('resolveFileSource: no session object', () => {
  assert.deepEqual(resolveFileSource(null, null, findMatch, 'cc-x'),
    { id: 'session:cc-x', path: '', name: 'cc-x', needsRetry: false });
});

// ── breadcrumbRootName ──
test('breadcrumbRootName: name wins', () => {
  assert.equal(breadcrumbRootName({ name: 'My', path: '/a/b' }), 'My');
});
test('breadcrumbRootName: falls back to last path segment', () => {
  assert.equal(breadcrumbRootName({ path: '/a/b/c' }), 'c');
  assert.equal(breadcrumbRootName({ path: '/a/b/c/' }), 'c');
});
test('breadcrumbRootName: null/empty → slash', () => {
  assert.equal(breadcrumbRootName(null), '/');
  assert.equal(breadcrumbRootName({ path: '' }), '/');
});

// ── nextBackoff ──
test('nextBackoff: doubles, caps at 30s', () => {
  assert.equal(nextBackoff(500), 1000);
  assert.equal(nextBackoff(20000), 30000);
  assert.equal(nextBackoff(30000), 30000);
});

// ── isEntryVisible ──
test('isEntryVisible: hides ignored only when hideIgnored on', () => {
  assert.equal(isEntryVisible({ ignored: true }, true), false);
  assert.equal(isEntryVisible({ ignored: true }, false), true);
  assert.equal(isEntryVisible({ ignored: false }, true), true);
});
