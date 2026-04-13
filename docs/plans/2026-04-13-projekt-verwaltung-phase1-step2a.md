# Projekt-Verwaltung Phase 1 · Step 2a — Write-Back & Item-Mutations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User kann im Hub Roadmap-Items togglen, hinzufügen und löschen. Änderungen werden atomar in die originale `ROADMAP.md` geschrieben, ohne bestehendes Markdown-Formatting zu zerstören.

**Architecture:** Neuer reiner Writer-Modul (`lib/roadmap-writer.js`) mit drei pure Funktionen `toggleItem/deleteItem/addItem`, die `content → newContent` transformieren. Ein kleiner Mutex-Helper in `lib/mutations.js` serialisiert konkurrente Writes pro ROADMAP.md-Datei. Ein einziger `PATCH /api/projects/:id/items`-Endpoint dispatched auf die drei Actions und liefert die frisch geparste Roadmap als Response zurück — damit das Frontend ohne separates GET den neuen State kennt. Im Frontend werden `.roadmap-item`-Checkboxen klickbar mit optimistic UI (sofortiger Toggle, bei Fehler Revert).

**Tech Stack:** Node 20+, `node --test`, Express-Handler, Vanilla-JS. Keine neuen Dependencies.

**Scope-Box:**
- ✅ `toggleItem(content, line)` — flippt Checkbox auf exakt einer Zeile
- ✅ `addItem(content, section, text, meta?)` — Item ans Ende der Section
- ✅ `deleteItem(content, line)` — entfernt eine Item-Zeile
- ✅ Per-File-Mutex gegen Parallel-Writes im selben Projekt
- ✅ Atomarer Write (temp + rename)
- ✅ `PATCH /api/projects/:id/items` — dispatches action, liefert fresh Roadmap
- ✅ Content-Validation gegen stale line-Offsets → 409 Conflict
- ✅ Frontend: klickbare Items, "+ Item"-Button, Hover-Delete, optimistic UI + Revert
- ❌ Registry-Singleton-Refactor (Step 2b — file-watcher braucht ihn)
- ❌ `POST /api/projects` / Template-ROADMAP.md (Step 2b)
- ❌ `fs.watch` + WS-Broadcast für externe Änderungen (Step 2b)
- ❌ "Version abschließen"-Flow (Step 3)
- ❌ Nested-Item-Support (bleibt wie Step 1 — Top-Level only)

**Projekt-Konventionen wie Step 1:**
- `node --test` für neue Pure-Function-Module (Writer muss TDD)
- Server-Neustart + Browser + curl für manuelle Verifikation
- Kein Git (Checkpoints statt Commits)
- Deutsch im UI, Englisch in API-Errors

**Manuelle Verifikation pro UI-Task:**
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && npm start
# Browser: http://localhost:3333 → Projekte → Projekt öffnen → Checkbox klicken
```

---

## Data contract

### Item shape (unverändert aus Step 1)
```ts
Item = { done: boolean, text: string, meta: Record<string,string>, line: number /* 1-based */ }
```

### PATCH-Request
```http
PATCH /api/projects/:id/items
Content-Type: application/json

// Toggle
{ "action": "toggle", "section": "released|dev|backlog", "line": 42 }

// Delete
{ "action": "delete", "section": "released|dev|backlog", "line": 42 }

// Add
{ "action": "add", "section": "released|dev|backlog", "text": "New item", "meta": { "priority": "high" } }
```

**Validation:**
- `action` ∈ `{toggle, delete, add}`
- `section` ∈ `{released, dev, backlog}`
- `line` required for toggle/delete, positive integer
- `text` required for add, non-empty string (trimmed), max 500 chars
- `meta` optional for add, flat object `Record<string,string>`, max 10 keys, keys and values max 60 chars each

Violations → 400 with `{error, detail}`.

### PATCH-Response
```http
200 OK
// Full roadmap after the mutation (same shape as GET /api/projects/:id)
{ "id": "...", "displayName": "...", "path": "...",
  "released": {...}, "dev": {...}, "backlog": [...], "changelog": "...", "unknown": [...] }

409 Conflict    // line doesn't match a checkbox anymore (external edit)
{ "error": "Stale line offset", "detail": "Line 42 does not contain a checkbox item" }

404 Not Found   // project id unknown or ROADMAP.md missing
{ "error": "Project not found" }
```

---

## File Structure

**Erstellt:**
- `lib/roadmap-writer.js` — drei pure Funktionen: `toggleItem(content, line)`, `addItem(content, section, text, meta)`, `deleteItem(content, line)`. Jede liefert `{content: string, item?: Item}`. Wirft `new Error('stale')` bei Content-Mismatch, `new Error('section-not-found')` wenn die angefragte H2-Section im Dokument fehlt.
- `lib/roadmap-writer.test.js` — `node --test`-Suite, alle Edge-Cases.
- `lib/mutations.js` — per-Path-Mutex + `mutateRoadmap(projectPath, mutator)` Helper. Kapselt: Mutex acquire → read → mutator → atomarer temp+rename-Write → Mutex release.

**Modifiziert:**
- `lib/projects.js` — neue exportierte Funktion `patchProject(id, body)` die die Mutex-basierte Mutation triggert und die fresh geparste Roadmap liefert. Re-used die bestehenden Helper.
- `server.js` (neue Sektion nach `GET /api/projects/:id`) — `PATCH /api/projects/:id/items`-Endpoint, validiert Request-Body, ruft `patchProject()`, mappt Errors auf HTTP-Status.
- `public/index.html` — drei Änderungen:
  - `renderProjectDetail` fügt Section-Key (`released`/`dev`/`backlog`) als `data-section` an `<ul class="roadmap-list">` und als `data-line` an `<li class="roadmap-item">`
  - Click-Handler auf `.roadmap-item` → optimistic toggle + `patchItem()`-Aufruf
  - "+ Item"-Button + Delete-Button + CSS, Toast bei Fehler/Conflict, Inline-Input für Add
  - neue Helper-Funktion `patchItem(projectId, body, optimistic)` zentral für alle drei Actions
- `todo.md` — Step 2a abgehakt, Step 2b ist next

---

## Writer Contract — Details

### `toggleItem(content, line)`
- Split content by `\n`, look at `lines[line-1]`
- Must match `/^-\s*\[([ xX])\]\s*(.+?)\s*$/` — sonst `throw new Error('stale')`
- In-place flip: `[ ]` → `[x]` oder `[xX]` → `[ ]`. Rest der Zeile (Text, Meta-Suffix, Trailing-Whitespace) unverändert.
- Return `{content: newLines.join('\n'), item: parsedItem}` wo `parsedItem` der neue Zustand ist (done-Flag gedreht, Text/Meta unverändert, Line unverändert).

### `deleteItem(content, line)`
- Split, same validation as toggle on `lines[line-1]`
- Wenn die nachfolgende Zeile leer ist UND die vorherige Zeile ein H2 oder ein weiteres Item ist, auch die leere Zeile nicht mitlöschen (das würde Formatierung zerstören — siehe Tests). Standard: nur die eine Item-Zeile löschen, Nachbarzeilen unangetastet.
- Return `{content: newLines.join('\n')}` (kein item).

### `addItem(content, section, text, meta)`
- `section` ∈ `{released, dev, backlog}` → verwendet dieselben H2-Regexe wie der Parser
- Scanne Zeilen sequenziell: finde den Start der angefragten Section (H2-Match). Wenn nicht gefunden: `throw new Error('section-not-found')`
- Ab der Zeile nach dem H2 bis zur nächsten H2 (oder EOF) scanne nach dem Index der **letzten** Top-Level-Item-Zeile (`/^-\s*\[[ xX]\]/`)
- Wenn Items vorhanden: füge neue Item-Zeile direkt nach dem letzten Item ein
- Wenn keine Items vorhanden: füge neue Item-Zeile direkt nach der H2-Zeile ein, mit einer leerzeilen-Abstandsregel: wenn die Zeile nach der H2 leer ist, einfach die leere durch das Item ersetzen? Nein — füge nach der H2 das Item ein, ggf. mit einer leeren Zeile Abstand falls die nächste Zeile nicht leer war. Tests machen das konkret.
- Serialisiere Item-Text als `- [ ] {text}` + optional ` {key: value, …}` wenn `meta` nicht leer. Meta-Keys alphabetisch sortiert, Werte getrimmt.
- Return `{content: newLines.join('\n'), item: {done:false, text, meta: meta||{}, line: insertedLineNumber}}`

**Keine I/O. Pure.**

---

## Mutations Helper — Contract

### `lib/mutations.js`

```js
// Per-File Mutex
const fileLocks = new Map(); // absPath → Promise chain tail
async function withFileLock(path, fn) { … }

// Mutation Pipeline
// fn is a mutator: (content: string) → { content: string, item?: Item }
// mutateRoadmap reads the file, applies fn, writes temp+rename, returns fn's result.
// Throws ENOENT if file missing (handler maps to 404).
export async function mutateRoadmap(projectPath, fn) { … }
```

Writes use `projectPath + '/ROADMAP.md' + '.tmp'` as temp, same pattern as registry.

---

## Task 1: Writer-Skelett + Toggle-Tests

**Files:**
- Create: `lib/roadmap-writer.js`
- Create: `lib/roadmap-writer.test.js`

- [ ] **Step 1: Writer-Skelett schreiben**

Neue Datei `lib/roadmap-writer.js`:
```js
// Writer für ROADMAP.md-Dateien. Pure Funktionen, keine I/O.
// Die drei Public-APIs (toggleItem, deleteItem, addItem) transformieren
// einen String zu einem neuen String. Sie validieren gegen stale
// line-Offsets (z.B. nach externer Bearbeitung) und werfen
// `new Error('stale')` bzw. `new Error('section-not-found')`.
//
// Wieso pure? Damit sie unter `node --test` ohne Filesystem-Mocks testbar
// sind und die Mutex/IO-Logik von der Content-Transformation getrennt
// bleibt (siehe lib/mutations.js).

const RE_ITEM = /^-\s*\[([ xX])\]\s*(.+?)\s*$/;
const RE_META_SUFFIX = /\s*\{([^{}]*)\}\s*$/;
const RE_RELEASED = /^##\s+Released\s*:\s*v?(\S+)\s*$/i;
const RE_DEV      = /^##\s+In\s+Entwicklung\s*:\s*v?(\S+)\s*$/i;
const RE_BACKLOG  = /^##\s+Backlog(\s*\/\s*Ideen)?\s*$/i;
const RE_ANY_H2   = /^##\s+/;

function parseItemText(rawText) {
  const m = rawText.match(RE_META_SUFFIX);
  if (!m) return { text: rawText, meta: {} };
  const text = rawText.slice(0, m.index).trimEnd();
  const meta = {};
  for (const pair of m[1].split(',')) {
    const i = pair.indexOf(':');
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) meta[k] = v;
  }
  return { text, meta };
}

function normalize(content) {
  return String(content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function toggleItem(content, line) {
  const lines = normalize(content).split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) throw new Error('stale');
  const m = lines[idx].match(RE_ITEM);
  if (!m) throw new Error('stale');

  const wasDone = m[1].toLowerCase() === 'x';
  const flipped = wasDone
    ? lines[idx].replace(/\[[xX]\]/, '[ ]')
    : lines[idx].replace(/\[ \]/, '[x]');
  lines[idx] = flipped;

  const { text, meta } = parseItemText(m[2]);
  const item = { done: !wasDone, text, meta, line };
  return { content: lines.join('\n'), item };
}

export function deleteItem(content, line) {
  // Task 2 — skeleton
  throw new Error('not implemented');
}

export function addItem(content, section, text, meta) {
  // Task 3 — skeleton
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Erste Toggle-Tests schreiben (failing)**

Neue Datei `lib/roadmap-writer.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleItem } from './roadmap-writer.js';

test('toggleItem — flippt [ ] → [x] auf der richtigen Zeile', () => {
  const md = [
    '## Backlog / Ideen',     // line 1
    '- [ ] Feature A',         // line 2
    '- [ ] Feature B',         // line 3
  ].join('\n');
  const { content, item } = toggleItem(md, 2);
  assert.match(content, /^- \[x\] Feature A$/m);
  // Zeile 3 bleibt unangetastet
  assert.match(content, /^- \[ \] Feature B$/m);
  assert.equal(item.done, true);
  assert.equal(item.text, 'Feature A');
  assert.equal(item.line, 2);
});

test('toggleItem — flippt [x] → [ ] zurück', () => {
  const md = '## Backlog / Ideen\n- [x] Done';
  const { content, item } = toggleItem(md, 2);
  assert.match(content, /^- \[ \] Done$/m);
  assert.equal(item.done, false);
});

test('toggleItem — preserviert Meta-Suffix und Trailing-Text', () => {
  const md = '## Backlog / Ideen\n- [ ] Feature X {priority: high, effort: 2d}';
  const { content, item } = toggleItem(md, 2);
  assert.match(content, /^- \[x\] Feature X \{priority: high, effort: 2d\}$/m);
  assert.equal(item.text, 'Feature X');
  assert.deepEqual(item.meta, { priority: 'high', effort: '2d' });
});

test('toggleItem — wirft "stale" bei Nicht-Item-Zeile', () => {
  const md = '## Backlog / Ideen\n- [ ] Feature A';
  assert.throws(() => toggleItem(md, 1), /stale/);  // H2, kein Item
});

test('toggleItem — wirft "stale" bei Out-of-Range-Zeile', () => {
  const md = '## Backlog / Ideen\n- [ ] Feature A';
  assert.throws(() => toggleItem(md, 99), /stale/);
});

test('toggleItem — CRLF-Input wird korrekt verarbeitet', () => {
  const md = '## Backlog / Ideen\r\n- [ ] Feature A\r\n';
  const { content } = toggleItem(md, 2);
  assert.match(content, /^- \[x\] Feature A$/m);
});
```

- [ ] **Step 3: Tests laufen lassen → erwartet PASS**

Run: `cd /Users/rocky/Projects/claude-code-hub && node --test lib/roadmap-writer.test.js`
Expected: `# pass 6`, keine Fails. (Toggle ist in Step 1 schon implementiert — die Tests verifizieren.)

- [ ] **Step 4: Checkpoint — Toggle funktioniert**

---

## Task 2: deleteItem

**Files:**
- Modify: `lib/roadmap-writer.js`
- Modify: `lib/roadmap-writer.test.js`

- [ ] **Step 1: Failing Tests schreiben**

In `lib/roadmap-writer.test.js` anhängen:
```js
import { deleteItem } from './roadmap-writer.js';

test('deleteItem — entfernt die Item-Zeile', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Feature A',
    '- [ ] Feature B',
    '- [ ] Feature C',
  ].join('\n');
  const { content } = deleteItem(md, 3);
  assert.equal(content, [
    '## Backlog / Ideen',
    '- [ ] Feature A',
    '- [ ] Feature C',
  ].join('\n'));
});

test('deleteItem — löscht einziges Item in Section sauber', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Only Item',
    '',
    '## Changelog',
    '- raw',
  ].join('\n');
  const { content } = deleteItem(md, 2);
  // Nur die Item-Zeile geht weg; die leere Trennzeile und Changelog bleiben
  assert.equal(content, [
    '## Backlog / Ideen',
    '',
    '## Changelog',
    '- raw',
  ].join('\n'));
});

test('deleteItem — wirft "stale" bei Nicht-Item-Zeile', () => {
  const md = '## Backlog / Ideen\n- [ ] Feature A';
  assert.throws(() => deleteItem(md, 1), /stale/);
});

test('deleteItem — wirft "stale" bei Out-of-Range', () => {
  const md = '## Backlog / Ideen\n- [ ] Feature A';
  assert.throws(() => deleteItem(md, 99), /stale/);
});
```

- [ ] **Step 2: Run tests → expected FAIL**

Run: `node --test lib/roadmap-writer.test.js`
Expected: FAIL mit `not implemented` für alle deleteItem-Tests.

- [ ] **Step 3: deleteItem implementieren**

In `lib/roadmap-writer.js` die Stub-Funktion ersetzen:
```js
export function deleteItem(content, line) {
  const lines = normalize(content).split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) throw new Error('stale');
  if (!RE_ITEM.test(lines[idx])) throw new Error('stale');
  lines.splice(idx, 1);
  return { content: lines.join('\n') };
}
```

- [ ] **Step 4: Run tests → expected PASS**

Run: `node --test lib/roadmap-writer.test.js`
Expected: `# pass 10`.

- [ ] **Step 5: Checkpoint**

---

## Task 3: addItem

**Files:**
- Modify: `lib/roadmap-writer.js`
- Modify: `lib/roadmap-writer.test.js`

- [ ] **Step 1: Failing Tests schreiben**

In `lib/roadmap-writer.test.js` anhängen:
```js
import { addItem } from './roadmap-writer.js';

test('addItem — fügt Item ans Ende einer nicht-leeren Backlog-Section', () => {
  const md = [
    '## Backlog / Ideen',
    '- [ ] Existing A',
    '- [ ] Existing B',
    '',
    '## Changelog',
    '- old',
  ].join('\n');
  const { content, item } = addItem(md, 'backlog', 'New Item', {});
  assert.equal(content, [
    '## Backlog / Ideen',
    '- [ ] Existing A',
    '- [ ] Existing B',
    '- [ ] New Item',
    '',
    '## Changelog',
    '- old',
  ].join('\n'));
  assert.equal(item.text, 'New Item');
  assert.equal(item.done, false);
  assert.equal(item.line, 4);
});

test('addItem — fügt Item in leere Section direkt nach H2 ein', () => {
  const md = [
    '## Backlog / Ideen',
    '',
    '## Changelog',
    '- old',
  ].join('\n');
  const { content, item } = addItem(md, 'backlog', 'First', {});
  assert.equal(content, [
    '## Backlog / Ideen',
    '- [ ] First',
    '',
    '## Changelog',
    '- old',
  ].join('\n'));
  assert.equal(item.line, 2);
});

test('addItem — fügt mit Meta-Suffix ein, Keys alphabetisch sortiert', () => {
  const md = '## In Entwicklung: v1.0.0\n- [ ] Alt';
  const { content } = addItem(md, 'dev', 'Neu', { priority: 'high', effort: '2d' });
  assert.match(content, /^- \[ \] Neu \{effort: 2d, priority: high\}$/m);
});

test('addItem — fügt in Released-Section korrekt ein', () => {
  const md = '## Released: v1.0.0\n- [x] Foo\n\n## Backlog / Ideen';
  const { content } = addItem(md, 'released', 'Bar', {});
  assert.match(content, /^- \[ \] Bar$/m);
  // Die neue Zeile muss VOR der Backlog-H2 stehen
  const lines = content.split('\n');
  const barIdx = lines.indexOf('- [ ] Bar');
  const backlogIdx = lines.indexOf('## Backlog / Ideen');
  assert.ok(barIdx >= 0 && barIdx < backlogIdx);
});

test('addItem — wirft "section-not-found" bei fehlender Section', () => {
  const md = '## Backlog / Ideen\n- [ ] A';
  assert.throws(
    () => addItem(md, 'released', 'X', {}),
    /section-not-found/
  );
});

test('addItem — ohne Meta kein Suffix', () => {
  const md = '## Backlog / Ideen\n- [ ] A';
  const { content } = addItem(md, 'backlog', 'B', {});
  assert.match(content, /^- \[ \] B$/m);
});

test('addItem — leeres Meta-Objekt kein Suffix', () => {
  const md = '## Backlog / Ideen';
  const { content } = addItem(md, 'backlog', 'B');
  assert.match(content, /^- \[ \] B$/m);
});
```

- [ ] **Step 2: Run tests → FAIL erwartet**

Run: `node --test lib/roadmap-writer.test.js`
Expected: FAIL für alle addItem-Tests (`not implemented`).

- [ ] **Step 3: addItem implementieren**

In `lib/roadmap-writer.js` die Stub-Funktion ersetzen:
```js
const SECTION_MATCHER = {
  released: RE_RELEASED,
  dev:      RE_DEV,
  backlog:  RE_BACKLOG,
};

function serializeMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const keys = Object.keys(meta).sort();
  if (keys.length === 0) return '';
  const pairs = keys.map(k => `${k}: ${String(meta[k]).trim()}`);
  return ' {' + pairs.join(', ') + '}';
}

export function addItem(content, section, text, meta) {
  const matcher = SECTION_MATCHER[section];
  if (!matcher) throw new Error('section-not-found');

  const lines = normalize(content).split('\n');
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (matcher.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx < 0) throw new Error('section-not-found');

  // Scan nach der letzten Item-Zeile innerhalb der Section (bis zur nächsten H2 oder EOF)
  let lastItemIdx = -1;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (RE_ANY_H2.test(lines[i])) break;
    if (RE_ITEM.test(lines[i])) lastItemIdx = i;
  }

  const metaStr = serializeMeta(meta);
  const newLine = `- [ ] ${text}${metaStr}`;

  let insertIdx;
  if (lastItemIdx >= 0) {
    // Nach dem letzten Item einfügen
    insertIdx = lastItemIdx + 1;
  } else {
    // Section ist leer → direkt nach dem Header
    insertIdx = headerIdx + 1;
  }
  lines.splice(insertIdx, 0, newLine);

  return {
    content: lines.join('\n'),
    item: { done: false, text, meta: meta || {}, line: insertIdx + 1 },
  };
}
```

- [ ] **Step 4: Run tests → PASS erwartet**

Run: `node --test lib/roadmap-writer.test.js`
Expected: `# pass 17`.

- [ ] **Step 5: Checkpoint — Writer komplett**

---

## Task 4: Mutations-Helper (Mutex + atomarer Write)

**Files:**
- Create: `lib/mutations.js`

- [ ] **Step 1: Mutations-Helper schreiben**

Neue Datei `lib/mutations.js`:
```js
// Per-File Mutex + atomarer Write-Pipeline für ROADMAP.md-Mutations.
//
// Serialisiert konkurrente Writes auf derselben Datei (zwei Clients, die
// fast gleichzeitig togglen, werden in-order verarbeitet; ohne Mutex
// würde der Read-Modify-Write-Cycle racen und der zweite Write den
// ersten stillschweigend überschreiben).
//
// Der Mutex ist absichtlich nur per-Datei (nicht global) und lebt nur im
// Prozess — bei Multi-Hub-Setup wäre der Mutex wirkungslos, aber
// CLAUDE.md dokumentiert Single-Hub als Annahme.

import { promises as fs } from 'fs';
import { join } from 'path';

const fileLocks = new Map();

async function withFileLock(absPath, fn) {
  const prev = fileLocks.get(absPath) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  fileLocks.set(absPath, prev.then(() => current));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // Aufräumen wenn keine weiteren Waiters: wenn der aktuelle Eintrag
    // in der Map noch auf unseren `current` zeigt, löschen.
    if (fileLocks.get(absPath) === prev.then(() => current)) {
      // Die obige Referenz ist nicht die gleiche — vereinfachter cleanup:
      // lass den Eintrag stehen, er blockt nichts.
    }
  }
}

// mutator: (content: string) → { content: string, item?: Item }
// Liest ROADMAP.md, ruft mutator, schreibt atomar temp+rename, liefert
// den mutator-Output zurück. ENOENT wird durchgereicht (Handler → 404).
export async function mutateRoadmap(projectPath, mutator) {
  const roadmapPath = join(projectPath, 'ROADMAP.md');
  return withFileLock(roadmapPath, async () => {
    const content = await fs.readFile(roadmapPath, 'utf8');
    const result = mutator(content);
    if (!result || typeof result.content !== 'string') {
      throw new Error('mutator must return { content: string }');
    }
    const tmp = roadmapPath + '.tmp';
    await fs.writeFile(tmp, result.content, 'utf8');
    await fs.rename(tmp, roadmapPath);
    return result;
  });
}
```

- [ ] **Step 2: Smoke-Test des Mutex** (kein Unit-Test-Framework — Node-REPL)

```bash
cd /Users/rocky/Projects/claude-code-hub
cp ROADMAP.md /tmp/ROADMAP.md.bak
node -e "
import('./lib/mutations.js').then(async m => {
  import('./lib/roadmap-writer.js').then(async w => {
    // Zwei Toggles parallel auf derselben Datei
    const results = await Promise.all([
      m.mutateRoadmap('/Users/rocky/Projects/claude-code-hub', c => w.toggleItem(c, 2)),
      m.mutateRoadmap('/Users/rocky/Projects/claude-code-hub', c => w.toggleItem(c, 2)),
    ]);
    console.log('done, two toggles processed');
    console.log('last item.done:', results[results.length - 1].item.done);
  });
});
"
cat ROADMAP.md | head -5
# Restore
mv /tmp/ROADMAP.md.bak ROADMAP.md
```

Expected: `done, two toggles processed`, kein Crash. Die Datei ist nach dem Test in einem konsistenten Zustand (entweder beide Toggles angewendet oder keiner — nicht halb).

- [ ] **Step 3: Checkpoint — Mutex + atomarer Write funktionieren**

---

## Task 5: `patchProject` in projects.js + PATCH-Endpoint in server.js

**Files:**
- Modify: `lib/projects.js`
- Modify: `server.js`

- [ ] **Step 1: `patchProject` in projects.js anhängen**

Am Ende von `lib/projects.js` ergänzen:
```js
import { mutateRoadmap } from './mutations.js';
import { toggleItem, addItem, deleteItem } from './roadmap-writer.js';

// ── patchProject ─────────────────────────────────────────────────────────────
// Dispatch-Punkt für alle drei Write-Actions. Liest die Registry, lädt die
// ROADMAP.md via Mutex+temp+rename, und liefert die fresh geparste Roadmap
// als Response-Shape (wie getProject).
//
// Wirft Errors mit `.code`-Feld für saubere HTTP-Status-Mapping:
//   - 'unknown-id'        → 404
//   - 'missing-roadmap'   → 404
//   - 'bad-action'        → 400
//   - 'bad-body'          → 400
//   - 'stale'             → 409
//   - 'section-not-found' → 400
//
export async function patchProject(id, body) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) {
    const e = new Error('unknown-id'); e.code = 'unknown-id'; throw e;
  }

  const action = body?.action;
  if (!['toggle', 'delete', 'add'].includes(action)) {
    const e = new Error('bad-action'); e.code = 'bad-action'; throw e;
  }

  const section = body?.section;
  if (!['released', 'dev', 'backlog'].includes(section)) {
    const e = new Error('bad-body'); e.code = 'bad-body';
    e.detail = 'section must be one of released/dev/backlog';
    throw e;
  }

  let mutator;
  if (action === 'toggle') {
    const line = Number(body.line);
    if (!Number.isInteger(line) || line < 1) {
      const e = new Error('bad-body'); e.code = 'bad-body';
      e.detail = 'line must be a positive integer'; throw e;
    }
    mutator = (content) => toggleItem(content, line);
  } else if (action === 'delete') {
    const line = Number(body.line);
    if (!Number.isInteger(line) || line < 1) {
      const e = new Error('bad-body'); e.code = 'bad-body';
      e.detail = 'line must be a positive integer'; throw e;
    }
    mutator = (content) => deleteItem(content, line);
  } else {
    // add
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 500) {
      const e = new Error('bad-body'); e.code = 'bad-body';
      e.detail = 'text must be 1..500 chars'; throw e;
    }
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const keys = Object.keys(meta);
    if (keys.length > 10) {
      const e = new Error('bad-body'); e.code = 'bad-body';
      e.detail = 'meta: max 10 keys'; throw e;
    }
    for (const k of keys) {
      if (k.length > 60 || String(meta[k]).length > 60) {
        const e = new Error('bad-body'); e.code = 'bad-body';
        e.detail = 'meta: keys and values max 60 chars'; throw e;
      }
      if (['__proto__', 'constructor', 'prototype'].includes(k)) {
        const e = new Error('bad-body'); e.code = 'bad-body';
        e.detail = 'meta: reserved key'; throw e;
      }
    }
    mutator = (content) => addItem(content, section, text, meta);
  }

  try {
    await mutateRoadmap(entry.path, mutator);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error('missing-roadmap'); e.code = 'missing-roadmap'; throw e;
    }
    if (err.message === 'stale' || err.message === 'section-not-found') {
      const e = new Error(err.message); e.code = err.message; throw e;
    }
    throw err;
  }

  // Fresh load via existing getProject — re-parsed from disk
  const fresh = await getProject(id);
  return fresh;
}
```

- [ ] **Step 2: Endpoint in server.js einfügen**

In `server.js` direkt NACH dem `app.get('/api/projects/:id', ...)`-Block einfügen:
```js
// PATCH /api/projects/:id/items — toggle / add / delete Roadmap-Items.
// Body: { action: 'toggle'|'delete'|'add', section, line?, text?, meta? }
// Response: fresh Roadmap (wie GET /api/projects/:id) oder Error.
app.patch('/api/projects/:id/items', async (req, res) => {
  try {
    const fresh = await patchProject(req.params.id, req.body || {});
    res.json(fresh);
  } catch (e) {
    const code = e.code;
    if (code === 'unknown-id' || code === 'missing-roadmap') {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (code === 'stale') {
      return res.status(409).json({ error: 'Stale line offset', detail: 'Line does not contain a checkbox item anymore' });
    }
    if (code === 'section-not-found') {
      return res.status(400).json({ error: 'Section not found in ROADMAP.md' });
    }
    if (code === 'bad-action' || code === 'bad-body') {
      return res.status(400).json({ error: 'Bad request', detail: e.detail || e.message });
    }
    console.error('[projects] patch failed:', e);
    res.status(500).json({ error: 'Failed to patch project', detail: e.message });
  }
});
```

Und den Import am Anfang der Datei (wo `listProjects, getProject` importiert wird) um `patchProject` erweitern:
```js
import { discoverProjects, listProjects, getProject, patchProject } from './lib/projects.js';
```

- [ ] **Step 3: Server neustarten und mit curl testen**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd /Users/rocky/Projects/claude-code-hub && npm start &
SERVER_PID=$!
sleep 2
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2)

# Fresh Stand
echo "--- before ---"
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects/claude-code-hub | python3 -m json.tool | grep -A2 '"text"'

# Toggle Zeile 2 (das einzige released Item — je nach Content)
echo "--- toggle released line 2 ---"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"toggle","section":"released","line":2}' \
  http://localhost:3333/api/projects/claude-code-hub | python3 -m json.tool | grep -A2 '"released"'

# Stale (Zeile 99)
echo "--- stale ---"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"toggle","section":"released","line":99}' \
  http://localhost:3333/api/projects/claude-code-hub
echo

# Add-Test
echo "--- add ---"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"add","section":"backlog","text":"Curl Test Item","meta":{"priority":"high"}}' \
  http://localhost:3333/api/projects/claude-code-hub | python3 -m json.tool | grep -A2 "Curl Test"

# Delete (line-Nummer aus dem vorigen Response entnehmen — als Beispiel 9)
echo "--- delete (manuell Linenummer einsetzen) ---"

# Bad-action
echo "--- bad-action ---"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"nuke"}' \
  http://localhost:3333/api/projects/claude-code-hub

echo; echo "--- 404 ---"
curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"toggle","section":"backlog","line":1}' \
  http://localhost:3333/api/projects/nonexistent

kill $SERVER_PID
```

Expected:
- Toggle: `content.released.items[0].done` ist jetzt geflippt (`false` wenn vorher `true`, umgekehrt)
- Stale: `{"error":"Stale line offset",…}` mit 409 (sichtbar via `-w '%{http_code}\n'` falls gewünscht)
- Add: Response enthält ein `backlog`-Item mit `text: "Curl Test Item"` und `meta: {priority: "high"}`
- Bad-action: 400 mit `bad-action`-Fehler
- 404: `{"error":"Project not found"}`

ROADMAP.md inspizieren: `cat /Users/rocky/Projects/claude-code-hub/ROADMAP.md` zeigt die neuen Zustände. Ggf. manuell zurücksetzen:
```bash
cat > /Users/rocky/Projects/claude-code-hub/ROADMAP.md << 'EOF'
## Released: v0.1.0
- [x] Hub läuft

## In Entwicklung: v0.2.0
- [ ] Projekt-Verwaltung Phase 1

## Backlog / Ideen
- [ ] Mehr Features

## Changelog
### v0.1.0
- Initial release
EOF
```

- [ ] **Step 4: Checkpoint — Backend komplett**

---

## Task 6: Frontend — Klickbare Checkboxen + optimistic Toggle

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Neuen Shared Helper `patchItem(projectId, body)` einfügen**

In `public/index.html`, direkt VOR der `async function renderProjectDetail(id)`-Zeile (ca. Zeile 2499), einfügen:
```js
    // ── patchItem ──────────────────────────────────────────────────
    // Zentraler Helper für PATCH /api/projects/:id/items.
    // Wirft Error mit .status für Aufrufer, die unterschiedlich auf 401/409
    // reagieren wollen.
    async function patchItem(projectId, body) {
      const res = await fetch('/api/projects/' + encodeURIComponent(projectId) + '/items', {
        method: 'PATCH',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { clearToken(); showLoginModal(); const e = new Error('auth'); e.status = 401; throw e; }
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); detail = j.error || detail; } catch {}
        const e = new Error(detail); e.status = res.status; throw e;
      }
      return res.json();
    }

    // Letzter bekannter Projekt-State pro renderProjectDetail-Aufruf — wird
    // von patchItem-Handlern überschrieben wenn der Server einen frischen
    // Stand zurückgibt, damit die nächste Mutation korrekte line-Nummern
    // nutzt.
    let currentProjectState = null;
```

- [ ] **Step 2: Item-Rendering mit `data-section` und `data-line` erweitern**

Innerhalb von `renderProjectDetail`, die `renderItem` und `section`-Helper so anpassen, dass sie `data-section` und `data-line` an das `<li>` hängen. Ersetze den bestehenden `renderItem`-Block (ca. 2555-2562) durch:
```js
        const renderItem = (it, sectionKey) => `
          <li class="roadmap-item${it.done ? ' done' : ''}" data-section="${sectionKey}" data-line="${it.line}">
            <button class="roadmap-checkbox" type="button" aria-label="${it.done ? 'Als offen markieren' : 'Als erledigt markieren'}">${it.done ? '[x]' : '[ ]'}</button>
            <span class="roadmap-text">${escapeHtml(it.text)}</span>
            ${Object.keys(it.meta || {}).length
              ? `<span class="roadmap-meta">${escapeHtml(JSON.stringify(it.meta))}</span>`
              : ''}
            <button class="roadmap-item-delete" type="button" aria-label="Item löschen" title="Löschen">×</button>
          </li>`;
```

Und die Aufrufe an `renderItem` in `section(...)` anpassen: der innere map-Aufruf braucht den `sectionKey`:
```js
        const section = (label, version, items, sectionKey) => `
          <section class="roadmap-section" data-section="${sectionKey}">
            <h3>${label}${version ? ` · <span class="roadmap-version">v${escapeHtml(version)}</span>` : ''}</h3>
            ${items.length
              ? `<ul class="roadmap-list">${items.map(it => renderItem(it, sectionKey)).join('')}</ul>`
              : '<p class="roadmap-empty">— leer —</p>'}
            <button class="roadmap-add-btn" type="button" data-section="${sectionKey}">+ Item</button>
          </section>`;
```

Und im `body.innerHTML = …`-Block (ca. Zeile 2572), die Aufrufe von `section(...)` um den sectionKey erweitern:
```js
        body.innerHTML = `
          <div class="roadmap-meta-line"><span class="cmd-path">${escapeHtml(p.path)}</span></div>
          ${section('Released',       p.released?.version, p.released?.items || [], 'released')}
          ${section('In Entwicklung', p.dev?.version,      p.dev?.items      || [], 'dev')}
          ${section('Backlog / Ideen', null,               p.backlog         || [], 'backlog')}
          ${p.changelog
            ? `<section class="roadmap-section"><h3>Changelog</h3><pre class="roadmap-changelog">${escapeHtml(p.changelog)}</pre></section>`
            : ''}`;
```

- [ ] **Step 3: `currentProjectState` setzen und Click-Handler wiren**

In `renderProjectDetail`, direkt nach dem `body.innerHTML = …;`-Zuweisungsblock, eine Helper-Closure `wireInteractivity` definieren + aufrufen:
```js
        currentProjectState = p;

        const wireInteractivity = () => {
          body.querySelectorAll('.roadmap-checkbox').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const li = btn.closest('.roadmap-item');
              if (!li) return;
              const sectionKey = li.getAttribute('data-section');
              const line = parseInt(li.getAttribute('data-line'), 10);
              if (!sectionKey || !Number.isInteger(line)) return;

              // Optimistic flip
              const wasDone = li.classList.contains('done');
              li.classList.toggle('done');
              btn.textContent = wasDone ? '[ ]' : '[x]';

              try {
                const fresh = await patchItem(p.id, { action: 'toggle', section: sectionKey, line });
                currentProjectState = fresh;
                // Re-render, damit line-Nummern und andere Items konsistent sind
                renderProjectDetail(p.id);
              } catch (err) {
                if (err.status === 409) {
                  showProjectToast('Konflikt: lade neu…');
                  renderProjectDetail(p.id);
                } else if (err.status !== 401) {
                  // Revert optimistic flip
                  li.classList.toggle('done');
                  btn.textContent = wasDone ? '[x]' : '[ ]';
                  showProjectToast('Fehler: ' + err.message);
                }
              }
            });
          });

          body.querySelectorAll('.roadmap-item-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const li = btn.closest('.roadmap-item');
              if (!li) return;
              const sectionKey = li.getAttribute('data-section');
              const line = parseInt(li.getAttribute('data-line'), 10);
              if (!sectionKey || !Number.isInteger(line)) return;

              const text = li.querySelector('.roadmap-text')?.textContent || '';
              if (!confirm(`Item löschen?\n\n${text}`)) return;

              li.style.opacity = '0.4';
              try {
                await patchItem(p.id, { action: 'delete', section: sectionKey, line });
                renderProjectDetail(p.id);
              } catch (err) {
                li.style.opacity = '';
                if (err.status === 409) {
                  showProjectToast('Konflikt: lade neu…');
                  renderProjectDetail(p.id);
                } else if (err.status !== 401) {
                  showProjectToast('Fehler: ' + err.message);
                }
              }
            });
          });

          body.querySelectorAll('.roadmap-add-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const sectionKey = btn.getAttribute('data-section');
              const text = prompt('Neues Item — Text:');
              if (!text || !text.trim()) return;
              try {
                await patchItem(p.id, { action: 'add', section: sectionKey, text: text.trim() });
                renderProjectDetail(p.id);
              } catch (err) {
                if (err.status === 409) {
                  showProjectToast('Konflikt: lade neu…');
                  renderProjectDetail(p.id);
                } else if (err.status !== 401) {
                  showProjectToast('Fehler: ' + err.message);
                }
              }
            });
          });
        };
        wireInteractivity();
```

- [ ] **Step 4: Toast-Helper + CSS für neue Elemente**

In `public/index.html`, direkt nach `patchItem` (aus Step 1), `showProjectToast` definieren:
```js
    // Simple inline toast — auto-dismiss nach 3s.
    function showProjectToast(msg) {
      let toast = document.getElementById('project-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'project-toast';
        toast.className = 'project-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toast._hideTimer);
      toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }
```

Und in der `<style>`-Sektion, in der Nähe der existierenden `.roadmap-*`-Regeln (ca. Zeile 611), ergänzen:
```css
    /* ── Item-Interaktivität (Step 2a) ────────────────────────────── */
    .roadmap-item {
      position: relative;
    }
    .roadmap-checkbox {
      background: none; border: none; color: #2dd4bf;
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
      padding: 2px 4px; margin: -2px -4px;
      cursor: pointer; border-radius: 4px;
      transition: background 120ms;
    }
    .roadmap-checkbox:hover { background: rgba(45,212,191,0.12); }
    .roadmap-item-delete {
      background: none; border: none; color: inherit;
      font-size: 16px; line-height: 1; padding: 2px 8px;
      opacity: 0; cursor: pointer; border-radius: 4px;
      transition: opacity 120ms, color 120ms, background 120ms;
    }
    .roadmap-item:hover .roadmap-item-delete { opacity: 0.5; }
    .roadmap-item-delete:hover { opacity: 1; color: #f87171; background: rgba(248,113,113,0.1); }
    .roadmap-add-btn {
      display: inline-block; margin: 8px 12px 0;
      background: none; border: 1px dashed rgba(45,212,191,0.4);
      color: #2dd4bf; font-family: 'JetBrains Mono', monospace; font-size: 11px;
      padding: 4px 10px; border-radius: 6px;
      cursor: pointer; transition: background 120ms, border-color 120ms;
    }
    .roadmap-add-btn:hover { background: rgba(45,212,191,0.08); border-color: #2dd4bf; }

    .project-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: rgba(20,24,34,0.95); color: #f8fafc;
      border: 1px solid rgba(248,113,113,0.5); border-radius: 8px;
      padding: 10px 16px; font-size: 13px;
      font-family: 'DM Sans', sans-serif;
      opacity: 0; pointer-events: none;
      transition: opacity 200ms, transform 200ms;
      z-index: 10000;
    }
    .project-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
```

- [ ] **Step 5: Manuell testen**

1. Server neustarten (falls noch nicht) oder nur Browser reloaden (inline static).
2. Projekte-Tab → claude-code-hub öffnen.
3. Eine Checkbox klicken. Expected: flip ist instant, danach leichter Re-Render. `cat ROADMAP.md` zeigt den neuen State.
4. "+ Item" in einer Section klicken, `foo` eintippen, Enter. Expected: neues Item erscheint in der Liste, ROADMAP.md hat es am Ende der Section.
5. Hover auf dem neuen Item → `×`-Button sichtbar. Klick → Confirm-Dialog → OK. Expected: Item verschwindet, ROADMAP.md updated.
6. DevTools → Network: PATCH-Requests sichtbar, Response-Body enthält das fresh geparste Roadmap.
7. Stale-Test: Im DevTools-Console `patchItem('claude-code-hub', {action:'toggle', section:'backlog', line:99})` — Expected: 409 → Toast „Konflikt: lade neu…" + Re-Render.

- [ ] **Step 6: Checkpoint — Frontend-Interaktivität fertig**

Wenn zwischendurch die ROADMAP.md zu zerfleddert wurde, auf den bekannten Zustand zurücksetzen (siehe Task 5 Step 3).

---

## Task 7: Wrap-up — todo.md + finaler Smoke-Test

**Files:**
- Modify: `todo.md`
- Modify: `public/index.html` (optional: tab-title)

- [ ] **Step 1: todo.md aktualisieren**

In `todo.md` die Projekt-Verwaltungs-Section erweitern: Step 2a als erledigt markieren (Datum einsetzen), Phase 1 Step 2b als „nächstes" kennzeichnen. Kurzliste was in 2a drin ist:
- Writer-Modul `lib/roadmap-writer.js` (toggle/delete/add, TDD mit ~17 Tests)
- Mutex + atomarer Write in `lib/mutations.js`
- `PATCH /api/projects/:id/items`-Endpoint
- Frontend: klickbare Checkboxen, optimistic UI, Add/Delete-Buttons, Conflict-Toast

- [ ] **Step 2: Tab-Title aktualisieren**

In `public/index.html` bei `tab-projects` den `title`-Attribut von `"Projekt-Verwaltung (Phase 1 Step 1 — read-only)"` auf `"Projekt-Verwaltung (Phase 1 Step 2a — Mutations)"` setzen.

- [ ] **Step 3: Finaler E2E-Smoke**

1. Server neustarten.
2. `node --test lib/roadmap-writer.test.js lib/roadmap.test.js` → beide grün, insgesamt 15 + 17 = 32 Tests.
3. Im Browser: Projekte → eigenes Projekt öffnen → mindestens 1 toggle, 1 add, 1 delete → ROADMAP.md inspizieren → Zustand korrekt.
4. Sessions-Tab + Usage-Tab + Terminal-Attach: alles funktioniert wie vorher.
5. LaunchAgent wieder aktivieren:
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

- [ ] **Step 4: Checkpoint — Step 2a komplett**

---

## Offene Punkte für Step 2b (nicht jetzt)

- Registry-Singleton-Refactor + `saveRegistry()` als Single-Source-of-Truth
- `POST /api/projects` mit Template-ROADMAP.md via Tree-Picker-Integration im Frontend
- `fs.watch` pro registriertem ROADMAP.md + WebSocket-Broadcast an offene Clients
- Discovery-on-Read in `GET /api/projects` (billiger Rescan ohne Server-Restart)
- Prototype-Pollution-Härtung im Meta-Parser (`__proto__`/`constructor`/`prototype` bereits in `patchProject` blockiert, aber nicht im read-only Parser)
- Inline-Input statt `prompt()` für „+ Item" (UX-Polish)
- Meta-Pills statt `JSON.stringify(meta)` im Frontend
