import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as board from './board.js';
import { parseRoadmap } from './roadmap.js';

let dir;
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'board-'));
  process.env.BOARD_PATH = join(dir, 'board.json');
});

// load() liest den (frischen, leeren) BOARD_PATH und setzt den State zurück →
// jeder Test ist isoliert, ohne ESM-Cache-Bust nötig.
async function fresh() { await board.load(); return board; }

test('addCard creates an idea card with defaults', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'Dark mode' });
  assert.equal(c.projectId, 'p1');
  assert.equal(c.title, 'Dark mode');
  assert.equal(c.stage, 'idea');
  assert.equal(c.origin, 'solo');
  assert.equal(c.priority, null);
  assert.ok(c.id && c.createdAt && c.updatedAt);
  assert.deepEqual(b.listCards().map(x => x.id), [c.id]);
});

test('listCards filters by projectId', async () => {
  const b = await fresh();
  await b.addCard({ projectId: 'p1', title: 'A' });
  await b.addCard({ projectId: 'p2', title: 'B' });
  assert.equal(b.listCards({ projectId: 'p1' }).length, 1);
  assert.equal(b.listCards().length, 2);
});

test('updateCard whitelists fields (title/priority/theme only)', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'A' });
  const u = await b.updateCard(c.id, { title: 'A2', priority: 'p1', stage: 'done', id: 'hack' });
  assert.equal(u.title, 'A2');
  assert.equal(u.priority, 'p1');
  assert.equal(u.stage, 'idea');   // stage NOT changed via updateCard
  assert.equal(u.id, c.id);        // id immutable
});

test('moveCard changes stage + order', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'A' });
  const m = await b.moveCard(c.id, 'implement', 3);
  assert.equal(m.stage, 'implement');
  assert.equal(m.order, 3);
});

test('moveCard rejects unknown stage', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'A' });
  await assert.rejects(() => b.moveCard(c.id, 'nonsense', 0), /bad-stage/);
});

test('addCard rejects bad input', async () => {
  const b = await fresh();
  await assert.rejects(() => b.addCard({ title: 'no project' }), /bad-projectId/);
  await assert.rejects(() => b.addCard({ projectId: 'p1' }), /bad-title/);
  await assert.rejects(() => b.addCard({ projectId: 'p1', title: 'x', priority: 'p9' }), /bad-priority/);
});

test('deleteCard removes it', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'A' });
  await b.deleteCard(c.id);
  assert.equal(b.listCards().length, 0);
});

test('persists across reload', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p1', title: 'A' });
  await b.load();   // re-read the same BOARD_PATH
  assert.equal(b.listCards()[0].id, c.id);
});

// ── Migration ──────────────────────────────────────────────────────────
const SAMPLE = `# Demo

## Released: v1.0.0
- [x] shipped thing

## In Development: v1.1.0
- [ ] wip thing

## Backlog / Ideas
- [ ] Dark mode {priority: p1, theme: ui}
- [ ] Export CSV

## Changelog
narrative
`;

test('migrateBacklog: backlog → idea cards, file renamed, section stripped, idempotent', async () => {
  const b = await fresh();
  const proj = await fs.mkdtemp(join(tmpdir(), 'mproj-'));
  await fs.writeFile(join(proj, 'ROADMAP.md'), SAMPLE);
  await fs.writeFile(join(proj, '.gitignore'), 'node_modules\nROADMAP.md\n.env\n');

  const n = await b.migrateBacklog([{ id: 'demo', path: proj }]);
  assert.equal(n, 2);
  const cards = b.listCards({ projectId: 'demo' });
  assert.equal(cards.length, 2);
  assert.ok(cards.every(c => c.stage === 'idea'));
  const dark = cards.find(c => c.title === 'Dark mode');
  assert.ok(dark, 'Dark mode card exists');
  assert.equal(dark.priority, 'p1');
  assert.equal(dark.theme, 'ui');

  await assert.rejects(() => fs.access(join(proj, 'ROADMAP.md')));
  const out = await fs.readFile(join(proj, 'CHANGELOG.md'), 'utf8');
  assert.ok(!/## Backlog/.test(out));
  const parsed = parseRoadmap(out);
  assert.equal(parsed.released.version, '1.0.0');
  assert.equal(parsed.dev.version, '1.1.0');
  const gi = await fs.readFile(join(proj, '.gitignore'), 'utf8');
  assert.ok(!/^ROADMAP\.md$/m.test(gi));
  const files = await fs.readdir(proj);
  assert.ok(files.some(f => f.startsWith('ROADMAP.md.bak-')), 'backup exists');

  const n2 = await b.migrateBacklog([{ id: 'demo', path: proj }]);
  assert.equal(n2, 0);
  assert.equal(b.listCards({ projectId: 'demo' }).length, 2);
});

test('stripBacklogSection removes only the backlog section', async () => {
  const out = board.stripBacklogSection(SAMPLE);
  assert.ok(!/## Backlog/.test(out));
  assert.ok(/## Released: v1.0.0/.test(out));
  assert.ok(/## In Development: v1.1.0/.test(out));
  assert.ok(/## Changelog/.test(out));
  assert.ok(/narrative/.test(out));
});

// ── Phase 3: sessionRef + brainstormDoc fields ──────────────────────────────

test('addCard initializes sessionRef and brainstormDoc to null', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p', title: 'idea' });
  assert.equal(c.sessionRef, null);
  assert.equal(c.brainstormDoc, null);
});

test('updateCard sets and clears sessionRef and brainstormDoc', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p', title: 'idea' });
  const u1 = await b.updateCard(c.id, { sessionRef: 'cc-idea', brainstormDoc: 'docs/x.md' });
  assert.equal(u1.sessionRef, 'cc-idea');
  assert.equal(u1.brainstormDoc, 'docs/x.md');
  const u2 = await b.updateCard(c.id, { sessionRef: null, brainstormDoc: null });
  assert.equal(u2.sessionRef, null);
  assert.equal(u2.brainstormDoc, null);
});

test('updateCard rejects non-string sessionRef', async () => {
  const b = await fresh();
  const c = await b.addCard({ projectId: 'p', title: 'idea' });
  await assert.rejects(() => b.updateCard(c.id, { sessionRef: 123 }), /bad-sessionRef/);
});
