// Tests für lib/roadmap-writer.js — node --test lib/roadmap-writer.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleItem, deleteItem, addItem } from './roadmap-writer.js';

// ─── Fixture-Helpers ──────────────────────────────────────────────────────────

function doc(...lines) {
  return lines.join('\n');
}

// ─── toggleItem ───────────────────────────────────────────────────────────────

// Test 1: [ ] → [x], neighbors untouched, returned item shape
test('toggleItem — [ ] → [x], returned item hat done:true, text, line', () => {
  const content = doc(
    '## Released: v1.0.0',  // line 1
    '- [ ] Feature A',       // line 2
    '- [x] Feature B',       // line 3
  );
  const { content: out, item } = toggleItem(content, 2);
  const lines = out.split('\n');
  assert.equal(lines[1], '- [x] Feature A');  // flipped
  assert.equal(lines[2], '- [x] Feature B');  // untouched
  assert.equal(item.done, true);
  assert.equal(item.text, 'Feature A');
  assert.equal(item.line, 2);
  assert.deepEqual(item.meta, {});
});

// Test 2: [x] → [ ], returned item has done:false
test('toggleItem — [x] → [ ], returned item hat done:false', () => {
  const content = doc(
    '## Released: v1.0.0',  // line 1
    '- [x] Done',            // line 2
  );
  const { content: out, item } = toggleItem(content, 2);
  const lines = out.split('\n');
  assert.equal(lines[1], '- [ ] Done');
  assert.equal(item.done, false);
});

// Test 3: metadata suffix preserved byte-for-byte
test('toggleItem — Metadata-Suffix bleibt byte-for-byte erhalten', () => {
  const content = doc(
    '## In Entwicklung: v2.0.0', // line 1
    '- [ ] Feature X {priority: high, effort: 2d}', // line 2
  );
  const { content: out, item } = toggleItem(content, 2);
  const lines = out.split('\n');
  assert.equal(lines[1], '- [x] Feature X {priority: high, effort: 2d}');
  assert.equal(item.done, true);
  assert.equal(item.text, 'Feature X');
  assert.deepEqual(item.meta, { priority: 'high', effort: '2d' });
  assert.equal(item.line, 2);
});

// Test 4: throws 'stale' for H2 line (not a checkbox)
test('toggleItem — wirft stale für H2-Zeile', () => {
  const content = doc(
    '## Released: v1.0.0',
    '- [ ] Feature A',
  );
  assert.throws(() => toggleItem(content, 1), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
});

// Test 5: throws 'stale' for out-of-range line number
test('toggleItem — wirft stale für out-of-range Zeilennummer', () => {
  const content = doc('## Backlog', '- [ ] Item');
  assert.throws(() => toggleItem(content, 99), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
  assert.throws(() => toggleItem(content, 0), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
});

// Test 6: CRLF input produces LF output with correct flip
test('toggleItem — CRLF Input → LF Output mit korrektem Toggle', () => {
  const content = '## Released: v1.0.0\r\n- [ ] Win item\r\n- [x] Other\r\n';
  const { content: out, item } = toggleItem(content, 2);
  assert.ok(!out.includes('\r'), 'output should not contain CR');
  const lines = out.split('\n');
  assert.equal(lines[1], '- [x] Win item');
  assert.equal(lines[2], '- [x] Other');
  assert.equal(item.done, true);
  assert.equal(item.line, 2);
});

// Edge: uppercase [X] toggles to [ ]
test('toggleItem — [X] (uppercase) → [ ] (done:false)', () => {
  const content = doc('## Backlog', '- [X] Uppercase done');
  const { content: out, item } = toggleItem(content, 2);
  assert.equal(out.split('\n')[1], '- [ ] Uppercase done');
  assert.equal(item.done, false);
});

// ─── deleteItem ───────────────────────────────────────────────────────────────

// Test 7: removes only the target line, surrounding lines untouched
test('deleteItem — entfernt nur die Zielzeile, Nachbarn bleiben', () => {
  const content = doc(
    '## Backlog',         // line 1
    '- [ ] Item A',       // line 2
    '',                   // line 3
    '- [ ] Item B',       // line 4
    '- [ ] Item C',       // line 5
  );
  const { content: out } = deleteItem(content, 4);
  const lines = out.split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '## Backlog');
  assert.equal(lines[1], '- [ ] Item A');
  assert.equal(lines[2], '');
  assert.equal(lines[3], '- [ ] Item C');
});

// Test 8: deleting the only item in a section leaves header and blank line intact
test('deleteItem — einziges Item entfernen lässt Header und Leerzeile erhalten', () => {
  const content = doc(
    '## Backlog',       // line 1
    '- [ ] Only Item',  // line 2
    '',                 // line 3
    '## Changelog',     // line 4
    'some text',        // line 5
  );
  const { content: out } = deleteItem(content, 2);
  const lines = out.split('\n');
  assert.equal(lines[0], '## Backlog');
  assert.equal(lines[1], '');
  assert.equal(lines[2], '## Changelog');
  assert.equal(lines[3], 'some text');
});

// Test 9: throws 'stale' for non-item line
test('deleteItem — wirft stale für Nicht-Item-Zeile (H2)', () => {
  const content = doc('## Backlog', '- [ ] Item');
  assert.throws(() => deleteItem(content, 1), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
});

// Test 10: throws 'stale' for out-of-range line
test('deleteItem — wirft stale für out-of-range Zeilennummer', () => {
  const content = doc('## Backlog', '- [ ] Item');
  assert.throws(() => deleteItem(content, 99), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
  assert.throws(() => deleteItem(content, 0), (err) => {
    assert.equal(err.message, 'stale');
    return true;
  });
});

test('deleteItem — Rückgabe-Objekt enthält KEIN item-Feld (Spec)', () => {
  const md = '## Backlog / Ideen\n- [ ] A\n- [ ] B';
  const result = deleteItem(md, 2);
  assert.equal('item' in result, false, 'deleteItem darf kein item zurückgeben');
});

// ─── addItem ──────────────────────────────────────────────────────────────────

// Test 11: appends to non-empty backlog at end of last item (before next H2)
test('addItem — hängt an nicht-leeren Backlog ans Ende, vor nächstem H2', () => {
  const content = doc(
    '## Backlog',          // line 1
    '- [ ] Existing',      // line 2
    '',                    // line 3
    '## Changelog',        // line 4
    'notes',               // line 5
  );
  const { content: out, item } = addItem(content, 'backlog', 'New Task');
  const lines = out.split('\n');
  // New line inserted after line 2 (last item of backlog), before blank line
  assert.equal(lines[0], '## Backlog');
  assert.equal(lines[1], '- [ ] Existing');
  assert.equal(lines[2], '- [ ] New Task');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '## Changelog');
  assert.equal(item.done, false);
  assert.equal(item.text, 'New Task');
  assert.equal(item.line, 3);
});

// Test 12: inserts into an empty section directly after H2
test('addItem — leere Section: fügt direkt nach H2 ein', () => {
  const content = doc(
    '## Backlog',     // line 1
    '',               // line 2
    '## Changelog',   // line 3
  );
  const { content: out, item } = addItem(content, 'backlog', 'First Task');
  const lines = out.split('\n');
  assert.equal(lines[0], '## Backlog');
  assert.equal(lines[1], '- [ ] First Task');
  assert.equal(lines[2], '');
  assert.equal(lines[3], '## Changelog');
  assert.equal(item.line, 2);
});

// Test 13: serializes meta with keys alphabetically sorted
test('addItem — Meta-Keys werden alphabetisch sortiert serialisiert', () => {
  const { content: out, item } = addItem(
    doc('## Backlog', '- [ ] Existing'),
    'backlog',
    'Tagged',
    { priority: 'high', effort: '2d', owner: 'rocky' }
  );
  const lines = out.split('\n');
  // effort < owner < priority alphabetically
  assert.equal(lines[2], '- [ ] Tagged {effort: 2d, owner: rocky, priority: high}');
  assert.deepEqual(item.meta, { effort: '2d', owner: 'rocky', priority: 'high' });
});

// Test 14: inserts into released section (before next section's H2)
test('addItem — fügt in Released-Section ein (vor nächstem H2)', () => {
  const content = doc(
    '## Released: v1.0.0',   // line 1
    '- [x] Feature A',       // line 2
    '',                      // line 3
    '## Backlog',            // line 4
    '- [ ] Idea',            // line 5
  );
  const { content: out, item } = addItem(content, 'released', 'Feature B');
  const lines = out.split('\n');
  assert.equal(lines[0], '## Released: v1.0.0');
  assert.equal(lines[1], '- [x] Feature A');
  assert.equal(lines[2], '- [ ] Feature B');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '## Backlog');
  assert.equal(item.line, 3);
  assert.equal(item.text, 'Feature B');
});

// Test 15: throws 'section-not-found' when section not in document
test('addItem — wirft section-not-found wenn Section fehlt', () => {
  const content = doc('## Backlog', '- [ ] Item');
  assert.throws(() => addItem(content, 'released', 'New'), (err) => {
    assert.equal(err.message, 'section-not-found');
    return true;
  });
  assert.throws(() => addItem(content, 'dev', 'New'), (err) => {
    assert.equal(err.message, 'section-not-found');
    return true;
  });
});

// Test 16: no meta → no suffix on new line
test('addItem — kein Meta → kein Suffix auf der neuen Zeile', () => {
  const content = doc('## Backlog', '- [ ] Existing');
  // undefined
  const { content: out1 } = addItem(content, 'backlog', 'No Meta');
  assert.ok(!out1.split('\n')[2].includes('{'), 'no { when meta is undefined');
  // empty object
  const { content: out2 } = addItem(content, 'backlog', 'No Meta', {});
  assert.ok(!out2.split('\n')[2].includes('{'), 'no { when meta is {}');
});

// Test 17: returned item.line points to newly inserted line
test('addItem — item.line zeigt auf die neu eingefügte Zeile (1-basiert)', () => {
  const content = doc(
    '## Backlog',         // line 1
    '- [ ] First',        // line 2
    '- [ ] Second',       // line 3
    '- [ ] Third',        // line 4
  );
  const { content: out, item } = addItem(content, 'backlog', 'Fourth');
  const lines = out.split('\n');
  assert.equal(lines[item.line - 1], '- [ ] Fourth');
  assert.equal(item.line, 5);
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

// Edge: addItem to section at very end of file without trailing newline
test('addItem — Section am Dateiende ohne abschließenden Newline', () => {
  const content = '## Backlog\n- [ ] Only';  // no trailing newline
  const { content: out, item } = addItem(content, 'backlog', 'Last');
  const lines = out.split('\n');
  assert.equal(lines[lines.length - 1], '- [ ] Last');
  assert.equal(item.line, 3);
});

// Edge: unicode text passes through correctly
test('toggleItem / addItem — Unicode-Text bleibt erhalten', () => {
  const content = doc('## Backlog', '- [ ] Ümlaut & ⏺ Symbol');
  const { content: out, item } = toggleItem(content, 2);
  assert.equal(item.text, 'Ümlaut & ⏺ Symbol');
  const lines = out.split('\n');
  assert.equal(lines[1], '- [x] Ümlaut & ⏺ Symbol');
});

// Edge: metadata with spaces in values
test('addItem — Meta-Values mit Leerzeichen bleiben erhalten', () => {
  const content = doc('## Backlog', '- [ ] Item');
  const { content: out } = addItem(content, 'backlog', 'Task', { note: 'needs more work', owner: 'rocky' });
  const lines = out.split('\n');
  assert.equal(lines[2], '- [ ] Task {note: needs more work, owner: rocky}');
});

// Edge: addItem dev section inserts before next H2
test('addItem — Dev-Section: Einfügen vor nächstem H2', () => {
  const content = doc(
    '## In Entwicklung: v2.0.0',  // line 1
    '- [ ] Task A',               // line 2
    '',                           // line 3
    '## Backlog',                 // line 4
  );
  const { content: out, item } = addItem(content, 'dev', 'Task B');
  const lines = out.split('\n');
  assert.equal(lines[0], '## In Entwicklung: v2.0.0');
  assert.equal(lines[1], '- [ ] Task A');
  assert.equal(lines[2], '- [ ] Task B');
  assert.equal(lines[3], '');
  assert.equal(lines[4], '## Backlog');
  assert.equal(item.line, 3);
});

// ─── Fix 1: addItem rejects trailing {…} in text ─────────────────────────────

test('addItem — wirft "text-has-trailing-braces" bei Text der mit {…} endet', () => {
  const md = '## Backlog / Ideen';
  assert.throws(
    () => addItem(md, 'backlog', 'ship feature {v2}'),
    /text-has-trailing-braces/
  );
});

test('addItem — Text mit {…} in der Mitte ist OK', () => {
  const md = '## Backlog / Ideen';
  const { content } = addItem(md, 'backlog', 'use {braces} inline');
  assert.match(content, /^- \[ \] use \{braces\} inline$/m);
});

// ─── Fix 2: invalid-content for non-string input ──────────────────────────────

test('Writer-Funktionen werfen "invalid-content" bei Nicht-String-Input', () => {
  assert.throws(() => toggleItem(null, 1),    /invalid-content/);
  assert.throws(() => deleteItem(undefined, 1), /invalid-content/);
  assert.throws(() => addItem(42, 'backlog', 'x'), /invalid-content/);
});

// ─── Fix 3: serializeMeta validates string values ─────────────────────────────

test('addItem — wirft "meta-value-not-string" bei non-string meta values', () => {
  const md = '## Backlog / Ideen';
  assert.throws(
    () => addItem(md, 'backlog', 'x', { k: 42 }),
    /meta-value-not-string/
  );
  assert.throws(
    () => addItem(md, 'backlog', 'x', { k: null }),
    /meta-value-not-string/
  );
});

// ─── Fix 4: indented checkboxes treated as stale ─────────────────────────────

test('toggleItem — indented Checkbox wird als stale behandelt', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Top',
    '  - [ ] Nested',
  ].join('\n');
  assert.throws(() => toggleItem(md, 3), /stale/);
});

test('deleteItem — indented Checkbox wird als stale behandelt', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Top',
    '  - [ ] Nested',
  ].join('\n');
  assert.throws(() => deleteItem(md, 3), /stale/);
});

// ─── Fix 5: addItem insertion-anchor skips nested children ───────────────────

test('addItem — ignoriert nested checkboxes beim Finden des Insertion-Points', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] real',
    '  - [ ] nested child',
    '',
    '## Changelog',
  ].join('\n');
  const { content } = addItem(md, 'backlog', 'added');
  const lines = content.split('\n');
  // Nested line bleibt an seiner Position, new item wird nach "real"
  // (aber vor der nested line) eingefügt — bewusste Scope-Limitierung
  // von Phase 1 (keine Nested-Items).
  assert.equal(lines[1], '- [ ] real');
  assert.equal(lines[2], '- [ ] added');
  assert.equal(lines[3], '  - [ ] nested child');
});

// ─── Fix 6: trailing newline preservation ─────────────────────────────────────

test('toggleItem/deleteItem/addItem — erhalten Trailing-Newline', () => {
  const md = '## Backlog / Ideen\n- [ ] A\n- [ ] B\n';
  const toggled = toggleItem(md, 2).content;
  assert.ok(toggled.endsWith('\n'), 'toggleItem verliert Trailing-Newline');

  const deleted = deleteItem(md, 2).content;
  assert.ok(deleted.endsWith('\n'), 'deleteItem verliert Trailing-Newline');

  const added = addItem(md, 'backlog', 'C').content;
  assert.ok(added.endsWith('\n'), 'addItem verliert Trailing-Newline');
});
