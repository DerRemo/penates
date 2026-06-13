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
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const dir = mkdtempSync(join(tmpdir(), 'cchub-mv-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'foo.txt'), 'CONTENT\n');
  if (seed['src/foo.txt']) writeFileSync(join(dir, 'src', 'foo.txt'), seed['src/foo.txt']);
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
  await page.locator('.cchub-contextmenu').waitFor({ timeout: 3_000 });
  // "Move to…" (ellipsis) — NOT "Move to Trash".
  await page.locator('.cchub-contextmenu button', { hasText: /Move to…|Verschieben nach…/ }).click();
  const input = page.locator('#cchub-input-field');
  await input.waitFor({ timeout: 3_000 });
  return input;
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
      await page.locator('#cchub-input-ok').click();

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
      await page.locator('#cchub-input-ok').click();

      // Conflict → choice dialog appears.
      const choice = page.locator('#cchub-choice-modal.open');
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
});
