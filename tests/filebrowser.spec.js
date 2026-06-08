import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal, getToken, openFileSidebar } from './helpers.js';
import { readFileSync } from 'fs';

// Filebrowser tests use the always-running cc-claude-code-hub session
// because the file API requires a registered project (projectId).
test.describe('Filebrowser', () => {
  let sessionName;

  test.beforeEach(async ({ authedPage: page, projectSession }) => {
    sessionName = projectSession.name;
    await navigateToSession(page, sessionName);
    await waitForTerminal(page);
  });

  test('sidebar opens and closes via toggle', async ({ authedPage: page, isTouch }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    const btnVisible = await toggleBtn.isVisible();
    if (!btnVisible) {
      test.skip(true, 'file toggle not visible (no project context)');
      return;
    }

    const sidebar = page.locator('#files-sidebar');
    const wasOpen = await sidebar.evaluate(el => el.classList.contains('open'));

    if (wasOpen) {
      await page.click('#files-close');
      await expect(sidebar).not.toHaveClass(/open/, { timeout: 3_000 });
    }

    await toggleBtn.click();
    await expect(sidebar).toHaveClass(/open/, { timeout: 5_000 });

    await page.click('#files-close');
    await expect(sidebar).not.toHaveClass(/open/, { timeout: 3_000 });
  });

  test('file tree loads and shows entries', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const rows = page.locator('#files-tree .file-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('folder expand loads children (lazy)', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const dirRow = page.locator('#files-tree .file-row[data-type="dir"]').first();
    if (!(await dirRow.count())) {
      test.skip(true, 'no directories in tree');
      return;
    }

    const wasExpanded = await dirRow.evaluate(el => el.classList.contains('expanded'));
    if (wasExpanded) {
      await dirRow.click();
      await expect(dirRow).not.toHaveClass(/expanded/, { timeout: 3_000 });
    }

    await dirRow.click();
    await expect(dirRow).toHaveClass(/expanded/, { timeout: 5_000 });
  });

  test('mkdir creates folder via toolbar', async ({ authedPage: page, projectSession }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const folderName = `e2e-mkdir-${Date.now()}`;
    // mkdir is now an inline input row at the top of the tree (no window.prompt).
    await page.click('#files-mkdir');
    const createInput = page.locator('.file-create-row .rename-input');
    await createInput.waitFor({ timeout: 5_000 });
    await createInput.fill(folderName);
    await createInput.press('Enter');

    const newRow = page.locator(`#files-tree .file-row[data-path="${folderName}"]`);
    await newRow.waitFor({ timeout: 10_000 });
    await expect(newRow).toBeVisible();

    // Cleanup: delete created folder via API
    const token = await getToken(page);
    await page.request.delete(`/api/projects/${projectSession.projectId}/files`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { paths: [folderName] },
    }).catch(() => {});
  });

  test('context menu rename works', async ({ authedPage: page, projectSession, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click, not available on touch devices');
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);

    const origName = `e2e-rename-${Date.now()}`;
    // Seed via API (mkdir is inline now); then refresh the tree.
    {
      const token = await getToken(page);
      await page.request.post(`/api/projects/${projectSession.projectId}/files/mkdir`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { path: '', name: origName },
      });
      await page.click('#files-refresh');
    }
    const row = page.locator(`#files-tree .file-row[data-path="${origName}"]`);
    await row.waitFor({ timeout: 10_000 });

    let newName;
    try {
      await row.click({ button: 'right' });
      const menu = page.locator('.cchub-contextmenu');
      await menu.waitFor({ timeout: 3_000 });
      await menu.locator('button', { hasText: /Rename|Umbenennen/i }).click();

      const input = row.locator('.rename-input');
      await input.waitFor({ timeout: 3_000 });
      newName = `e2e-renamed-${Date.now()}`;
      await input.fill(newName);
      await input.press('Enter');

      const renamedRow = page.locator(`#files-tree .file-row[data-path="${newName}"]`);
      await renamedRow.waitFor({ timeout: 5_000 });
      await expect(renamedRow).toBeVisible();
    } finally {
      // Cleanup: remove whichever name ended up on disk
      const token = await getToken(page);
      const namesToTry = [newName, origName].filter(Boolean);
      for (const n of namesToTry) {
        await page.request.delete(`/api/projects/${projectSession.projectId}/files`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: { paths: [n] },
        }).catch(() => {});
      }
    }
  });

  test('delete uses a themed dialog, not the legacy ✓? second-click', async ({ authedPage: page, projectSession, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click, not available on touch devices');
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    // Eine wegwerfbare Datei via API anlegen, damit der Test idempotent ist.
    const projId = projectSession.projectId;
    const token = await getToken(page);
    const fname = `e2e-del-${Date.now()}.txt`;
    await page.request.post(`/api/projects/${encodeURIComponent(projId)}/files/new`, {
      headers: { Authorization: `Bearer ${token}` }, data: { path: '', name: fname },
    });
    await page.click('#files-refresh');
    const row = page.locator(`#files-tree .file-row[data-path="${fname}"]`);
    await row.waitFor({ timeout: 5000 });
    await row.click({ button: 'right' });
    await page.getByText(/Move to Trash|In den Papierkorb/).first().click();
    // Themed Dialog erscheint (kein ✓?-Label am Row).
    await expect(page.locator('#cchub-confirm-modal.open')).toBeVisible();
    await expect(row).not.toContainText('✓?');
    await page.locator('#cchub-confirm-ok').click();
    await expect(page.locator(`#files-tree .file-row[data-path="${fname}"]`)).toHaveCount(0, { timeout: 5000 });
  });

  test('context menu copy path', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click, not available on touch devices');
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const firstRow = page.locator('#files-tree .file-row').first();
    await firstRow.click({ button: 'right' });
    const menu = page.locator('.cchub-contextmenu');
    await menu.waitFor({ timeout: 3_000 });
    const copyPathBtn = menu.locator('button', { hasText: /Copy Path|Pfad/i });
    if (await copyPathBtn.count() > 0) {
      await copyPathBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('refresh button reloads tree', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const countBefore = await page.locator('#files-tree .file-row').count();
    await page.click('#files-refresh');
    await page.waitForTimeout(1_000);
    const countAfter = await page.locator('#files-tree .file-row').count();
    expect(countAfter).toBeGreaterThan(0);
  });

  test('sidebar state persists after reload', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);

    await page.reload();
    await page.waitForSelector('body[data-current-view]', { timeout: 10_000 });
    if (await page.locator('body').getAttribute('data-current-view') === 'dashboard') {
      await navigateToSession(page, sessionName);
      await waitForTerminal(page);
    }

    await page.waitForTimeout(2_000);
    const sidebar = page.locator('#files-sidebar');
    const isOpen = await sidebar.evaluate(el => el.classList.contains('open'));
    expect(isOpen).toBe(true);
  });

  test('sidebar resize via drag handle', async ({ authedPage: page, isTouch }) => {
    test.skip(isTouch, 'drag resize not available on touch devices');

    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const handle = page.locator('#files-resizer, .files-resizer, .files-sidebar-handle, .resize-handle');
    if (await handle.count() === 0) {
      test.skip(true, 'no resize handle found');
      return;
    }

    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  });

  test('upload file picker button exists', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    await expect(page.locator('#files-upload-picker')).toBeVisible();
  });

  test('filter menu toggles hidden files via all=1', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const before = await page.locator('#files-tree .file-row').count();
    await page.click('#files-filter');
    await expect(page.locator('.files-filter-menu')).toBeVisible();
    await page.getByText(/Show hidden|Versteckte anzeigen/).click();
    // Dotfiles erscheinen → mehr oder gleich viele Zeilen (mind. nicht weniger).
    await expect.poll(async () => page.locator('#files-tree .file-row').count()).toBeGreaterThanOrEqual(before);
    // Pref persisted to localStorage.
    const pref = await page.evaluate(() => localStorage.getItem('cchub_files_show_hidden'));
    expect(pref).toBe('1');
    // Toggle back off to restore the default for other tests.
    await page.click('#files-filter');
    await page.getByText(/Show hidden|Versteckte anzeigen/).click();
    await expect.poll(async () => page.evaluate(() => localStorage.getItem('cchub_files_show_hidden'))).toBe('0');
  });

  test('breadcrumb shows the panel root name', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const bc = page.locator('#files-breadcrumb');
    await expect(bc).not.toHaveText('/');
    await expect(bc.locator('.bc-root')).toBeVisible();
  });

  test('fuzzy search filters loaded rows and highlights matches', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const total = await page.locator('#files-tree .file-row').count();
    if (total < 2) { test.skip(true, 'need >=2 rows'); return; }
    // Namen einer existierenden Zeile holen und tippfehler-behaftet suchen.
    const firstName = await page.locator('#files-tree .file-row').first().getAttribute('data-path');
    const base = firstName.split('/').pop();
    await page.fill('#files-search-input', base.slice(0, Math.max(2, base.length - 1)));
    await expect(page.locator('#files-tree .file-row:not([hidden])')).not.toHaveCount(total);
    await page.fill('#files-search-input', '');
    await expect(page.locator('#files-tree .file-row:not([hidden])')).toHaveCount(total);
  });

  test('files toolbar is icon-only with tooltips and the panel is a card', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const refresh = page.locator('#files-refresh');
    await expect(refresh).toHaveAttribute('data-tooltip', /.+/);
    await expect(refresh.locator('svg')).toBeVisible();
    const radius = await page.locator('#files-sidebar').evaluate(el => getComputedStyle(el).borderTopLeftRadius);
    expect(parseInt(radius, 10)).toBeGreaterThan(0);
  });

  test('cmd/ctrl-click multi-selects and shows the action bar', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const rows = page.locator('#files-tree .file-row');
    if (await rows.count() < 2) { test.skip(true, 'need >=2 rows'); return; }
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await rows.nth(0).click({ modifiers: [mod] });
    await rows.nth(1).click({ modifiers: [mod] });
    await expect(page.locator('.file-row.selected')).toHaveCount(2);
    await expect(page.locator('#files-selbar')).toBeVisible();
    await expect(page.locator('#files-selbar-count')).toContainText(/2/);
    await page.locator('#files-sel-clear').click();
    await expect(page.locator('#files-selbar')).toBeHidden();
  });

  test('file rows use Catppuccin icon images (no emoji)', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) { test.skip(true, 'file toggle not visible'); return; }
    await openFileSidebar(page);
    const firstIconImg = page.locator('#files-tree .file-row .icon img').first();
    await expect(firstIconImg).toHaveAttribute('src', /catppuccin-icons\/.+\.svg/);
  });

  test('downloads a file via context menu', async ({ authedPage: page, projectSession, isTouch }) => {
    test.skip(isTouch, 'context menu requires right-click, not available on touch devices');

    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    // Seed a known file via the upload API so we can assert its content after download
    const fileName = `e2e-download-${Date.now()}.txt`;
    const fileContent = `Hello from Playwright download test! (${Date.now()})`;
    const token = await getToken(page);

    const formData = new FormData();
    formData.append('file', new Blob([fileContent], { type: 'text/plain' }), fileName);

    const uploadRes = await page.request.post(
      `/api/projects/${projectSession.projectId}/files/upload`,
      {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          file: {
            name: fileName,
            mimeType: 'text/plain',
            buffer: Buffer.from(fileContent),
          },
        },
      }
    );
    expect(uploadRes.ok(), `Upload failed: ${uploadRes.status()}`).toBeTruthy();

    try {
      await openFileSidebar(page);

      // Refresh tree to ensure the new file is visible
      await page.click('#files-refresh');
      await page.waitForTimeout(1_000);

      const fileRow = page.locator(`#files-tree .file-row[data-path="${fileName}"]`);
      await fileRow.waitFor({ timeout: 8_000 });
      await expect(fileRow).toBeVisible();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        (async () => {
          await fileRow.click({ button: 'right' });
          const menu = page.locator('.cchub-contextmenu');
          await menu.waitFor({ timeout: 3_000 });
          await menu.locator('button', { hasText: /download/i }).click();
        })(),
      ]);

      const downloadPath = await download.path();
      const downloadedContent = readFileSync(downloadPath, 'utf8');
      expect(downloadedContent).toBe(fileContent);
    } finally {
      // Cleanup: delete the seeded file
      await page.request.delete(`/api/projects/${projectSession.projectId}/files`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { paths: [fileName] },
      }).catch(() => {});
    }
  });
});
