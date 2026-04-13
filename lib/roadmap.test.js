// Tests für lib/roadmap.js — node --test lib/roadmap.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadmap } from './roadmap.js';

// ── Test 1: Erkennt Released- und Dev-Versions-Header ─────────────────────────
test('erkennt Released- und Dev-Versions-Header', () => {
  const md = ['# My Project', '', '## Released: v1.2.0', '', '## In Entwicklung: v1.3.0', ''].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.released.version, '1.2.0');
  assert.equal(r.dev.version, '1.3.0');
  assert.deepEqual(r.released.items, []);
  assert.deepEqual(r.dev.items, []);
});

// ── Test 2: Leerer Input → leere Struktur ─────────────────────────────────────
test('leerer Input ergibt leere Struktur', () => {
  const r = parseRoadmap('');
  assert.equal(r.released.version, null);
  assert.equal(r.dev.version, null);
  assert.deepEqual(r.backlog, []);
  assert.equal(r.changelog, '');
});

// ── Test 3: Unbekannte H2 landen in unknown[], Items werden verworfen ──────────
test('unbekannte H2 landen in unknown[], Items werden nicht gesammelt', () => {
  const r = parseRoadmap('## Something Else\n- [ ] foo');
  assert.deepEqual(r.unknown, ['Something Else']);
  // foo darf NICHT in backlog/released/dev landen
  assert.deepEqual(r.backlog, []);
  assert.deepEqual(r.released.items, []);
  assert.deepEqual(r.dev.items, []);
});

// ── Test 4: Checkbox-Items mit done-Flags, Texten und 1-basierten Zeilennummern ─
test('sammelt Checkbox-Items mit korrekten done-Flags, Texten und line-Nummern', () => {
  const md = [
    '## Released: v1.0.0',      // line 1
    '- [x] Feature A',           // line 2
    '- [x] Feature B',           // line 3
    '',                          // line 4
    '## In Entwicklung: v1.1.0', // line 5
    '- [ ] Feature C',           // line 6
    '- [x] Feature D',           // line 7
    '',                          // line 8
    '## Backlog / Ideen',        // line 9
    '- [ ] Idea X',              // line 10
    '- [ ] Idea Y',              // line 11
  ].join('\n');
  const r = parseRoadmap(md);

  assert.equal(r.released.items.length, 2);
  assert.equal(r.released.items[0].done, true);
  assert.equal(r.released.items[0].text, 'Feature A');
  assert.equal(r.released.items[0].line, 2);
  assert.equal(r.released.items[1].done, true);
  assert.equal(r.released.items[1].text, 'Feature B');
  assert.equal(r.released.items[1].line, 3);

  assert.equal(r.dev.items[0].done, false);
  assert.equal(r.dev.items[0].text, 'Feature C');
  assert.equal(r.dev.items[0].line, 6);
  assert.equal(r.dev.items[1].done, true);
  assert.equal(r.dev.items[1].text, 'Feature D');
  assert.equal(r.dev.items[1].line, 7);

  assert.equal(r.backlog.length, 2);
  assert.equal(r.backlog[0].text, 'Idea X');
  assert.equal(r.backlog[0].line, 10);
  assert.equal(r.backlog[1].text, 'Idea Y');
  assert.equal(r.backlog[1].line, 11);
});

// ── Test 5: Metadata-Suffix wird korrekt extrahiert ───────────────────────────
test('Metadata-Suffix wird korrekt extrahiert', () => {
  const md = [
    '## In Entwicklung: v2.0.0',
    '- [ ] Feature X {priority: high, effort: 2d}',
    '- [x] Feature Y {owner: rocky}',
    '- [ ] Feature Z',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.dev.items[0].text, 'Feature X');
  assert.deepEqual(r.dev.items[0].meta, { priority: 'high', effort: '2d' });
  assert.deepEqual(r.dev.items[1].meta, { owner: 'rocky' });
  assert.deepEqual(r.dev.items[2].meta, {});
});

// ── Test 6: Changelog wird als Rohtext gesammelt ──────────────────────────────
test('Changelog wird als Rohtext gesammelt, Checkboxes darin werden ignoriert', () => {
  const md = [
    '## Released: v1.0.0',
    '- [x] A',
    '',
    '## Changelog',
    '### v1.0.0 (2026-04-10)',
    '- Initial release',
    '- Bugfix for X',
    '',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.match(r.changelog, /### v1\.0\.0/);
  assert.match(r.changelog, /Initial release/);
  assert.equal(r.released.items.length, 1);
  // Die "- Initial release" Zeile darf nicht als Item gewertet werden
  // (kein Checkbox-Format, aber sicher ist sicher)
  assert.equal(r.released.items[0].text, 'A');
});

// ── Test 7: Checkbox in Changelog-Section wird nicht als Item interpretiert ───
test('Checkbox-Zeilen in Changelog werden nicht als Items gesammelt', () => {
  const md = [
    '## Changelog',
    '- [x] This looks like an item but is in changelog',
    '- [ ] So does this',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.match(r.changelog, /This looks like an item/);
  assert.deepEqual(r.backlog, []);
  assert.deepEqual(r.released.items, []);
  assert.deepEqual(r.dev.items, []);
});

// ── Test 8: Meta-Suffix ohne Komma (single key-value pair) ────────────────────
test('Meta-Suffix mit einzelnem Key-Value ohne Komma', () => {
  const md = [
    '## Backlog',
    '- [ ] Solo task {tag: important}',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.backlog[0].text, 'Solo task');
  assert.deepEqual(r.backlog[0].meta, { tag: 'important' });
});

// ── Test 9: Mehrere unknown-Sections ──────────────────────────────────────────
test('mehrere unbekannte H2-Sections werden alle in unknown[] gesammelt', () => {
  const md = [
    '## Alpha',
    '- [ ] item a',
    '## Beta',
    '- [ ] item b',
    '## Backlog',
    '- [ ] real item',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.deepEqual(r.unknown, ['Alpha', 'Beta']);
  assert.equal(r.backlog.length, 1);
  assert.equal(r.backlog[0].text, 'real item');
});

// ── Test 10: CRLF-Inputs werden korrekt verarbeitet ───────────────────────────
test('CRLF-Zeilenenden werden korrekt verarbeitet', () => {
  const md = '## Released: v2.0.0\r\n- [x] Windows item\r\n- [ ] Another\r\n';
  const r = parseRoadmap(md);
  assert.equal(r.released.version, '2.0.0');
  assert.equal(r.released.items.length, 2);
  assert.equal(r.released.items[0].text, 'Windows item');
  assert.equal(r.released.items[0].done, true);
  assert.equal(r.released.items[1].done, false);
});

// ── Test 11: Case-insensitive Section-Erkennung ───────────────────────────────
test('Section-Erkennung ist case-insensitive', () => {
  const md = [
    '## RELEASED: v3.0.0',
    '- [X] uppercase done flag',
    '## in entwicklung: v3.1.0',
    '- [ ] dev item',
    '## BACKLOG',
    '- [ ] backlog item',
    '## CHANGELOG',
    'some changelog text',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.released.version, '3.0.0');
  assert.equal(r.released.items[0].done, true);  // [X] uppercase
  assert.equal(r.dev.version, '3.1.0');
  assert.equal(r.dev.items[0].text, 'dev item');
  assert.equal(r.backlog[0].text, 'backlog item');
  assert.match(r.changelog, /some changelog text/);
});

// ── Test 12: Backlog ohne "/ Ideen" Suffix ────────────────────────────────────
test('Backlog-Header ohne / Ideen Suffix wird erkannt', () => {
  const md = '## Backlog\n- [ ] plain backlog item';
  const r = parseRoadmap(md);
  assert.equal(r.backlog.length, 1);
  assert.equal(r.backlog[0].text, 'plain backlog item');
});

// ── Test 13: Indented Checkboxen werden ignoriert ─────────────────────────────
test('parseRoadmap — indented checkboxes werden ignoriert (keine Nested-Items)', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Top-Level Item',
    '  - [ ] Nested Sub-Item',
    '    - [x] Deep Nested',
    '- [ ] Another Top-Level',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.backlog.length, 2);
  assert.equal(r.backlog[0].text, 'Top-Level Item');
  assert.equal(r.backlog[1].text, 'Another Top-Level');
});

// ── Test 14: Leere Metadata-Klammern {} liefern leeres meta-Objekt ────────────
test('parseRoadmap — leere Metadata-Klammern {} liefern leeres meta-Objekt', () => {
  const r = parseRoadmap('## Backlog / Ideen\n- [ ] foo {}');
  assert.equal(r.backlog[0].text, 'foo');
  assert.deepEqual(r.backlog[0].meta, {});
});

// ── Test 15: Doppelpunkt im Meta-Value bleibt erhalten ────────────────────────
test('parseRoadmap — Doppelpunkt im Meta-Value bleibt erhalten (nur erster : splittet)', () => {
  const r = parseRoadmap('## Backlog / Ideen\n- [ ] bar {url: https://example.com/x:y}');
  assert.deepEqual(r.backlog[0].meta, { url: 'https://example.com/x:y' });
});
