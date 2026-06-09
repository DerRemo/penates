// Persistenter Kanban-Board-State (Idea Pipeline). Eine Karte = eine Idee mit
// Stufe, Projekt-Zuordnung und (ab Phase 2+) Artefakt-Links. Atomare Writes via
// tmp+rename wie lib/known-sessions.js. BOARD_PATH überschreibbar (Tests).
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import { parseRoadmap } from './roadmap.js';

const STORE_DIR = join(homedir(), '.claude-code-hub');
const boardPath = () => process.env.BOARD_PATH || join(STORE_DIR, 'board.json');

export const STAGES = ['idea', 'brainstorming', 'spec', 'implement', 'review', 'done'];
const PRIORITIES = ['p0', 'p1', 'p2'];

let state = { version: 1, migratedAt: null, cards: [] };
let loaded = false;
let saveQueue = Promise.resolve();

export async function load() {
  try {
    const parsed = JSON.parse(await fs.readFile(boardPath(), 'utf-8'));
    state = {
      version: 1,
      migratedAt: parsed?.migratedAt ?? null,
      cards: Array.isArray(parsed?.cards) ? parsed.cards : [],
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      state = { version: 1, migratedAt: null, cards: [] };
    } else if (err instanceof SyntaxError) {
      const backup = `${boardPath()}.corrupt-${Date.now()}`;
      try { await fs.rename(boardPath(), backup); } catch {}
      state = { version: 1, migratedAt: null, cards: [] };
    } else { throw err; }
  }
  loaded = true;
}

function save() {
  const doSave = async () => {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const p = boardPath();
    const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmp, p);
  };
  saveQueue = saveQueue.then(doSave, doSave);
  return saveQueue;
}

function assertLoaded() { if (!loaded) throw new Error('board: call load() before use'); }
const clone = (c) => ({ ...c });

export function listCards({ projectId } = {}) {
  assertLoaded();
  return state.cards
    .filter(c => !projectId || c.projectId === projectId)
    .map(clone);
}

export function getCard(id) {
  assertLoaded();
  const c = state.cards.find(x => x.id === id);
  return c ? clone(c) : null;
}

function maxOrder(stage) {
  return state.cards.filter(c => c.stage === stage).reduce((m, c) => Math.max(m, c.order ?? 0), -1);
}

export async function addCard({ projectId, title, priority = null, origin = 'solo', stage = 'idea', theme = null }) {
  assertLoaded();
  if (!projectId || typeof projectId !== 'string') throw new Error('bad-projectId');
  if (!title || typeof title !== 'string') throw new Error('bad-title');
  if (!STAGES.includes(stage)) throw new Error('bad-stage');
  if (priority !== null && !PRIORITIES.includes(priority)) throw new Error('bad-priority');
  const now = new Date().toISOString();
  const card = {
    id: randomUUID(),
    projectId,
    title: title.slice(0, 500),
    priority,
    stage,
    origin: origin === 'collab' ? 'collab' : 'solo',
    theme: theme || null,
    order: maxOrder(stage) + 1,
    createdAt: now,
    updatedAt: now,
  };
  state.cards.push(card);
  await save();
  return clone(card);
}

export async function updateCard(id, patch = {}) {
  assertLoaded();
  const card = state.cards.find(x => x.id === id);
  if (!card) throw new Error('unknown-id');
  if (typeof patch.title === 'string') card.title = patch.title.slice(0, 500);
  if ('priority' in patch) {
    if (patch.priority !== null && !PRIORITIES.includes(patch.priority)) throw new Error('bad-priority');
    card.priority = patch.priority;
  }
  if ('theme' in patch) card.theme = patch.theme || null;
  card.updatedAt = new Date().toISOString();
  await save();
  return clone(card);
}

export async function moveCard(id, stage, order) {
  assertLoaded();
  const card = state.cards.find(x => x.id === id);
  if (!card) throw new Error('unknown-id');
  if (!STAGES.includes(stage)) throw new Error('bad-stage');
  card.stage = stage;
  card.order = Number.isFinite(order) ? order : maxOrder(stage) + 1;
  card.updatedAt = new Date().toISOString();
  await save();
  return clone(card);
}

export async function deleteCard(id) {
  assertLoaded();
  const i = state.cards.findIndex(x => x.id === id);
  if (i === -1) throw new Error('unknown-id');
  state.cards.splice(i, 1);
  await save();
}

// ── Migration (Phase-1 Cutover) ─────────────────────────────────────────

// Entfernt die `## Backlog`-Sektion (Header bis exkl. nächstem `## ` / EOF) aus
// dem Markdown, lässt alle anderen Sektionen unberührt. Reine String-Operation.
export function stripBacklogSection(content) {
  const lines = content.split('\n');
  const isBacklog = (l) => /^##\s+Backlog(\s*\/\s*Ideas?)?\s*$/i.test(l);
  const isH2 = (l) => /^##\s+/.test(l);
  const start = lines.findIndex(isBacklog);
  if (start === -1) return content;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { if (isH2(lines[i])) { end = i; break; } }
  let s = start;
  while (s > 0 && lines[s - 1].trim() === '') s--;   // führende Leerzeilen mitnehmen
  lines.splice(s, end - s);
  return lines.join('\n');
}

// Migriert den Backlog der gegebenen Projekte in Karten und benennt die Datei in
// CHANGELOG.md um. Idempotent: Projekte mit existierender CHANGELOG.md werden
// übersprungen. Liefert die Zahl neu erzeugter Karten. Backup vor jedem Schreiben.
export async function migrateBacklog(projects) {
  assertLoaded();
  let created = 0;
  for (const p of projects) {
    const changelog = join(p.path, 'CHANGELOG.md');
    const roadmap = join(p.path, 'ROADMAP.md');
    try { await fs.access(changelog); continue; } catch {}      // schon migriert → skip
    let content;
    try { content = await fs.readFile(roadmap, 'utf8'); } catch { continue; } // kein ROADMAP.md
    const parsed = parseRoadmap(content);
    for (const it of (parsed.backlog || [])) {
      const prio = PRIORITIES.includes(it.meta?.priority) ? it.meta.priority : null;
      await addCard({
        projectId: p.id,
        title: it.text,
        priority: prio,
        theme: it.meta?.theme || null,
        origin: 'solo',
        stage: 'idea',
      });
      created++;
    }
    await fs.copyFile(roadmap, `${roadmap}.bak-${Date.now()}`);
    await fs.writeFile(changelog, stripBacklogSection(content), 'utf8');
    await fs.rm(roadmap);
    // .gitignore: ROADMAP.md-Zeile entfernen → CHANGELOG.md wird getrackt
    const giPath = join(p.path, '.gitignore');
    try {
      const gi = await fs.readFile(giPath, 'utf8');
      const next = gi.split('\n').filter(l => l.trim() !== 'ROADMAP.md' && l.trim() !== '/ROADMAP.md').join('\n');
      if (next !== gi) await fs.writeFile(giPath, next, 'utf8');
    } catch {}
  }
  if (projects.length) { state.migratedAt = new Date().toISOString(); await save(); }
  return created;
}
