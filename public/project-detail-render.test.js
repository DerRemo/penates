import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionCount, reorderTargetIndex, focusTag, releaseButtonState,
  renderItem, renderSection, changelogSection, renderSessionItem,
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

// Shared stub deps for the template builders.
const T = (k) => k; // identity translator — assert keys, not localized text
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pills = (meta) => meta ? `<span class="roadmap-meta">${Object.keys(meta).join(',')}</span>` : '';
const DEPS = { t: T, escapeHtml: esc, renderMetaPills: pills };

// ── renderItem ──
test('renderItem: open item has no done class, escapes text', () => {
  const html = renderItem({ done: false, line: 12, text: 'a & <b>', meta: null }, 'released', 0, DEPS);
  assert.match(html, /class="roadmap-item"/);
  assert.match(html, /data-section="released"/);
  assert.match(html, /data-line="12"/);
  assert.match(html, /data-index="0"/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /a &amp; &lt;b&gt;/);
  assert.match(html, /\[ \]/);
});
test('renderItem: done item has done class and [x]', () => {
  const html = renderItem({ done: true, line: 3, text: 'x', meta: null }, 'dev', 1, DEPS);
  assert.match(html, /class="roadmap-item done"/);
  assert.match(html, /\[x\]/);
});
test('renderItem: meta pills rendered when present', () => {
  const html = renderItem({ done: false, line: 1, text: 'x', meta: { priority: 'p1' } }, 'dev', 0, DEPS);
  assert.match(html, /<span class="roadmap-meta">priority<\/span>/);
});

// ── renderSection ──
test('renderSection: collapsed adds class + aria-expanded=false', () => {
  const html = renderSection({ label: 'Released', version: '1.0.0', items: [{ done: true }], sectionKey: 'released', collapsed: true }, DEPS);
  assert.match(html, /class="roadmap-section collapsed"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /roadmap-version[^>]*>v1\.0\.0</);
  assert.match(html, /roadmap-section-count">1\/1</);
});
test('renderSection: no version → no version pill', () => {
  const html = renderSection({ label: 'Dev', version: undefined, items: [], sectionKey: 'dev', collapsed: false }, DEPS);
  assert.doesNotMatch(html, /roadmap-version/);
  assert.match(html, /class="roadmap-section"/);
});
test('renderSection: empty list → roadmap-empty + still an add button', () => {
  const html = renderSection({ label: 'Dev', version: '1.1.0', items: [], sectionKey: 'dev', collapsed: false }, DEPS);
  assert.match(html, /class="roadmap-empty"/);
  assert.match(html, /roadmap-add-btn[^>]*data-section="dev"/);
  assert.doesNotMatch(html, /roadmap-list/);
});
test('renderSection: non-empty renders a list of items', () => {
  const html = renderSection({ label: 'Released', version: '1.0.0', items: [{ done: true, line: 1, text: 'a', meta: null }], sectionKey: 'released', collapsed: false }, DEPS);
  assert.match(html, /<ul class="roadmap-list">/);
  assert.match(html, /class="roadmap-item done"/);
});

// ── changelogSection ──
test('changelogSection: empty changelog → empty string', () => {
  assert.equal(changelogSection('', false, { t: T, escapeHtml: esc }), '');
  assert.equal(changelogSection(null, false, { t: T, escapeHtml: esc }), '');
});
test('changelogSection: present → escaped pre + data-section', () => {
  const html = changelogSection('v1 & <stuff>', true, { t: T, escapeHtml: esc });
  assert.match(html, /data-section="changelog"/);
  assert.match(html, /class="roadmap-section collapsed"/);
  assert.match(html, /<pre class="roadmap-changelog">v1 &amp; &lt;stuff&gt;<\/pre>/);
});

// ── renderSessionItem ──
test('renderSessionItem: cwd equal → dot path, cc- stripped, running', () => {
  const html = renderSessionItem({ name: 'cc-foo', path: '/p', status: 'running' }, '/p', { escapeHtml: esc });
  assert.match(html, /data-status="running"/);
  assert.match(html, /data-name="cc-foo"/);
  assert.match(html, /project-session-name">foo</);
  assert.match(html, /project-session-path[^>]*>\.</);
});
test('renderSessionItem: sub-path slice + dormant status', () => {
  const html = renderSessionItem({ name: 'cc-bar', path: '/p/sub/dir', status: 'dormant' }, '/p', { escapeHtml: esc });
  assert.match(html, /data-status="dormant"/);
  assert.match(html, /title="dormant"/);
  assert.match(html, /project-session-path[^>]*>sub\/dir</);
});
test('renderSessionItem: missing status defaults to running in data-status', () => {
  const html = renderSessionItem({ name: 'cc-x', path: '/p', status: undefined }, '/p', { escapeHtml: esc });
  assert.match(html, /data-status="running"/);
});
