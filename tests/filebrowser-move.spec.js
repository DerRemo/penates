import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal, getToken, openFileSidebar } from './helpers.js';

// Native HTML5 drag-and-drop is unreliable in Playwright, so the DnD *path
// logic* is covered by unit tests + the "Move to…" dialog flow below (which
// shares submitMoveCopy with the drop handler). The DnD *gesture* itself is
// verified manually in the real app (see the plan's manual matrix).
//
// Each test runs in an isolated temp-dir session so the hub repo is never
// touched. Modeled on the "git markers" test in filebrowser.spec.js.
async function makeTempSession(page, seed = {}) {
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { tmpdir } = await import('os');
  const dir = mkdtempSync(join(tmpdir(), 'penates-mv-'));
  // Base fixture every test relies on: a root foo.txt and an empty src/ folder.
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'foo.txt'), 'CONTENT\n');
  // Extra seed entries (any relative path → nested dirs created as needed).
  for (const [rel, content] of Object.entries(seed)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  const name = `e2e-mv-${Date.now()}`;
  const token = await getToken(page);
  const res = await page.request.post('/api/sessions', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, directory: dir, command: 'bash --noprofile --norc' },
  });
  expect(res.ok(), `session create failed: ${res.status()}`).toBeTruthy();
  return { dir, name, token };
}

// Read the live project id the frontend uses for the file API (session:cc-… for
// ad-hoc sessions) so API assertions don't have to guess the id format.
async function currentProjectId(page) {
  return page.evaluate(() => window.currentProjectId);
}

async function listFolder(page, token, projId, relPath) {
  const r = await page.request.get(
    `/api/projects/${encodeURIComponent(projId)}/files?path=${encodeURIComponent(relPath)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok()) return null;
  const body = await r.json();
  return body.entries.map(e => e.name);
}

async function openSessionWithSidebar(page, name) {
  await page.reload();
  await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
  await navigateToSession(page, `cc-${name}`);
  await waitForTerminal(page);
  await openFileSidebar(page);
}

async function openMoveDialog(page) {
  const fileRow = page.locator('#files-tree .file-row[data-path="foo.txt"]');
  await fileRow.waitFor({ timeout: 8_000 });
  await fileRow.click({ button: 'right' });
  await page.locator('.penates-contextmenu').waitFor({ timeout: 3_000 });
  // "Move to…" (ellipsis) — NOT "Move to Trash".
  await page.locator('.penates-contextmenu button', { hasText: /Move to…|Verschieben nach…/ }).click();
  const input = page.locator('#penates-input-field');
  await input.waitFor({ timeout: 3_000 });
  return input;
}

// Synthetic in-tree drag-and-drop: dispatch dragstart→dragover→drop with ONE
// shared DataTransfer so the drop handler can read getData(PATH_TYPE). The
// native OS gesture is unreliable in Playwright, but the synthetic dispatch
// reliably exercises the real wireTreeDnD drop handler (per the spec's
// "add it if it runs stably" note). The pure gesture is verified manually.
async function dndRowToDir(page, fromPath, destPath, { alt = false } = {}) {
  const res = await page.evaluate(({ fromPath, destPath, alt }) => {
    const src = document.querySelector(`#files-tree .file-row[data-path="${fromPath}"]`);
    const dst = destPath === ''
      ? document.getElementById('files-tree')
      : document.querySelector(`#files-tree .file-row[data-path="${destPath}"]`);
    if (!src || !dst) return { ok: false, why: `missing ${!src ? 'src ' + fromPath : 'dst ' + destPath}` };
    const dt = new DataTransfer();
    const fire = (el, type) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, altKey: alt });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      el.dispatchEvent(ev);
    };
    fire(src, 'dragstart');
    fire(dst, 'dragover');
    fire(dst, 'drop');
    return { ok: true };
  }, { fromPath, destPath, alt });
  if (!res.ok) throw new Error(`dnd failed: ${res.why}`);
}

test.describe('Filebrowser move (keystone + conflict)', () => {
  test('Move-to dialog: typing only a folder name drops the file into the folder', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click');
    const { name, token } = await makeTempSession(page);
    try {
      await openSessionWithSidebar(page, name);
      const projId = await currentProjectId(page);

      const input = await openMoveDialog(page);
      await input.fill('src');                 // <-- only the folder name (the old bug)
      await page.locator('#penates-input-ok').click();

      // foo.txt is now inside src/ (keystone: basename appended to the folder).
      await expect.poll(() => listFolder(page, token, projId, 'src'), { timeout: 8_000 }).toContain('foo.txt');
      await expect.poll(() => listFolder(page, token, projId, '')).not.toContain('foo.txt');
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('Conflict flow: moving onto an existing name → choice dialog → Rename → foo-1.txt', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click');
    const { name, token } = await makeTempSession(page, { 'src/foo.txt': 'EXISTING\n' });
    try {
      await openSessionWithSidebar(page, name);
      const projId = await currentProjectId(page);

      const input = await openMoveDialog(page);
      await input.fill('src');
      await page.locator('#penates-input-ok').click();

      // Conflict → choice dialog appears.
      const choice = page.locator('#penates-choice-modal.open');
      await expect(choice).toBeVisible({ timeout: 5_000 });
      await choice.locator('button', { hasText: /Rename|Umbenennen/ }).click();

      // foo-1.txt now exists in src/, and the original foo.txt is untouched.
      await expect.poll(() => listFolder(page, token, projId, 'src'), { timeout: 8_000 }).toContain('foo-1.txt');
      await expect.poll(() => listFolder(page, token, projId, 'src')).toContain('foo.txt');
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('DnD: dropping a file on a folder row moves it into the folder', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'in-tree DnD is a desktop pointer interaction');
    const { name, token } = await makeTempSession(page);
    try {
      await openSessionWithSidebar(page, name);
      const projId = await currentProjectId(page);

      await dndRowToDir(page, 'foo.txt', 'src');
      await expect.poll(() => listFolder(page, token, projId, 'src'), { timeout: 8_000 }).toContain('foo.txt');
      await expect.poll(() => listFolder(page, token, projId, '')).not.toContain('foo.txt');

      // Capture the real UI after the move (toast + refreshed tree) for review.
      await page.screenshot({ path: '/tmp/penates-move-verify/dnd-after-move.png' });
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('DnD: ⌥-drop copies (original stays, duplicate created in folder)', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'in-tree DnD is a desktop pointer interaction');
    const { name, token } = await makeTempSession(page);
    try {
      await openSessionWithSidebar(page, name);
      const projId = await currentProjectId(page);

      await dndRowToDir(page, 'foo.txt', 'src', { alt: true });
      await expect.poll(() => listFolder(page, token, projId, 'src'), { timeout: 8_000 }).toContain('foo.txt');
      // Copy → the original at root must remain.
      expect(await listFolder(page, token, projId, '')).toContain('foo.txt');
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('DnD: conflict on drop opens the choice dialog', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'in-tree DnD is a desktop pointer interaction');
    const { name, token } = await makeTempSession(page, { 'src/foo.txt': 'EXISTING\n' });
    try {
      await openSessionWithSidebar(page, name);

      await dndRowToDir(page, 'foo.txt', 'src');
      const choice = page.locator('#penates-choice-modal.open');
      await expect(choice).toBeVisible({ timeout: 5_000 });
      await page.screenshot({ path: '/tmp/penates-move-verify/dnd-conflict-dialog.png' });
      // Three options present.
      await expect(choice.locator('button', { hasText: /Overwrite|Überschreiben/ })).toBeVisible();
      await expect(choice.locator('button', { hasText: /Rename|Umbenennen/ })).toBeVisible();
      await expect(choice.locator('button', { hasText: /Cancel|Abbrechen/ })).toBeVisible();
      // Cancel leaves everything in place.
      await choice.locator('button', { hasText: /Cancel|Abbrechen/ }).click();
      await expect(choice).toBeHidden();
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('DnD: dropping a folder into its own descendant is refused (no move)', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'in-tree DnD is a desktop pointer interaction');
    const { name, token } = await makeTempSession(page, { 'tree/leaf/x.txt': 'x\n' });
    try {
      await openSessionWithSidebar(page, name);
      const projId = await currentProjectId(page);

      // Expand "tree" so the tree/leaf row exists as a drop target.
      await page.locator('#files-tree .file-row[data-path="tree"]').click();
      await page.locator('#files-tree .file-row[data-path="tree/leaf"]').waitFor({ timeout: 5_000 });
      await dndRowToDir(page, 'tree', 'tree/leaf');

      // The guard fires client-side → no request → leaf must not gain a "tree" entry.
      await page.waitForTimeout(600);
      expect(await listFolder(page, token, projId, 'tree/leaf')).not.toContain('tree');
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });
});
