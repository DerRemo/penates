# Projekt-Verwaltung Phase 1 · Step 1 — Fundament (read-only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liefert den read-only Projekt-Verwaltungs-Fundamentstack — Parser, Registry + Auto-Discovery, zwei GET-Endpoints und gefüllte Projekte-Tab + Project-Detail-View. Keine Mutationen, kein File-Watcher, kein Session-Badge — das ist Step 2/3.

**Architecture:** Pure Parser-Funktion in `lib/roadmap.js` (zero I/O, testbar mit `node --test`). Registry in `lib/projects.js` verwaltet `~/.claude-code-hub/projects.json` und scannt beim Server-Start `~/Projects/*/ROADMAP.md`. Server exposed zwei GET-Endpoints hinter dem bestehenden `authMiddleware`. Frontend befüllt die in Phase 0 vorbereiteten `projects-view` und `project-detail-view` Shells mit echten Daten via `apiHeaders()` + `fetch`.

**Tech Stack:** Node 20+ ESM, `node --test` für Parser-Unit-Tests (zero deps), Vanilla-JS-Frontend wie Rest des Hubs.

**Scope-Box:**
- ✅ Parser für Released/Dev/Backlog/Changelog + Item-Metadata
- ✅ Registry-Datei + Auto-Discovery beim Startup
- ✅ `GET /api/projects`, `GET /api/projects/:id`
- ✅ Projekte-Tab-Liste (Klick → Detail-View)
- ✅ Project-Detail-View (Sub-Tabs, read-only)
- ❌ Write-Back / atomare Writes (Step 2)
- ❌ `POST /api/projects`, `PATCH /api/projects/:id/items` (Step 2)
- ❌ `fs.watch` + WebSocket-Broadcast (Step 2)
- ❌ Session-Badge `cwd`-Prefix-Match (Step 3)
- ❌ „Version abschließen" (Step 3)

**Projekt-Konventionen, die dieser Plan einhält:**
- `execFileSync`-Muster gilt hier nicht (kein Shell-Aufruf). `fs`-Calls sind okay.
- Keine neuen Runtime-Deps. `node --test` ist im Node-Standard.
- Kein Build-Step. Änderungen via Server-Neustart + Browser testen.
- Nicht Git-versioniert — „Commit"-Steps sind Checkpoints (manuell verifizieren, dann weiter).
- Externe Binaries mit vollem Pfad (nicht relevant hier, rein Node-I/O).

**Manuelle Verifikation pro UI-Task:**
```bash
# LaunchAgent stoppen, falls läuft
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
# Server manuell starten
cd ~/Projects/claude-code-hub && npm start
# Im Browser: http://localhost:3333 → Tab „Projekte"
```

---

## File Structure

**Erstellt:**
- `lib/roadmap.js` — Pure Parser-Funktion `parseRoadmap(content) → {released, dev, backlog, changelog, raw}`. Keine I/O.
- `lib/roadmap.test.js` — `node --test` Unit-Tests gegen Inline-Fixtures.
- `lib/projects.js` — Registry: `loadRegistry()`, `saveRegistry(reg)`, `discoverProjects(roots)`, `listProjects()`, `getProject(id)`. Benutzt `lib/roadmap.js`.
- `templates/ROADMAP.md` — Template für neue Projekte (in Step 2 verwendet, hier nur committet damit Step 2 es nicht mehr erstellen muss). **Nein** — YAGNI, verschoben auf Step 2.

**Modifiziert:**
- `server.js:10` — Zusätzlicher Import `import { discoverProjects, listProjects, getProject } from './lib/projects.js';`
- `server.js` (neue Sektion nach `/api/usage/history`, ca. Zeile 224) — Zwei neue Endpoints `GET /api/projects`, `GET /api/projects/:id`.
- `server.js` (am Ende, nach `app.listen`) — Startup-Hook: `discoverProjects([join(HOME, 'Projects')]).catch(...)`.
- `public/index.html:1701-1731` — `projects-view` Body wird dynamisch befüllt; Phase-0 Empty-State wird zum Fallback wenn `projects.length === 0`.
- `public/index.html:1736-1773` — `project-detail-view` Body wird via `renderProjectDetail(id)` befüllt.
- `public/index.html:1977` — `setView('project-detail', {projectId})` triggert `renderProjectDetail(projectId)`.
- `public/index.html` (JS-Sektion um Zeile 2073 nach `renderUsage`) — Zwei neue Funktionen `renderProjectsList()` und `renderProjectDetail(id)` + Tab-Hook in `setTab`.

---

## Parser Contract

`parseRoadmap(content: string) → Roadmap`

```ts
type Item = {
  done: boolean;          // true wenn [x], false wenn [ ]
  text: string;           // Item-Text OHNE Metadata-Suffix
  meta: Record<string,string>;  // {} wenn kein Suffix
  line: number;           // 1-basierte Zeilennummer (für Step 2 Write-Back)
};

type VersionSection = {
  version: string | null; // "1.2.0" aus "## Released: v1.2.0" (null wenn leer/unerkannt)
  items: Item[];
};

type Roadmap = {
  released: VersionSection;  // { version: null, items: [] } wenn keine Section
  dev: VersionSection;
  backlog: Item[];
  changelog: string;         // rohes Markdown der Changelog-Section (ohne H2-Zeile)
  unknown: string[];         // H2-Titel, die wir nicht zuordnen konnten (für Debug)
};
```

**Section-Erkennung (case-insensitive, Whitespace-tolerant):**
- `/^##\s+Released\s*:\s*v?([^\s]+)\s*$/i` → `released.version`
- `/^##\s+In\s+Entwicklung\s*:\s*v?([^\s]+)\s*$/i` → `dev.version`
- `/^##\s+Backlog(\s*\/\s*Ideen)?\s*$/i` → `backlog`
- `/^##\s+Changelog\s*$/i` → `changelog`
- Alle anderen H2 → `unknown[]`, Inhalt wird verworfen.

**Item-Erkennung:**
- `/^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/` matcht Checkbox-Zeile.
- Metadata-Suffix: abschließendes `\s*\{([^{}]*)\}\s*$` wird aus `text` herausgeschnitten und nach `key: value`-Pairs geparsed (Separator `,`, Leerzeichen um `:` tolerant). Unbekannte Keys bleiben als Strings.

---

## Registry Contract

`~/.claude-code-hub/projects.json`:
```json
{
  "version": 1,
  "projects": [
    { "id": "claude-code-hub", "path": "/Users/rocky/Projects/claude-code-hub", "displayName": "claude-code-hub" }
  ]
}
```

**ID-Generierung:** `basename(path)`. Bei Kollision: `basename-2`, `basename-3`, …
**Discovery:** Für jedes `root` aus `roots` (default `[~/Projects]`): `readdir`, für jedes Kind-Verzeichnis check `ROADMAP.md`. Wenn vorhanden und Pfad noch nicht in Registry → hinzufügen + `saveRegistry()`. Keine Entfernung (Hobby-Setup — User löscht manuell falls nötig).
**`listProjects()`:** Für jedes Registry-Eintrag `parseRoadmap(await readFile(roadmap))`, liefert Summary-Objekte:
```ts
{ id, displayName, path, released: {version, done, total}, dev: {version, done, total}, backlogCount }
```
**`getProject(id)`:** Liefert volles `Roadmap`-Objekt + `{id, displayName, path}`. `null` wenn ID unbekannt.

---

## Task 1: Parser-Skelett + erster Test (Section-Header)

**Files:**
- Create: `lib/roadmap.js`
- Create: `lib/roadmap.test.js`

- [ ] **Step 1: Parser-Skelett schreiben**

Neue Datei `lib/roadmap.js`:
```js
// Parser für ROADMAP.md-Dateien. Pure Funktion, keine I/O.
// Struktur-Spec siehe docs/plans/2026-04-13-projekt-verwaltung-phase1-step1.md

const RE_RELEASED = /^##\s+Released\s*:\s*v?(\S+)\s*$/i;
const RE_DEV      = /^##\s+In\s+Entwicklung\s*:\s*v?(\S+)\s*$/i;
const RE_BACKLOG  = /^##\s+Backlog(\s*\/\s*Ideen)?\s*$/i;
const RE_CHANGELOG= /^##\s+Changelog\s*$/i;
const RE_ANY_H2   = /^##\s+(.+?)\s*$/;

export function parseRoadmap(content) {
  const lines = String(content ?? '').split('\n');
  const roadmap = {
    released:  { version: null, items: [] },
    dev:       { version: null, items: [] },
    backlog:   [],
    changelog: '',
    unknown:   [],
  };

  let section = null;              // 'released' | 'dev' | 'backlog' | 'changelog' | null
  const changelogLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(RE_RELEASED))) {
      section = 'released';
      roadmap.released.version = m[1];
      continue;
    }
    if ((m = line.match(RE_DEV))) {
      section = 'dev';
      roadmap.dev.version = m[1];
      continue;
    }
    if (RE_BACKLOG.test(line)) { section = 'backlog'; continue; }
    if (RE_CHANGELOG.test(line)) { section = 'changelog'; continue; }
    if ((m = line.match(RE_ANY_H2))) {
      section = null;
      roadmap.unknown.push(m[1]);
      continue;
    }
    if (section === 'changelog') {
      changelogLines.push(line);
    }
    // Item-Parsing kommt in Task 2.
  }

  roadmap.changelog = changelogLines.join('\n').replace(/^\n+|\n+$/g, '');
  return roadmap;
}
```

- [ ] **Step 2: Ersten Test für Section-Header schreiben**

Neue Datei `lib/roadmap.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoadmap } from './roadmap.js';

test('parseRoadmap — erkennt Released- und Dev-Versions-Header', () => {
  const md = [
    '# My Project',
    '',
    '## Released: v1.2.0',
    '',
    '## In Entwicklung: v1.3.0',
    '',
  ].join('\n');
  const r = parseRoadmap(md);
  assert.equal(r.released.version, '1.2.0');
  assert.equal(r.dev.version, '1.3.0');
  assert.deepEqual(r.released.items, []);
  assert.deepEqual(r.dev.items, []);
});

test('parseRoadmap — leerer Input liefert leere Struktur', () => {
  const r = parseRoadmap('');
  assert.equal(r.released.version, null);
  assert.equal(r.dev.version, null);
  assert.deepEqual(r.backlog, []);
  assert.equal(r.changelog, '');
});

test('parseRoadmap — unbekannte H2 landen in unknown[]', () => {
  const r = parseRoadmap('## Something Else\n- [ ] foo');
  assert.deepEqual(r.unknown, ['Something Else']);
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `cd /Users/rocky/Projects/claude-code-hub && node --test lib/roadmap.test.js`
Expected: `# pass 3`, keine Fails.

- [ ] **Step 4: Checkpoint — Parser parst Header**

Manuelle Checkliste: `lib/roadmap.js` + `lib/roadmap.test.js` existieren, Tests grün.

---

## Task 2: Parser — Checkbox-Items in Released/Dev/Backlog

**Files:**
- Modify: `lib/roadmap.js`
- Modify: `lib/roadmap.test.js`

- [ ] **Step 1: Failing Test schreiben**

In `lib/roadmap.test.js` ans Ende anhängen:
```js
test('parseRoadmap — sammelt Checkbox-Items in Released/Dev/Backlog', () => {
  const md = [
    '## Released: v1.0.0',
    '- [x] Feature A',
    '- [x] Feature B',
    '',
    '## In Entwicklung: v1.1.0',
    '- [ ] Feature C',
    '- [x] Feature D',
    '',
    '## Backlog / Ideen',
    '- [ ] Idea X',
    '- [ ] Idea Y',
  ].join('\n');
  const r = parseRoadmap(md);

  assert.equal(r.released.items.length, 2);
  assert.equal(r.released.items[0].done, true);
  assert.equal(r.released.items[0].text, 'Feature A');
  assert.equal(r.released.items[0].line, 2);

  assert.equal(r.dev.items.length, 2);
  assert.equal(r.dev.items[0].done, false);
  assert.equal(r.dev.items[0].text, 'Feature C');
  assert.equal(r.dev.items[1].done, true);

  assert.equal(r.backlog.length, 2);
  assert.equal(r.backlog[0].text, 'Idea X');
});
```

- [ ] **Step 2: Test laufen lassen — erwartet FAIL**

Run: `node --test lib/roadmap.test.js`
Expected: FAIL mit `Expected values to be strictly equal: 0 === 2` (items noch leer).

- [ ] **Step 3: Item-Parsing implementieren**

In `lib/roadmap.js` oben nach den H2-Regexen ergänzen:
```js
const RE_ITEM = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;
```

Und in der `for`-Schleife innerhalb von `parseRoadmap`, direkt vor dem `if (section === 'changelog')`, einfügen:
```js
    const itemMatch = line.match(RE_ITEM);
    if (itemMatch && section && section !== 'changelog') {
      const done = itemMatch[1].toLowerCase() === 'x';
      const text = itemMatch[2];
      const item = { done, text, meta: {}, line: i + 1 };
      if (section === 'released') roadmap.released.items.push(item);
      else if (section === 'dev') roadmap.dev.items.push(item);
      else if (section === 'backlog') roadmap.backlog.push(item);
      continue;
    }
```

- [ ] **Step 4: Tests laufen lassen — erwartet PASS**

Run: `node --test lib/roadmap.test.js`
Expected: `# pass 4` (Tests aus Task 1 und 2).

- [ ] **Step 5: Checkpoint**

---

## Task 3: Parser — Metadata-Suffix `{key: value, …}`

**Files:**
- Modify: `lib/roadmap.js`
- Modify: `lib/roadmap.test.js`

- [ ] **Step 1: Failing Test schreiben**

In `lib/roadmap.test.js` anhängen:
```js
test('parseRoadmap — extrahiert Metadata-Suffix aus Items', () => {
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
```

- [ ] **Step 2: Test laufen lassen — FAIL erwartet**

Run: `node --test lib/roadmap.test.js`
Expected: FAIL — `text` enthält noch das Suffix, `meta` ist leer.

- [ ] **Step 3: Metadata-Parser implementieren**

In `lib/roadmap.js` oberhalb von `parseRoadmap` ergänzen:
```js
const RE_META_SUFFIX = /\s*\{([^{}]*)\}\s*$/;

function parseMeta(rawText) {
  const m = rawText.match(RE_META_SUFFIX);
  if (!m) return { text: rawText, meta: {} };
  const text = rawText.slice(0, m.index).trimEnd();
  const meta = {};
  for (const pair of m[1].split(',')) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) meta[k] = v;
  }
  return { text, meta };
}
```

Innerhalb der Item-Branch in `parseRoadmap` die Zeile `const text = itemMatch[2];` ersetzen durch:
```js
      const { text, meta } = parseMeta(itemMatch[2]);
```

Und `meta: {}` im Item-Objekt ersetzen durch `meta`:
```js
      const item = { done, text, meta, line: i + 1 };
```

- [ ] **Step 4: Tests laufen lassen — PASS erwartet**

Run: `node --test lib/roadmap.test.js`
Expected: `# pass 5`.

- [ ] **Step 5: Checkpoint**

---

## Task 4: Parser — Changelog-Rohtext

**Files:**
- Modify: `lib/roadmap.test.js`

- [ ] **Step 1: Failing Test schreiben (falls Changelog noch nicht getestet)**

In `lib/roadmap.test.js` anhängen:
```js
test('parseRoadmap — Changelog wird als Rohtext gesammelt', () => {
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
  // Released-Section bleibt davon unberührt
  assert.equal(r.released.items.length, 1);
});
```

- [ ] **Step 2: Test laufen lassen — erwartet PASS**

Run: `node --test lib/roadmap.test.js`
Expected: `# pass 6`. (Changelog-Logik ist seit Task 1 schon drin — dies ist ein Confidence-Test.)

Falls FAIL: prüfen dass der `changelogLines.push(line)`-Zweig _nach_ dem H2-Match, aber _vor_ dem Item-Zweig läuft.

- [ ] **Step 3: Checkpoint — Parser komplett für Step 1**

---

## Task 5: Registry-Modul

**Files:**
- Create: `lib/projects.js`

- [ ] **Step 1: Registry-Skelett schreiben**

Neue Datei `lib/projects.js`:
```js
// Registry für Projekt-Verwaltung (Phase 1 Step 1, read-only).
//
// Persistenz: ~/.claude-code-hub/projects.json
// Parser-Source: ROADMAP.md im Projekt-Root
//
// Public APIs:
//   discoverProjects(roots)  - scannt roots/* nach ROADMAP.md, fügt neue zur
//                               Registry hinzu
//   listProjects()           - Summary-Liste aller registrierten Projekte
//   getProject(id)           - vollständiger Roadmap-Dump oder null

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parseRoadmap } from './roadmap.js';

const REGISTRY_DIR  = join(homedir(), '.claude-code-hub');
const REGISTRY_FILE = join(REGISTRY_DIR, 'projects.json');

async function ensureRegistryDir() {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
}

export async function loadRegistry() {
  try {
    const raw = await fs.readFile(REGISTRY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { version: 1, projects: [] };
    }
    return { version: parsed.version || 1, projects: parsed.projects };
  } catch (err) {
    if (err.code === 'ENOENT') return { version: 1, projects: [] };
    throw err;
  }
}

export async function saveRegistry(reg) {
  await ensureRegistryDir();
  const tmp = REGISTRY_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(reg, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, REGISTRY_FILE);
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function discoverProjects(roots) {
  const reg = await loadRegistry();
  const knownPaths = new Set(reg.projects.map(p => p.path));
  const takenIds   = new Set(reg.projects.map(p => p.id));
  let added = 0;

  for (const root of roots) {
    let entries;
    try { entries = await fs.readdir(root, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const projPath = join(root, e.name);
      if (knownPaths.has(projPath)) continue;
      const roadmapPath = join(projPath, 'ROADMAP.md');
      try { await fs.access(roadmapPath); }
      catch { continue; }
      const id = uniqueId(basename(projPath), takenIds);
      takenIds.add(id);
      knownPaths.add(projPath);
      reg.projects.push({ id, path: projPath, displayName: basename(projPath) });
      added++;
    }
  }

  if (added > 0) await saveRegistry(reg);
  return { added, total: reg.projects.length };
}

async function readRoadmapFor(entry) {
  try {
    const content = await fs.readFile(join(entry.path, 'ROADMAP.md'), 'utf8');
    return parseRoadmap(content);
  } catch {
    return null;
  }
}

function summarize(entry, roadmap) {
  const count = (items) => ({
    total: items.length,
    done: items.filter(i => i.done).length,
  });
  return {
    id: entry.id,
    displayName: entry.displayName,
    path: entry.path,
    released: {
      version: roadmap?.released.version || null,
      ...count(roadmap?.released.items || []),
    },
    dev: {
      version: roadmap?.dev.version || null,
      ...count(roadmap?.dev.items || []),
    },
    backlogCount: roadmap?.backlog.length || 0,
    missing: !roadmap,
  };
}

export async function listProjects() {
  const reg = await loadRegistry();
  const out = [];
  for (const entry of reg.projects) {
    const roadmap = await readRoadmapFor(entry);
    out.push(summarize(entry, roadmap));
  }
  return out;
}

export async function getProject(id) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) return null;
  const roadmap = await readRoadmapFor(entry);
  if (!roadmap) return null;
  return {
    id: entry.id,
    displayName: entry.displayName,
    path: entry.path,
    ...roadmap,
  };
}
```

- [ ] **Step 2: Smoke-Test per Node-REPL**

Run:
```bash
cd /Users/rocky/Projects/claude-code-hub && node -e "
import('./lib/projects.js').then(async m => {
  console.log('Discover:', await m.discoverProjects(['/Users/rocky/Projects']));
  console.log('List:', await m.listProjects());
});
"
```
Expected: `Discover: { added: N, total: N }` mit N ≥ 1. `List:` zeigt mindestens `claude-code-hub` (sobald das Hub-Repo selbst eine ROADMAP.md hat — falls nicht, kurz eine Minimal-Datei `echo "## In Entwicklung: v0.1.0\n- [ ] smoke" > /Users/rocky/Projects/claude-code-hub/ROADMAP.md` zum Testen anlegen und nach dem Task wieder löschen).

- [ ] **Step 3: Registry-Datei inspizieren**

Run: `cat ~/.claude-code-hub/projects.json`
Expected: JSON mit `version: 1` und mindestens einem Projekt-Entry mit `id`, `path`, `displayName`.

- [ ] **Step 4: Checkpoint — Registry + Discovery funktionieren**

---

## Task 6: Server-Endpoints + Startup-Hook

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Import hinzufügen**

In `server.js:10` nach dem `usage.js`-Import eine Zeile ergänzen:
```js
import { discoverProjects, listProjects, getProject } from './lib/projects.js';
```

- [ ] **Step 2: Endpoints einfügen**

In `server.js` direkt **nach** dem `/api/usage/history`-Block (nach der schließenden `});`, aktuell ca. Zeile 223) einfügen:
```js
// ── Projekt-Verwaltung (Phase 1 Step 1, read-only) ─────────────────────
// Quelle: ~/.claude-code-hub/projects.json + ROADMAP.md pro Projekt.
// Mutations (POST/PATCH) und File-Watcher kommen in Step 2.
app.get('/api/projects', async (_req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (e) {
    res.status(500).json({ error: 'Failed to list projects', detail: e.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load project', detail: e.message });
  }
});
```

- [ ] **Step 3: Startup-Discovery-Hook am Ende der Datei**

In `server.js` die bestehende `app.listen(...)`-Zeile suchen und direkt **nach** ihr einfügen:
```js
// Projekt-Discovery einmalig beim Startup. Scan-Roots sind konfigurierbar
// via PROJECT_ROOTS (comma-separated), Default: ~/Projects.
const projectRoots = (process.env.PROJECT_ROOTS || join(HOME, 'Projects'))
  .split(',').map(s => s.trim()).filter(Boolean);
discoverProjects(projectRoots)
  .then(r => console.log(`[projects] discovery: +${r.added}, total=${r.total}`))
  .catch(e => console.error('[projects] discovery failed:', e.message));
```

- [ ] **Step 4: Server neu starten und Endpoints testen**

Falls LaunchAgent läuft: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist`
Run: `cd /Users/rocky/Projects/claude-code-hub && npm start`
In anderem Terminal:
```bash
TOKEN=$(grep AUTH_TOKEN .env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects | head -40
```
Expected: JSON mit `{"projects":[{"id":"...","displayName":"...", "released":{...}, ...}]}`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects/claude-code-hub | head -40
```
Expected: 200 mit `released`, `dev`, `backlog`, `changelog`-Feldern (404 wenn `claude-code-hub` die ID nicht hat — dann zuerst `/api/projects` prüfen und den tatsächlichen `id`-Wert einsetzen).

Server-Log zeigt: `[projects] discovery: +N, total=N`.

- [ ] **Step 5: Checkpoint — Backend fertig**

Server kann sauber stoppen mit Ctrl+C, keine Errors im Log.

---

## Task 7: Frontend — Projekte-Tab mit echter Liste

**Files:**
- Modify: `public/index.html`

**Vorab-Orientierung:**
- `projects-view` Container: Zeile 1701 (`<div class="projects-view" id="projects-view" ...>`)
- `apiHeaders()` und das Render-Muster: Beispiel `renderUsage()` ab Zeile 2074
- Tab-Switch-Logik: `setTab(tab)` ab Zeile ~2023
- `setView('project-detail', {projectId})` wird in Task 8 benutzt

- [ ] **Step 1: `renderProjects()` als neue Funktion anlegen**

In `public/index.html`, nach der `renderUsage()`-Funktion (Suchanker: `async function renderUsage`), eine neue Funktion einfügen:
```js
    // ── Projekte-View (Phase 1 Step 1, read-only Liste) ────────────
    async function renderProjects() {
      const view = document.getElementById('projects-view');
      view.innerHTML = '<div class="usage-empty">Lade Projekte…</div>';
      try {
        const res = await fetch('/api/projects', { headers: apiHeaders() });
        if (res.status === 401) {
          clearToken();
          showLoginModal();
          view.innerHTML = '<div class="usage-empty">Auth abgelaufen.</div>';
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { projects } = await res.json();

        if (!projects || projects.length === 0) {
          // Phase-0-Empty-State wiederherstellen
          view.innerHTML = PROJECTS_EMPTY_HTML;
          return;
        }

        const cards = projects.map(p => {
          const devPct = p.dev.total > 0
            ? Math.round((p.dev.done / p.dev.total) * 100)
            : 0;
          const relTag = p.released.version
            ? `v${escapeHtml(p.released.version)}`
            : '—';
          const devTag = p.dev.version
            ? `v${escapeHtml(p.dev.version)}`
            : '—';
          const missingBadge = p.missing
            ? '<span class="project-missing">ROADMAP.md fehlt</span>'
            : '';
          return `
            <button class="project-card" data-project-id="${escapeHtml(p.id)}" type="button">
              <div class="project-card-head">
                <span class="project-card-name">${escapeHtml(p.displayName)}</span>
                ${missingBadge}
              </div>
              <div class="project-card-versions">
                <span class="project-card-version">released <strong>${relTag}</strong></span>
                <span class="project-card-sep">·</span>
                <span class="project-card-version">dev <strong>${devTag}</strong></span>
              </div>
              <div class="project-card-progress">
                <div class="project-card-progress-bar"><div style="width:${devPct}%"></div></div>
                <span class="project-card-progress-text">${p.dev.done}/${p.dev.total} dev · ${p.backlogCount} backlog</span>
              </div>
            </button>`;
        }).join('');

        view.innerHTML = `<div class="project-list">${cards}</div>`;
        view.querySelectorAll('.project-card').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-project-id');
            setView('project-detail', { projectId: id });
          });
        });
      } catch (e) {
        view.innerHTML = `<div class="usage-empty">Fehler: ${escapeHtml(e.message)}</div>`;
      }
    }
```

- [ ] **Step 2: Phase-0-Empty-State als Konstante sichern**

In `public/index.html`, direkt **vor** der `renderProjects`-Funktion, den aktuellen Shell-HTML aus `projects-view` als Template-String duplizieren:
```js
    // Phase-0-Empty-State wird als Fallback verwendet wenn /api/projects
    // eine leere Liste liefert. Muss 1:1 dem Markup von `projects-view`
    // entsprechen (siehe HTML-Sektion oben).
    const PROJECTS_EMPTY_HTML = `
      <div class="cmd-output-block" role="region" aria-label="Projekte — leer">
        <div class="cmd-line cmd-line--prompt">
          <span class="cmd-prompt">$</span>
          <span class="cmd-command">hub projects list</span>
        </div>
        <hr class="cmd-rule">
        <div class="cmd-line cmd-line--lead">
          <span class="cmd-marker">›</span>
          <span>no ROADMAP.md files discovered yet.</span>
        </div>
        <div class="cmd-block">
          <p>Lege eine <span class="cmd-path">ROADMAP.md</span> in einem Projekt unter <span class="cmd-path">~/Projects/*</span> an — beim nächsten Server-Start wird sie automatisch registriert.</p>
        </div>
        <hr class="cmd-rule">
        <div class="cmd-status">
          <span class="cmd-status-item"><span class="cmd-status-dot"></span>status:&nbsp;<strong>empty</strong></span>
          <span class="cmd-cursor" aria-hidden="true">▊</span>
        </div>
      </div>`;
```

- [ ] **Step 3: CSS für `.project-list` + `.project-card`**

In der `<style>`-Sektion von `public/index.html`, in der Nähe der `/* ── Project-Detail-View */`-Section (aktuell Zeile 569), ergänzen:
```css
    /* ── Projects-List (Phase 1) ──────────────────────────────────── */
    .project-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      padding: 4px;
    }
    .project-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: var(--bg-elev-1, #161b22);
      border: 1px solid var(--border, #30363d);
      border-radius: 12px;
      color: inherit;
      text-align: left;
      font: inherit;
      cursor: pointer;
      transition: border-color 120ms, transform 120ms;
    }
    .project-card:hover { border-color: var(--accent, #2dd4bf); transform: translateY(-1px); }
    .project-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .project-card-name { font-weight: 600; font-size: 15px; }
    .project-missing {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px; padding: 2px 6px;
      border: 1px solid #f87171; color: #f87171; border-radius: 999px;
    }
    .project-card-versions {
      display: flex; gap: 8px; align-items: center;
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: var(--muted, #8b949e);
    }
    .project-card-versions strong { color: var(--fg, #c9d1d9); }
    .project-card-sep { opacity: 0.5; }
    .project-card-progress { display: flex; flex-direction: column; gap: 4px; }
    .project-card-progress-bar {
      height: 4px; background: var(--bg-elev-2, #21262d); border-radius: 2px; overflow: hidden;
    }
    .project-card-progress-bar > div {
      height: 100%; background: var(--accent, #2dd4bf); transition: width 200ms;
    }
    .project-card-progress-text {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      color: var(--muted, #8b949e);
    }
```

- [ ] **Step 4: Tab-Switch-Hook — `renderProjects()` aufrufen**

In `public/index.html`, in der `setTab(tab)`-Funktion (ca. Zeile 2023), direkt vor der schließenden `}` der Funktion ergänzen:
```js
      if (tab === 'projects') renderProjects();
```
(Analog zum existierenden `if (tab === 'usage') renderUsage();`-Pattern. Falls dieser `if` nicht existiert: den `renderUsage()`-Call suchen und in der gleichen Zeile ergänzen.)

- [ ] **Step 5: Server neu starten, Browser testen**

Run: Server neu starten (Ctrl+C + `npm start`).
Im Browser: Hub öffnen → Tab „Projekte" klicken.
Expected:
- Mindestens eine Projekt-Karte sichtbar (falls ROADMAP.md-Dateien existieren), oder der Empty-State.
- Hover-Effekt funktioniert (Teal-Border).
- DevTools-Network: `/api/projects` liefert 200.
- Klick auf eine Karte → `body[data-current-view]` wechselt auf `project-detail` (DevTools-Inspector), Detail-View wird sichtbar (Phase-0-Shell, noch kein Content — kommt in Task 8).

- [ ] **Step 6: Checkpoint — Liste rendert**

---

## Task 8: Frontend — Project-Detail-View mit echtem Content

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: `renderProjectDetail(id)` anlegen**

In `public/index.html`, nach `renderProjects()`, ergänzen:
```js
    // ── Project-Detail-View (Phase 1 Step 1, read-only) ───────────
    async function renderProjectDetail(id) {
      const body  = document.querySelector('#project-detail-view .detail-body');
      const title = document.getElementById('project-detail-title');
      if (!body || !title) return;
      title.textContent = '…';
      body.innerHTML = '<div class="usage-empty">Lade Projekt…</div>';
      try {
        const res = await fetch('/api/projects/' + encodeURIComponent(id), { headers: apiHeaders() });
        if (res.status === 401) { clearToken(); showLoginModal(); return; }
        if (res.status === 404) {
          title.textContent = id;
          body.innerHTML = '<div class="usage-empty">Projekt nicht gefunden.</div>';
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const p = await res.json();
        title.textContent = p.displayName;

        const renderItem = (it) => `
          <li class="roadmap-item${it.done ? ' done' : ''}">
            <span class="roadmap-checkbox" aria-hidden="true">${it.done ? '[x]' : '[ ]'}</span>
            <span class="roadmap-text">${escapeHtml(it.text)}</span>
            ${Object.keys(it.meta).length
              ? `<span class="roadmap-meta">${escapeHtml(JSON.stringify(it.meta))}</span>`
              : ''}
          </li>`;

        const section = (label, version, items) => `
          <section class="roadmap-section">
            <h3>${label}${version ? ` · <span class="roadmap-version">v${escapeHtml(version)}</span>` : ''}</h3>
            ${items.length
              ? `<ul class="roadmap-list">${items.map(renderItem).join('')}</ul>`
              : '<p class="roadmap-empty">— leer —</p>'}
          </section>`;

        const changelogBlock = p.changelog
          ? `<section class="roadmap-section">
               <h3>Changelog</h3>
               <pre class="roadmap-changelog">${escapeHtml(p.changelog)}</pre>
             </section>`
          : '';

        body.innerHTML = `
          <div class="roadmap-meta-line">
            <span class="cmd-path">${escapeHtml(p.path)}</span>
          </div>
          ${section('Released', p.released.version, p.released.items)}
          ${section('In Entwicklung', p.dev.version, p.dev.items)}
          ${section('Backlog / Ideen', null, p.backlog)}
          ${changelogBlock}
        `;
      } catch (e) {
        body.innerHTML = `<div class="usage-empty">Fehler: ${escapeHtml(e.message)}</div>`;
      }
    }
```

- [ ] **Step 2: `setView` hookt `renderProjectDetail` ein**

In `public/index.html` die `setView(name, opts = {})`-Funktion finden (ca. Zeile 1977). Direkt **nach** dem Block, der `history.pushState({ view: 'project-detail', projectId }, '')` schreibt, ergänzen:
```js
      if (name === 'project-detail') {
        const id = opts.projectId ?? history.state?.projectId;
        if (id) renderProjectDetail(id);
      }
```
(Der Block muss _innerhalb_ von `setView` liegen, _nach_ dem History-Push-Block — sodass auch popstate den Reload triggert.)

- [ ] **Step 3: CSS für Roadmap-Liste**

In der `<style>`-Sektion, nahe `/* ── Projects-List */` aus Task 7, ergänzen:
```css
    /* ── Roadmap-Detail (Phase 1) ─────────────────────────────────── */
    .roadmap-meta-line {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: var(--muted, #8b949e);
      padding: 8px 12px; margin-bottom: 12px;
      border-bottom: 1px dashed var(--border, #30363d);
    }
    .roadmap-section { margin: 20px 0; }
    .roadmap-section h3 {
      font-size: 13px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--muted, #8b949e);
      margin: 0 0 10px;
    }
    .roadmap-version { color: var(--accent, #2dd4bf); font-family: 'JetBrains Mono', monospace; }
    .roadmap-list { list-style: none; margin: 0; padding: 0; }
    .roadmap-item {
      display: flex; gap: 8px; align-items: baseline;
      padding: 6px 12px; font-size: 14px;
      border-left: 2px solid transparent;
    }
    .roadmap-item.done { opacity: 0.55; }
    .roadmap-item.done .roadmap-text { text-decoration: line-through; }
    .roadmap-checkbox {
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: var(--accent, #2dd4bf); flex-shrink: 0;
    }
    .roadmap-text { flex: 1; }
    .roadmap-meta {
      font-family: 'JetBrains Mono', monospace; font-size: 10px;
      color: var(--muted, #8b949e); opacity: 0.7;
    }
    .roadmap-empty {
      font-family: 'JetBrains Mono', monospace; font-size: 12px;
      color: var(--muted, #8b949e); padding: 6px 12px;
    }
    .roadmap-changelog {
      font-family: 'JetBrains Mono', monospace; font-size: 11px;
      line-height: 1.5; white-space: pre-wrap; word-break: break-word;
      background: var(--bg-elev-2, #0d1117); padding: 12px; border-radius: 8px;
      color: var(--fg, #c9d1d9);
      max-height: 300px; overflow: auto;
    }
```

- [ ] **Step 4: Server neu starten, Browser End-to-End-Test**

Run: Server neu starten.
Im Browser:
1. Tab „Projekte" → Karte anklicken.
2. Detail-View öffnet sich, zeigt Titel = `displayName`, Pfad, und die vier Sektionen.
3. Items mit `[x]` sind durchgestrichen, Backlog-Items sind sichtbar, Changelog als `<pre>` falls vorhanden.
4. Zurück-Button (Header) → zurück zum Dashboard.
5. Browser-Back (⌘←) → funktioniert genauso.
6. Reload bei offener Detail-View (F5) → History-State rehydriert, Detail-View wird neu gerendert (falls bei `setView('project-detail')` der `projectId` aus `history.state` kommt).

Fehler-Szenario testen:
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3333/api/projects/nonexistent-id
```
Expected: 404-JSON. Im Browser: `setView('project-detail', {projectId: 'nonexistent-id'})` in der Console → „Projekt nicht gefunden."

- [ ] **Step 5: Checkpoint — Step 1 komplett**

---

## Task 9: Abschluss — Dokumentation + todo.md-Update

**Files:**
- Modify: `todo.md`

- [ ] **Step 1: `todo.md` aktualisieren**

In `todo.md` die Projekt-Verwaltungs-Section (`- [~] **Projekt-Verwaltung**`) anpassen:
- Phase 0 bleibt wie gehabt
- Phase 1 Status: `Step 1 erledigt <YYYY-MM-DD>, Step 2/3 offen`
- Unter Phase 1 einen neuen Unterpunkt `**Step 1 (erledigt):**` anlegen, analog zu Phase 0, mit Bullet-Liste dessen was jetzt drin ist (Parser, Registry, 2 Endpoints, UI-Content).

Den Text bewusst kurz halten — Details stehen in diesem Plan-Dokument.

- [ ] **Step 2: Phase-Indikator-Dot im UI-Tab aktualisieren**

In `public/index.html` das `title`-Attribut am `tab-projects`-Button (Zeile 1666) aktualisieren:
```html
              <button class="dashboard-tab dashboard-tab--new" id="tab-projects" data-tab="projects" type="button" role="tab" title="Projekt-Verwaltung (Phase 1 Step 1 — read-only)">
```

Falls es im Dot-Indicator einen `data-phase`- oder ähnlichen Attribut-Hook gibt, den entsprechend von `0` auf `1` setzen (kurz im `<style>`-Block nach `dashboard-tab--new` suchen und anpassen).

- [ ] **Step 3: Finaler Smoke-Test**

Server neu starten. Im Browser:
- Sessions-Tab: funktioniert wie vorher, Context-Badge rendert
- Usage-Tab: funktioniert wie vorher
- Projekte-Tab: zeigt Liste, Karten klickbar
- Detail-View: rendert alle Sektionen
- Terminal-Attach (zur Sicherheit): eine bestehende Session öffnen, prüfen dass tmux weiterhin läuft

- [ ] **Step 4: LaunchAgent wieder scharf schalten**

Run:
```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```
(Nur falls der LaunchAgent vorher aktiv war. Sonst überspringen.)

- [ ] **Step 5: Checkpoint — Step 1 abgeschlossen**

Damit ist das Fundament bereit für Step 2 (Mutationen + File-Watcher).

---

## Offene Punkte für Step 2 (nicht jetzt)

- Atomarer Write mit Line-Offset-basiertem Toggle (nutzt `item.line` aus Parser)
- `POST /api/projects` + Template-ROADMAP.md
- `PATCH /api/projects/:id/items` (toggle / add / delete)
- `fs.watch`-basierter Live-Sync via WebSocket
- Optimistic UI im Frontend (Checkbox sofort toggeln, Revert bei Fehler)
- Session-Badge via cwd-Prefix-Match (Step 3)
- „Version abschließen"-Flow (Step 3)
