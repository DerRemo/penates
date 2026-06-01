import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Redirect the registry to a temp dir BEFORE importing projects.js, so the
// test never touches the user's real ~/.claude-code-hub registry. Dynamic
// import ensures projects.js reads the env at module-eval time after we set it.
const regDir = mkdtempSync(join(tmpdir(), 'cchub-reg-'));
process.env.CCHUB_REGISTRY_DIR = regDir;
const { listProjects, discoverProjects, patchProject, getProject, setProjectPinned, removeProject } = await import('./projects.js');

test('listProjects exposes ROADMAP.md mtimeMs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cchub-proj-'));
  const proj = join(root, 'demo');
  mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), '## Released: v1.0.0\n\n- [x] done\n');
  await discoverProjects([root]);
  const list = await listProjects();
  const entry = list.find(p => p.path === proj);
  assert.ok(entry, 'project should be discovered');
  assert.equal(typeof entry.mtimeMs, 'number');
  assert.ok(entry.mtimeMs > 0);
  rmSync(root, { recursive: true, force: true });
});

// ── patchProject edit / move / set-version (Phase 4) ──────────────────────────
// Hermetic: own temp root + project per test, discoverProjects registers it,
// patchProject returns the fresh detail object inside-lock.

// ROADMAP fixture with deterministic line numbers (1-based):
//  1: ## Released: v1.0.0
//  2: (blank)
//  3: - [x] rel-done
//  4: (blank)
//  5: ## In Development: v1.1.0
//  6: (blank)
//  7: - [ ] dev-task {priority: p0}
//  8: (blank)
//  9: ## Backlog / Ideas
// 10: (blank)
// 11: - [ ] back-idea
// 12: (blank)
// 13: ## Changelog
// 14: (blank)
// 15: ### v1.0.0 — 2026-01-01
function detailFixture() {
  return [
    '## Released: v1.0.0', '',
    '- [x] rel-done', '',
    '## In Development: v1.1.0', '',
    '- [ ] dev-task {priority: p0}', '',
    '## Backlog / Ideas', '',
    '- [ ] back-idea', '',
    '## Changelog', '',
    '### v1.0.0 — 2026-01-01', '',
  ].join('\n');
}

async function makeProject(content) {
  const root = mkdtempSync(join(tmpdir(), 'cchub-p4-'));
  const proj = join(root, 'p4demo');
  mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), content);
  await discoverProjects([root]);
  const list = await listProjects();
  const entry = list.find(p => p.path === proj);
  assert.ok(entry, 'project should be discovered');
  return { root, id: entry.id };
}

test("patchProject action:'edit' ersetzt den Item-Text (dev-Item)", async () => {
  const { root, id } = await makeProject(detailFixture());
  // dev-task ist Zeile 7
  const fresh = await patchProject(id, { action: 'edit', section: 'dev', line: 7, text: 'dev-task neu' });
  const dev = fresh.dev.items.find(i => i.text === 'dev-task neu');
  assert.ok(dev, 'edited item should appear with new text');
  assert.equal(dev.meta.priority, 'p0', 'meta-suffix bleibt erhalten');
  assert.equal(dev.done, false, 'checkbox-state bleibt');
  assert.equal(fresh.dev.items.some(i => i.text === 'dev-task'), false, 'old text gone');
  rmSync(root, { recursive: true, force: true });
});

test("patchProject action:'move' verschiebt Backlog-Item nach dev", async () => {
  const { root, id } = await makeProject(detailFixture());
  // back-idea ist Zeile 11
  const fresh = await patchProject(id, { action: 'move', section: 'backlog', line: 11, toSection: 'dev' });
  assert.ok(fresh.dev.items.some(i => i.text === 'back-idea'), 'item now in dev');
  assert.equal(fresh.backlog.some(i => i.text === 'back-idea'), false, 'item no longer in backlog');
  rmSync(root, { recursive: true, force: true });
});

test("patchProject action:'set-version' setzt released.version", async () => {
  const { root, id } = await makeProject(detailFixture());
  const fresh = await patchProject(id, { action: 'set-version', section: 'released', version: '2.0.0' });
  assert.equal(fresh.released.version, '2.0.0');
  // persisted, nicht nur in-memory:
  const reread = await getProject(id);
  assert.equal(reread.released.version, '2.0.0');
  rmSync(root, { recursive: true, force: true });
});

test("patchProject set-version mit section:'backlog' wirft bad-body", async () => {
  const { root, id } = await makeProject(detailFixture());
  await assert.rejects(
    () => patchProject(id, { action: 'set-version', section: 'backlog', version: '2.0.0' }),
    (err) => { assert.equal(err.code, 'bad-body'); return true; },
  );
  rmSync(root, { recursive: true, force: true });
});

test("patchProject edit mit leerem text wirft bad-body", async () => {
  const { root, id } = await makeProject(detailFixture());
  await assert.rejects(
    () => patchProject(id, { action: 'edit', section: 'dev', line: 7, text: '   ' }),
    (err) => { assert.equal(err.code, 'bad-body'); return true; },
  );
  rmSync(root, { recursive: true, force: true });
});

// ── Phase 5: setProjectPinned + removeProject ────────────────────────────────
test('setProjectPinned toggelt pinned und listProjects reicht es durch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cch-pin-'));
  const proj = join(root, 'p'); mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), '## Released: v1.0.0\n- [x] a\n');
  await discoverProjects([root]);
  const before = (await listProjects()).find(p => p.path === proj);
  assert.equal(before.pinned, false);
  await setProjectPinned(before.id, true);
  const after = (await listProjects()).find(p => p.path === proj);
  assert.equal(after.pinned, true);
  rmSync(root, { recursive: true, force: true });
});
test('setProjectPinned wirft unknown-id', async () => {
  await assert.rejects(() => setProjectPinned('nope-xyz', true), e => e.code === 'unknown-id');
});
test('removeProject deregistriert das Projekt (Datei bleibt)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cch-rm-'));
  const proj = join(root, 'q'); mkdirSync(proj);
  const md = join(proj, 'ROADMAP.md');
  writeFileSync(md, '## Released: v1.0.0\n- [x] a\n');
  await discoverProjects([root]);
  const e = (await listProjects()).find(p => p.path === proj);
  await removeProject(e.id);
  assert.equal((await listProjects()).find(p => p.path === proj), undefined);
  assert.equal(existsSync(md), true); // Datei NICHT gelöscht
  rmSync(root, { recursive: true, force: true });
});
test('removeProject wirft unknown-id', async () => {
  await assert.rejects(() => removeProject('nope-xyz'), e => e.code === 'unknown-id');
});

// ── Phase 6: patchProject reorder ────────────────────────────────────────────
// ROADMAP fixture für reorder-Tests:
//  1: ## In Development: v1.0.0
//  2: (blank)
//  3: - [ ] one
//  4: - [ ] two
//  5: - [ ] three
function reorderFixture() {
  return ['## In Development: v1.0.0', '', '- [ ] one', '- [ ] two', '- [ ] three', ''].join('\n');
}

test("patchProject action:'reorder' verschiebt Item an Index 0 (three → first)", async () => {
  const root = mkdtempSync(join(tmpdir(), 'cchub-reorder-'));
  const proj = join(root, 'reorder-demo');
  mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), reorderFixture());
  await discoverProjects([root]);
  const list = await listProjects();
  const entry = list.find(p => p.path === proj);
  assert.ok(entry, 'project should be discovered');
  // "three" is on line 5 in the fixture
  const fresh = await patchProject(entry.id, { action: 'reorder', section: 'dev', line: 5, toIndex: 0 });
  assert.equal(fresh.dev.items[0].text, 'three', 'three should now be first');
  rmSync(root, { recursive: true, force: true });
});

test("patchProject action:'reorder' mit nicht-integer toIndex wirft bad-body", async () => {
  const root = mkdtempSync(join(tmpdir(), 'cchub-reorder-bad-'));
  const proj = join(root, 'reorder-bad');
  mkdirSync(proj);
  writeFileSync(join(proj, 'ROADMAP.md'), reorderFixture());
  await discoverProjects([root]);
  const list = await listProjects();
  const entry = list.find(p => p.path === proj);
  assert.ok(entry, 'project should be discovered');
  await assert.rejects(
    () => patchProject(entry.id, { action: 'reorder', section: 'dev', line: 5, toIndex: 'foo' }),
    (err) => { assert.equal(err.code, 'bad-body'); return true; },
  );
  rmSync(root, { recursive: true, force: true });
});
