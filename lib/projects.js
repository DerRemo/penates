// Projekt-Registry für Claude Code Hub.
//
// Verwaltet ~/.claude-code-hub/projects.json — eine flache Liste registrierter
// Projekte (id, displayName, path). Beim Server-Start scannt discoverProjects()
// konfigurierende Root-Verzeichnisse und fügt neue Projekte automatisch hinzu
// (Erkennung: Unterverzeichnis enthält ROADMAP.md).
//
// Öffentliche API:
//   loadRegistry()           → async → { version, projects }
//   saveRegistry(reg)        → async → void (atomischer Write)
//   discoverProjects(roots)  → async → { added, total }
//   listProjects()           → async → Array<ProjectSummary>
//   getProject(id)           → async → ProjectDetail | null
//
// Atomischer Write: temp file (*.tmp) + fs.rename — verhindert halbgares JSON
// bei einem Absturz oder SIGTERM während des Schreibvorgangs.

import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parseRoadmap } from './roadmap.js';
import { mutateRoadmap } from './mutations.js';
import { toggleItem, addItem, deleteItem } from './roadmap-writer.js';

const REGISTRY_DIR  = join(homedir(), '.claude-code-hub');
const REGISTRY_PATH = join(REGISTRY_DIR, 'projects.json');
const REGISTRY_TMP  = join(REGISTRY_DIR, 'projects.json.tmp');

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

// ── loadRegistry ─────────────────────────────────────────────────────────────
// Liest projects.json. Gibt leeres Registry zurück wenn die Datei fehlt (ENOENT)
// oder kein valides JSON / unerwartetes Shape enthält. Wirft bei anderen I/O-Fehlern.
export async function loadRegistry() {
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

// ── saveRegistry ─────────────────────────────────────────────────────────────
// Schreibt reg atomar nach REGISTRY_PATH. Erstellt das Verzeichnis bei Bedarf.
export async function saveRegistry(reg) {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
  const json = JSON.stringify(reg, null, 2);
  await fs.writeFile(REGISTRY_TMP, json, 'utf8');
  await fs.rename(REGISTRY_TMP, REGISTRY_PATH);
}

// ── discoverProjects ──────────────────────────────────────────────────────────
// Scannt jedes Root-Verzeichnis aus `roots`. Für jedes Kind-Verzeichnis:
//   1. Prüfe ob ROADMAP.md existiert.
//   2. Wenn ja UND der Pfad noch nicht in der Registry ist → hinzufügen.
// ID = basename(path), Kollisionen bekommen Suffix -2, -3, …
// Speichert nur wenn added > 0.
export async function discoverProjects(roots) {
  const reg = await loadRegistry();
  const existingPaths = new Set(reg.projects.map(p => p.path));
  const takenIds = new Set(reg.projects.map(p => p.id));

  let added = 0;

  for (const root of roots) {
    let children;
    try {
      children = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue; // Root nicht lesbar — überspringen
    }

    for (const entry of children) {
      if (!entry.isDirectory()) continue;
      const absPath = join(root, entry.name);
      if (existingPaths.has(absPath)) continue;

      // ROADMAP.md vorhanden?
      try {
        await fs.access(join(absPath, 'ROADMAP.md'));
      } catch {
        continue; // kein ROADMAP.md → nicht registrieren
      }

      // Kollisionsfreie ID bestimmen
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

  if (added > 0) {
    await saveRegistry(reg);
  }

  return { added, total: reg.projects.length };
}

// ── listProjects ─────────────────────────────────────────────────────────────
// Liefert Summary-Objekte für alle registrierten Projekte.
// Bei nicht lesbarer / nicht parsebarer ROADMAP.md: missing: true, Zähler = 0.
export async function listProjects() {
  const reg = await loadRegistry();
  return Promise.all(reg.projects.map(async entry => {
    let roadmap;
    try {
      const content = await fs.readFile(join(entry.path, 'ROADMAP.md'), 'utf8');
      roadmap = parseRoadmap(content);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(`[projects] parse failed for ${entry.id}: ${e.message}`);
      }
      return {
        id: entry.id,
        displayName: entry.displayName,
        path: entry.path,
        released: { version: null, done: 0, total: 0 },
        dev: { version: null, done: 0, total: 0 },
        backlogCount: 0,
        missing: true,
      };
    }

    const relItems = roadmap.released.items;
    const devItems = roadmap.dev.items;

    return {
      id: entry.id,
      displayName: entry.displayName,
      path: entry.path,
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
    };
  }));
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
    content = await fs.readFile(join(entry.path, 'ROADMAP.md'), 'utf8');
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
    ...roadmap,
  };
}

// ── patchProject ──────────────────────────────────────────────────────────────
// Mutiert ein ROADMAP.md-Item (toggle / delete / add) und gibt das frisch
// gelesene Projekt-Objekt zurück. Alle Fehler tragen ein `.code`-Feld,
// das der HTTP-Schicht das Mapping auf Statuscodes erlaubt.
//
// Fehler-Codes:
//   'unknown-id'        — Projekt-ID nicht in Registry
//   'bad-action'        — action ∉ { toggle, delete, add }
//   'bad-body'          — ungültige Felder (section, line, text, meta)
//   'missing-roadmap'   — ROADMAP.md fehlt im Projektpfad
//   'stale'             — line-Offset zeigt kein Checkbox-Item mehr
//   'section-not-found' — Section-Header in ROADMAP.md nicht gefunden
export async function patchProject(id, body) {
  const reg = await loadRegistry();
  const entry = reg.projects.find(p => p.id === id);
  if (!entry) throw codedError('unknown-id');

  const action = body.action;
  if (!['toggle', 'delete', 'add'].includes(action)) throw codedError('bad-action');

  const section = body.section;
  if (!['released', 'dev', 'backlog'].includes(section)) {
    throw badBody('section must be one of released/dev/backlog');
  }

  let mutator;

  if (action === 'toggle' || action === 'delete') {
    const line = body.line;
    if (!Number.isInteger(line) || line < 1) {
      throw badBody('line must be a positive integer');
    }
    mutator = action === 'toggle'
      ? (c) => toggleItem(c, line)
      : (c) => deleteItem(c, line);

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

  try {
    await mutateRoadmap(entry.path, mutator);
  } catch (e) {
    if (e.code === 'ENOENT') throw codedError('missing-roadmap');
    if (e.message === 'stale' || e.message === 'section-not-found') {
      throw codedError(e.message);
    }
    // Folgende Strings müssen mit lib/roadmap-writer.js synchron bleiben.
    if (['invalid-content', 'text-has-trailing-braces', 'meta-value-not-string'].includes(e.message)) {
      throw badBody(e.message);
    }
    throw e;
  }

  // Lock ist hier bereits freigegeben. Eine konkurrente Mutation könnte
  // zwischen unserem Write und diesem Re-Read einschlüpfen — der Client
  // sieht dann den neueren State statt den, den er gerade erzeugt hat.
  // Für Single-User-Hub akzeptabel (letzter Schreiber gewinnt).
  return getProject(id);
}
