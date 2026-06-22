import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionCount, reorderTargetIndex, focusTag, releaseButtonState,
} from './project-detail-render.js';

// ── sectionCount ──
test('sectionCount: released shows done/total', () => {
  assert.equal(sectionCount('released', [{ done: true }, { done: false }, { done: true }]), '2/3');
});
test('sectionCount: dev all done', () => {
  assert.equal(sectionCount('dev', [{ done: true }, { done: true }]), '2/2');
});
test('sectionCount: other section shows bare total', () => {
  assert.equal(sectionCount('changelog', [{ done: false }, { done: false }]), '2');
});
test('sectionCount: empty list', () => {
  assert.equal(sectionCount('released', []), '0/0');
  assert.equal(sectionCount('backlog', []), '0');
});

// ── reorderTargetIndex ──
test('reorderTargetIndex: move down (drop-after lower index, src above target)', () => {
  // src=0, target idx=2, after=true → to=3 → src<to → 2
  assert.equal(reorderTargetIndex(0, 2, true), 2);
});
test('reorderTargetIndex: move up (src below target, before)', () => {
  // src=3, target idx=1, after=false → to=1 → src>to → 1
  assert.equal(reorderTargetIndex(3, 1, false), 1);
});
test('reorderTargetIndex: no-op same slot before', () => {
  // src=2, target idx=2, after=false → to=2 → src===to → null
  assert.equal(reorderTargetIndex(2, 2, false), null);
});
test('reorderTargetIndex: no-op same slot after', () => {
  // src=2, target idx=2, after=true → to=3 → src<to → 2 === src → null
  assert.equal(reorderTargetIndex(2, 2, true), null);
});
test('reorderTargetIndex: drop-after at end moves below', () => {
  // src=0, target idx=3, after=true → to=4 → src<to → 3
  assert.equal(reorderTargetIndex(0, 3, true), 3);
});

// ── focusTag ──
const stubClassList = (...names) => ({ contains: (n) => names.includes(n) });
test('focusTag: checkbox', () => {
  assert.equal(focusTag(stubClassList('roadmap-checkbox')), 'checkbox');
});
test('focusTag: delete', () => {
  assert.equal(focusTag(stubClassList('roadmap-item-delete')), 'delete');
});
test('focusTag: neither → null', () => {
  assert.equal(focusTag(stubClassList('roadmap-text')), null);
});

// ── releaseButtonState ──
test('releaseButtonState: dev items + both versions → show', () => {
  assert.deepEqual(
    releaseButtonState({ dev: { items: [{}], version: '1.1.0' }, released: { version: '1.0.0' } }),
    { show: true, dev: '1.1.0', released: '1.0.0' },
  );
});
test('releaseButtonState: no dev items → hide', () => {
  assert.deepEqual(
    releaseButtonState({ dev: { items: [], version: '1.1.0' }, released: { version: '1.0.0' } }),
    { show: false, dev: '1.1.0', released: '1.0.0' },
  );
});
test('releaseButtonState: missing released version → hide', () => {
  assert.deepEqual(
    releaseButtonState({ dev: { items: [{}], version: '1.1.0' }, released: {} }),
    { show: false, dev: '1.1.0', released: undefined },
  );
});
test('releaseButtonState: no dev/released objects → hide, undefined versions', () => {
  assert.deepEqual(releaseButtonState({}), { show: false, dev: undefined, released: undefined });
});
