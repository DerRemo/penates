// Projekt-Registry für Claude Code Hub.
//
// Verwaltet ~/.claude-code-hub/projects.json — eine flache Liste registrierter
// Projekte (id, displayName, path). Beim Server-Start scannt discoverProjects()
// konfigurierende Root-Verzeichnisse und fügt neue Projekte automatisch hinzu
// (Erkennung: Unterverzeichnis enthält ROADMAP.md).
//
// Öffentliche API:
//   loadRegistry()           → async → { version, projects } (liest Singleton)
//   mutateRegistry(fn)       → async → fn bekommt mutable reg, write-locked
//   discoverProjects(roots)  → async → { added, total }
//   listProjects()           → async → Array<ProjectSummary>
//   getProject(id)           → async → ProjectDetail | null
//   patchProject(id, body)   → async → fresh ProjectDetail (inside-lock)
//   _resetRegistryCache()    → test hook
//
// Registry ist ein Long-Lived-Singleton: einmal von Disk geladen, danach
// im Speicher. Writes gehen durch `mutateRegistry`, das via `withFileLock`
// serialisiert und denselben Singleton in-place aktualisiert. Reader-Pfade
// (`listProjects`, `getProject`, `patchProject`) sehen damit keine halb-
// geschriebenen Zustände.
//
// Atomischer Write: temp file (*.tmp) + fs.rename — verhindert halbgares JSON
// bei einem Absturz oder SIGTERM während des Schreibvorgangs.

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parseRoadmap } from './roadmap.js';
import { mutateRoadmap, withFileLock } from './mutations.js';
import { toggleItem, addItem, deleteItem, finalizeRelease, editItem, moveItem, setSectionVersion, reorderItem } from './roadmap-writer.js';

const REGISTRY_DIR  = process.env.CCHUB_REGISTRY_DIR || join(homedir(), '.claude-code-hub');
const REGISTRY_PATH = join(REGISTRY_DIR, 'projects.json');
const REGISTRY_TMP  = join(REGISTRY_DIR, 'projects.json.tmp');

// Bevorzugt CHANGELOG.md (neuer Name nach dem Idea-Pipeline-Cutover), fällt auf
// ROADMAP.md zurück (un-migrierte Projekte). Liefert den absoluten Pfad oder
// null, wenn keine der beiden Dateien existiert.
export async function resolveProjectDoc(projectPath) {
  for (const name of ['CHANGELOG.md', 'ROADMAP.md']) {
    try { await fs.access(join(projectPath, name)); return join(projectPath, name); }
    catch {}
  }
  return null;
}

const EMPTY_REGISTRY = () => ({ version: 1, projects: [] });

// Keine Control-Chars oder }/{ in User-Content — würde ROADMAP.md-Format
// zerschießen (Newlines machen aus einem Item zwei, } schließt den
// Meta-Suffix vorzeitig).
const RE_UNSAFE_CHARS = /[\x00-\x1f\x7f{}]/;

function codedError(code, detail) {
  const err = new Error(code);
  err.code = code;
  if (detail) err.detail = detail;
  return err;
}

function badBody(detail) {
  return codedError('bad-body', detail);
}

// ── Registry-Singleton ───────────────────────────────────────────────────────
// Nach dem ersten Disk-Read bleibt die Registry im Speicher. Alle Reader
// bekommen dieselbe Reference — Mutationen MÜSSEN durch `mutateRegistry`
// laufen, sonst sehen andere Reader halbgare Zwischenzustände. Read-Pfade
// lesen Felder direkt, kopieren aber ihre Rückgaben (kein Alias-Leak).

let cachedRegistry = null;
let loadPromise = null;

async function readFromDisk() {
  let raw;
  try {
    raw = await fs.readFile(REGISTRY_PATH, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return EMPTY_REGISTRY();
    throw e;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.projects)) return parsed;
    console.warn('[projects] registry JSON malformed, starting fresh: projects is not an array');
    return EMPTY_REGISTRY();
  } catch (e) {
    console.warn(`[projects] registry JSON malformed, starting fresh: ${e.message}`);
    return EMPTY_REGISTRY();
  }
}

async function writeToDisk(reg) {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
  const json = JSON.stringify(reg, null, 2);
  await fs.writeFile(REGISTRY_TMP, json, 'utf8');
  await fs.rename(REGISTRY_TMP, REGISTRY_PATH);
}

// Lädt die Registry einmalig. Paralleler Erst-Load wird deduped via
// `loadPromise`, sonst liefen bei Server-Start zwei readFile gleichzeitig.
export async function loadRegistry() {
  if (cachedRegistry) return cachedRegistry;
  if (loadPromise) return loadPromise;
  loadPromise = readFromDisk().then(reg => {
    cachedRegistry = reg;
    loadPromise = null;
    return reg;
  }).catch(e => {
    loadPromise = null;
    throw e;
  });
  return loadPromise;
}

// Schreibend auf die Registry zugreifen. Serialisiert über einen Mutex auf
// dem Registry-Pfad — verhindert Lost-Updates zwischen `discoverProjects`,
// einem zukünftigen `createProject` und manuellen Edits an projects.json.
//
// Clone + Swap statt in-place Mutation: `fn` bekommt einen frischen Clone
// der aktuellen Registry und darf darauf schreiben, ohne dass parallele
// Reader (`listProjects`, `getProject`) halbgare Zwischenstände sehen.
// Am Ende wird `cachedRegistry` atomar auf die neue Version geswappt und —
// wenn die JSON-Serialisierung sich geändert hat — nach Disk geschrieben.
// Der Write-Skip vermeidet überflüssige fs.watch-Events bei No-Op-Scans.
export async function mutateRegistry(fn) {
  return withFileLock(REGISTRY_PATH, async () => {
    if (!cachedRegistry) cachedRegistry = await readFromDisk();
    const before = JSON.stringify(cachedRegistry);
    const draft = JSON.parse(before);
    const result = await fn(draft);
    const after = JSON.stringify(draft);
    if (before !== after) {
      cachedRegistry = draft;
      await writeToDisk(draft);
    }
    return result;
  });
}

// Test-Hook: Cache leeren, sodass der nächste `loadRegistry()`-Call wieder
// von Disk liest. Produktions-Code soll das nie aufrufen.
export function _resetRegistryCache() {
  cachedRegistry = null;
  loadPromise = null;
}

// Synchroner Lese-Zugriff auf die schon geladene Registry (oder [] wenn noch
// nicht geladen). Für Hot-Path-Handler wie GET /api/sessions, die kein await
// vertragen — nach dem Boot (discoverProjects → loadRegistry) ist der Cache da.
export function getProjectsSync() {
  return cachedRegistry ? cachedRegistry.projects.slice() : [];
}

// ── discoverProjects ──────────────────────────────────────────────────────────
// Scannt jedes Root-Verzeichnis aus `roots`. Für jedes Kind-Verzeichnis:
//   1. Prüfe ob ROADMAP.md existiert.
//   2. Wenn ja UND der Pfad noch nicht in der Registry ist → hinzufügen.
// ID = basename(path), Kollisionen bekommen Suffix -2, -3, …
// Läuft unter `mutateRegistry`, schreibt nur wenn added > 0 — aber der Lock
// wird in jedem Fall gehalten, damit zwei parallele Scans nicht doppelt
// hinzufügen.
export async function discoverProjects(roots) {
  return mutateRegistry(async (reg) => {
    const existingPaths = new Set(reg.projects.map(p => p.path));
    const takenIds = new Set(reg.projects.map(p => p.id));

    let added = 0;
    const scanResults = await Promise.all(roots.map(async (root) => {
      try {
        return { root, children: await fs.readdir(root, { withFileTypes: true }) };
      } catch {
        return { root, children: [] };
      }
    }));

    for (const { root, children } of scanResults) {
      for (const entry of children) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;  // versteckte Ordner überspringen
        const absPath = join(root, entry.name);
        if (existingPaths.has(absPath)) continue;

        // Jeder (nicht-versteckte) Top-Level-Ordner unter den Roots ist ein Projekt.
        // Ohne CHANGELOG.md/ROADMAP.md wird es als `missing:true` gelistet (Frontend
        // rendert das sicher) — der User pflegt das Plan-Doc bei Bedarf nach.

        const base = basename(absPath);
        let id = base;
        let suffix = 2;
        while (takenIds.has(id)) {
          id = `${base}-${suffix}`;
          suffix++;
        }

        reg.projects.push({ id, displayName: base, path: absPath });
        existingPaths.add(absPath);
        takenIds.add(id);
        added++;
      }
    }

    return { added, total: reg.projects.length };
  });
}

// ── setProjectPinned ────────────────────────────────────────────────────────
// Setzt/entfernt das `pinned`-Flag eines Registry-Entries. `false` löscht das
// Feld (hält die Registry sauber). Wirft 'unknown-id'.
export async function setProjectPinned(id, pinned) {
  return mutateRegistry((reg) => {
    const entry = reg.projects.find(p => p.id === id);
    if (!entry) throw codedError('unknown-id');
    if (pinned) entry.pinned = true; else delete entry.pinned;
  });
}

// ── removeProject ───────────────────────────────────────────────────────────
// Deregistriert ein Projekt aus der Registry. Löscht KEINE Dateien. Re-Discovery
// kann es später erneut aufnehmen. Wirft 'unknown-id'.
export async function removeProject(id) {
  return mutateRegistry((reg) => {
    const idx = reg.projects.findIndex(p => p.id === id);
    if (idx === -1) throw codedError('unknown-id');
    reg.projects.splice(idx, 1);
  });
}

// ── mapLimit ─────────────────────────────────────────────────────────────────
// Minimaler Concurrency-Pool statt p-limit-Dependency. Ruft `worker(item)` für
// alle items auf, hält aber maximal `limit` gleichzeitig offen. Ergebnis-Order
// matcht Input-Order. Bei 40+ Projekten limitiert das die parallelen File-
// Reads auf einen fairen Wert, statt macOS gleichzeitig 40 fds aufmachen zu
// lassen.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}

// ── listProjects ─────────────────────────────────────────────────────────────
// Liefert Summary-Objekte für alle registrierten Projekte.
// Bei nicht lesbarer / nicht parsebarer ROADMAP.md: missing: true, Zähler = 0.
// File-Reads sind auf LIST_CONCURRENCY parallel gedeckelt (siehe mapLimit).
const LIST_CONCURRENCY = 8;
export async function listProjects() {
  const reg = await loadRegistry();
  return mapLimit(reg.projects, LIST_CONCURRENCY, async entry => {
    const roadmapPath = (await resolveProjectDoc(entry.path)) || join(entry.path, 'ROADMAP.md');
    let roadmap;
    let mtimeMs;
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(roadmapPath, 'utf8'),
        fs.stat(roadmapPath),
      ]);
      mtimeMs = stat.mtimeMs;
      roadmap = parseRoadmap(content);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(`[projects] parse failed for ${entry.id}: ${e.message}`);
      }
      return {
        id: entry.id,
        displayName: entry.displayName,
        path: entry.path,
        pinned: entry.pinned === true,
        released: { version: null, done: 0, total: 0 },
        dev: { version: null, done: 0, total: 0 },
        backlogCount: 0,
        missing: true,
        mtimeMs: null,
      };
    }

    const relItems = roadmap.released.items;
    const devItems = roadmap.dev.items;

    return {
      id: entry.id,
      displayName: entry.displayName,
      path: entry.path,
      pinned: entry.pinned === true,
      released: {
        version: roadmap.released.version,
        done:  relItems.filter(i => i.done).length,
        total: relItems.length,
      },
      dev: {
        version: roadmap.dev.version,
        done:  devItems.filter(i => i.done).length,
        total: devItems.length,
      },
      backlogCount: roadmap.backlog.length,
      missing: false,
      mtimeMs,
    };
  });
}

// ── getProject ────────────────────────────────────────────────────────────────
// Gibt vollständiges Projekt-Objekt zurück (Entry + alle geparsten Roadmap-Felder).
// Gibt null zurück wenn id unbekannt (→ 404).
// Gibt partial object mit missing:true zurück wenn registriert aber ROADMAP.md
// nicht lesbar/parsebar (Frontend rendert Fallback-View).
export async function getProject(id) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) return null;

  let content;
  try {
    const docPath = (await resolveProjectDoc(entry.path)) || join(entry.path, 'ROADMAP.md');
    content = await fs.readFile(docPath, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.warn(`[projects] parse failed for ${entry.id}: ${e.message}`);
    }
    // Missing-Shape mirrort die normale Detail-Antwort, damit Step-2-Write-Back
    // keine zwei Shapes unterscheiden muss — released/dev/backlog/changelog/
    // unknown existieren immer, sind bei missing:true aber leer.
    return {
      id: entry.id,
      displayName: entry.displayName,
      path: entry.path,
      pinned: entry.pinned === true,
      missing: true,
      released: { version: null, items: [] },
      dev: { version: null, items: [] },
      backlog: [],
      changelog: '',
      unknown: [],
    };
  }

  const roadmap = parseRoadmap(content);
  return {
    id: entry.id,
    displayName: entry.displayName,
    path: entry.path,
    pinned: entry.pinned === true,
    ...roadmap,
  };
}

// ── patchProject ──────────────────────────────────────────────────────────────
// Mutiert ein ROADMAP.md-Item (toggle / delete / add / edit / move /
// set-version) und gibt das frisch gelesene Projekt-Objekt zurück. Alle Fehler
// tragen ein `.code`-Feld, das der HTTP-Schicht das Mapping auf Statuscodes
// erlaubt.
//
// Fehler-Codes:
//   'unknown-id'        — Projekt-ID nicht in Registry
//   'bad-action'        — action ∉ { toggle, delete, add, edit, move, set-version }
//   'bad-body'          — ungültige Felder (section, line, text, meta, version, toSection)
//   'missing-roadmap'   — ROADMAP.md fehlt im Projektpfad
//   'stale'             — line-Offset zeigt kein Checkbox-Item mehr
//   'section-not-found' — Section-Header in ROADMAP.md nicht gefunden
export async function patchProject(id, body) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) throw codedError('unknown-id');

  const action = body.action;
  if (!['toggle', 'delete', 'add', 'edit', 'move', 'set-version', 'reorder'].includes(action)) throw codedError('bad-action');

  let mutator;

  if (action === 'set-version') {
    const section = body.section;
    if (section !== 'released' && section !== 'dev') throw badBody('section must be released or dev for set-version');
    const version = body.version;
    if (typeof version !== 'string' || !/^[0-9A-Za-z.\-+]{1,40}$/.test(version)) throw badBody('version must be semver-like (1..40 of [0-9A-Za-z.+-])');
    mutator = (c) => setSectionVersion(c, section, version);
  } else {
    const section = body.section;
    if (!['released', 'dev', 'backlog'].includes(section)) {
      throw badBody('section must be one of released/dev/backlog');
    }
    if (action === 'toggle' || action === 'delete') {
      const line = body.line;
      if (!Number.isInteger(line) || line < 1) throw badBody('line must be a positive integer');
      mutator = action === 'toggle' ? (c) => toggleItem(c, line) : (c) => deleteItem(c, line);
    } else if (action === 'edit') {
      const line = body.line;
      if (!Number.isInteger(line) || line < 1) throw badBody('line must be a positive integer');
      const rawText = body.text;
      if (typeof rawText !== 'string' || rawText.trim().length === 0 || rawText.trim().length > 500) throw badBody('text must be 1..500 chars');
      if (RE_UNSAFE_CHARS.test(rawText)) throw badBody('text contains control chars or braces');
      mutator = (c) => editItem(c, line, rawText.trim());
    } else if (action === 'move') {
      const line = body.line;
      if (!Number.isInteger(line) || line < 1) throw badBody('line must be a positive integer');
      const toSection = body.toSection;
      if (!['released', 'dev', 'backlog'].includes(toSection)) throw badBody('toSection must be one of released/dev/backlog');
      mutator = (c) => moveItem(c, line, toSection);
    } else if (action === 'reorder') {
      const line = body.line;
      if (!Number.isInteger(line) || line < 1) throw badBody('line must be a positive integer');
      const toIndex = body.toIndex;
      if (!Number.isInteger(toIndex) || toIndex < 0) throw badBody('toIndex must be a non-negative integer');
      mutator = (c) => reorderItem(c, section, line, toIndex);
    } else {
      // action === 'add'
      const rawText = body.text;
      if (typeof rawText !== 'string' || rawText.trim().length === 0 || rawText.trim().length > 500) {
        throw badBody('text must be 1..500 chars');
      }
      if (RE_UNSAFE_CHARS.test(rawText)) {
        throw badBody('text contains control chars or braces');
      }
      const text = rawText.trim();

      let meta;
      if (body.meta !== undefined) {
        if (
          !body.meta ||
          typeof body.meta !== 'object' ||
          Array.isArray(body.meta)
        ) {
          throw badBody('meta must be a plain object');
        }
        const RESERVED = ['__proto__', 'constructor', 'prototype'];
        const keys = Object.keys(body.meta);
        if (keys.length > 10) {
          throw badBody('meta must have at most 10 keys');
        }
        for (const k of keys) {
          if (RESERVED.includes(k)) throw badBody(`meta key '${k}' is reserved`);
          if (k.length === 0) throw badBody('meta key must be non-empty');
          if (RE_UNSAFE_CHARS.test(k)) throw badBody('meta key contains control chars or braces');
          if (k.length > 60) throw badBody('meta keys must be ≤ 60 chars');
          const v = body.meta[k];
          if (typeof v !== 'string') throw badBody('meta values must be strings');
          if (RE_UNSAFE_CHARS.test(v)) throw badBody('meta value contains control chars or braces');
          if (v.length > 60) throw badBody('meta values must be ≤ 60 chars');
        }
        meta = body.meta;
      }

      mutator = (c) => addItem(c, section, text, meta);
    }
  }

  let fresh;
  try {
    const res = await mutateRoadmap(entry.path, mutator);
    fresh = res.roadmap;
  } catch (e) {
    if (e.code === 'ENOENT') throw codedError('missing-roadmap');
    if (e.message === 'stale' || e.message === 'section-not-found') {
      throw codedError(e.message);
    }
    // Folgende Strings müssen mit lib/roadmap-writer.js synchron bleiben.
    if (['invalid-content', 'text-has-trailing-braces', 'meta-value-not-string', 'bad-version'].includes(e.message)) {
      throw badBody(e.message);
    }
    throw e;
  }

  // Fresh Roadmap kommt inside-lock aus mutateRoadmap — keine Race mit
  // einem konkurrenten Schreiber. Shape muss zu getProject() identisch sein
  // (released/dev/backlog/changelog/unknown), damit das Frontend re-rendern
  // kann ohne Sonderfälle.
  return {
    id: entry.id,
    displayName: entry.displayName,
    path: entry.path,
    ...fresh,
  };
}

// ── searchItems ──────────────────────────────────────────────────────────────
// Flache Volltext-Suche über alle registrierten Projekte. Liest jede
// ROADMAP.md über mapLimit (8 parallel), parst sie, und filtert alle
// Items deren Text case-insensitive `query` enthält. Liefert maximal
// `limit` Ergebnisse plus ein `truncated`-Flag damit das Frontend
// einen Hint einblenden kann.
//
// Kein LRU-Cache, kein Invalidation-Gedöns — bei ≤50 Projekten und
// debouncetem Frontend-Input reicht ein nacktes Re-Read. Falls das
// mal skalieren muss: Parser-Output im Watcher cachen.
export async function searchItems(query, { limit = 50 } = {}) {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!q) return { matches: [], truncated: false };

  const reg = await loadRegistry();
  const perProject = await mapLimit(reg.projects, LIST_CONCURRENCY, async (entry) => {
    try {
      const docPath = (await resolveProjectDoc(entry.path)) || join(entry.path, 'ROADMAP.md');
      const content = await fs.readFile(docPath, 'utf8');
      const roadmap = parseRoadmap(content);
      const hits = [];
      const collect = (items, sectionKey) => {
        for (const it of items) {
          if (it.text.toLowerCase().includes(q)) {
            hits.push({
              projectId: entry.id,
              projectName: entry.displayName,
              section: sectionKey,
              line: it.line,
              text: it.text,
              meta: it.meta,
              done: it.done,
            });
          }
        }
      };
      collect(roadmap.released.items, 'released');
      collect(roadmap.dev.items, 'dev');
      collect(roadmap.backlog, 'backlog');
      return hits;
    } catch {
      return [];
    }
  });

  // Reihenfolge: dev → backlog → released (ungeshipt zuerst), innerhalb
  // einer Section stabile Original-Reihenfolge. So tauchen frische Ideen
  // zuerst auf.
  const sectionRank = { dev: 0, backlog: 1, released: 2 };
  const flat = perProject.flat().sort((a, b) => sectionRank[a.section] - sectionRank[b.section]);

  const truncated = flat.length > limit;
  return {
    matches: truncated ? flat.slice(0, limit) : flat,
    truncated,
  };
}

// ── releaseProject ────────────────────────────────────────────────────────────
// Schließt eine Release-Version ab: verschiebt Dev-Items nach Released,
// bumpt beide Versions-Header und prependet ein Changelog-Eintrag.
// Der Mutator läuft über `mutateRoadmap`, ist damit mutex-geschützt
// gegen konkurrente Toggle/Add/Delete-Calls und liefert die frische
// Roadmap inside-lock zurück.
//
// Fehler-Codes (HTTP-Mapping in server.js):
//   'unknown-id'        — Projekt-ID nicht in Registry
//   'missing-roadmap'   — ROADMAP.md fehlt im Projektpfad
//   'bad-body'          — ungültige Versions oder Narrative
//   'section-missing'   — Released/Dev/Changelog-Section nicht da
//   'section-order'     — nicht in Reihenfolge Released→Dev→Changelog
export async function releaseProject(id, body) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) throw codedError('unknown-id');

  const { releaseVersion, newDevVersion, narrative } = body || {};

  let fresh;
  try {
    const res = await mutateRoadmap(entry.path, (content) =>
      finalizeRelease(content, { releaseVersion, newDevVersion, narrative })
    );
    fresh = res.roadmap;
  } catch (e) {
    if (e.code === 'ENOENT') throw codedError('missing-roadmap');
    const m = e.message;
    if (['bad-release-version', 'bad-dev-version', 'bad-narrative', 'invalid-content'].includes(m)) {
      throw badBody(m);
    }
    if (['released-section-missing', 'dev-section-missing', 'changelog-section-missing'].includes(m)) {
      throw codedError('section-missing', m);
    }
    if (m === 'section-order-unsupported') {
      throw codedError('section-order', m);
    }
    throw e;
  }

  return {
    id: entry.id,
    displayName: entry.displayName,
    path: entry.path,
    ...fresh,
  };
}

// ── createProject ─────────────────────────────────────────────────────────────
// Legt ein neues Projekt an: schreibt `ROADMAP.md` mit Template und registriert
// es. Registry-Write läuft unter `mutateRegistry`-Lock — ID-Kollision kann
// dadurch nicht zwischen Check und Add einschlüpfen.
//
// Fehler-Codes (werden von der HTTP-Schicht auf Status gemappt):
//   'bad-body'       — displayName oder path fehlt/invalid
//   'path-exists'    — Zielpfad hat bereits eine ROADMAP.md
//   'path-conflict'  — Pfad ist schon als anderes Projekt registriert
export async function createProject({ displayName, path: projectPath }) {
  if (typeof displayName !== 'string' || !displayName.trim()) {
    throw badBody('displayName required');
  }
  if (displayName.length > 80) throw badBody('displayName too long (max 80)');
  if (RE_UNSAFE_CHARS.test(displayName)) throw badBody('displayName has unsafe chars');

  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw badBody('path required');
  }

  // Pfad muss existieren und ein Verzeichnis sein — sonst landet ROADMAP.md
  // an einer überraschenden Stelle.
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) throw badBody('path is not a directory');
  } catch (e) {
    if (e.code === 'ENOENT') throw badBody('path does not exist');
    throw e;
  }

  const roadmapFile = join(projectPath, 'ROADMAP.md');
  try {
    await fs.access(roadmapFile);
    throw codedError('path-exists', 'ROADMAP.md already exists in this directory');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // ENOENT → gut, wir dürfen schreiben
  }

  const name = displayName.trim();
  const template = renderRoadmapTemplate(name);

  return mutateRegistry(async (reg) => {
    if (reg.projects.some(p => p.path === projectPath)) {
      throw codedError('path-conflict', 'path is already registered as another project');
    }

    // ID = slugified basename, Kollisionen bekommen Suffix -2, -3, …
    // (konsistent mit discoverProjects)
    const takenIds = new Set(reg.projects.map(p => p.id));
    const slug = slugifyId(basename(projectPath) || name);
    let id = slug;
    let suffix = 2;
    while (takenIds.has(id)) {
      id = `${slug}-${suffix}`;
      suffix++;
    }

    // ROADMAP.md atomar schreiben (tmp + rename), damit halbes File bei
    // Crash zwischen write und Registry-Update nicht entsteht.
    const tmp = roadmapFile + '.tmp';
    await fs.writeFile(tmp, template, 'utf8');
    await fs.rename(tmp, roadmapFile);

    reg.projects.push({ id, displayName: name, path: projectPath });
    return { id, displayName: name, path: projectPath };
  });
}

// Slugify: lowercase, nur [a-z0-9-], Spaces → -, restliche Zeichen weg.
// Kollisions-Suffix handled der Caller.
function slugifyId(s) {
  const base = s.toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'project';
}

// Template-ROADMAP.md für neu erstellte Projekte. Der Kommentar-Block am
// Anfang dokumentiert die Parser-Regeln, damit eine Claude-Session im
// Projekt-Ordner beim Öffnen der Datei sofort den Contract sieht, ohne
// zusätzlich CLAUDE.md des Hubs lesen zu müssen. Minimal, aber parser-
// kompatibel — alle drei Hauptsections sind da, damit das Detail-View
// sofort Add-Buttons in allen Sections rendern kann.
function renderRoadmapTemplate(displayName) {
  const today = new Date().toISOString().slice(0, 10);
  return `# ${displayName} — Roadmap

Stand: ${today}. Lebendes Dokument, gepflegt über Claude Code Hub.

<!--
  ╔══════════════════════════════════════════════════════════════════╗
  ║  Parser-Contract — gilt für Claude Code Hub (lib/roadmap.js).     ║
  ║  Das Detail-View im Hub liest/schreibt diese Datei byte-genau.    ║
  ╚══════════════════════════════════════════════════════════════════╝

  Struktur:
    ## Released: vX.Y.Z          letztes Release (live)
    ## In Development: vA.B.C    currently in progress
    ## Backlog / Ideas             open ideas + decisions
    ## Changelog                  freies Markdown, Narrative pro Release

  Items:
    • Nur Top-Level-Checkboxen "- [ ] …" oder "- [x] …".
    • KEINE Indented-Checkboxes (werden als Prosa ignoriert).
    • KEINE Zeichen "{" oder "}" im Item-Text — kollidiert mit Meta-Suffix.
    • Optionales Meta am Zeilenende: "{key: value, key2: value2}"
      Nur am Ende, nur einmal. Strings als Values, keine Quotes.
      Konventionelle Keys: priority (p0/p1/p2), theme (string),
      type (decision), step (string), ship (YYYY-MM-DD).

  Workflow:
    1. Plan feature → add as checkbox in "In Development" or "Backlog".
    2. Done → check the checkbox (or click in Hub Detail View).
    3. Finalize release → move items from "In Development" to "Released",
       write narrative to changelog, bump version.

  Hub-Edits sind parser-safe validiert. Manuelle Edits: Regeln beachten.
-->

## Released: v0.0.0

- [ ] Initiales Setup

## In Development: v0.1.0

- [ ] First feature idea

## Backlog / Ideas

- [ ] Long-term idea

## Changelog

### v0.0.0 — ${today}

Projekt angelegt.
`;
}
