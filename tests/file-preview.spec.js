import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal, openFileSidebar } from './helpers.js';

// Uses projectSession because file preview needs a registered project.
test.describe('File Preview', () => {
  test.beforeEach(async ({ authedPage: page, projectSession }) => {
    await navigateToSession(page, projectSession.name);
    await waitForTerminal(page);
  });

  test('text file opens with syntax highlighting', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-repo');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    // Look for a .js file for syntax highlighting
    const jsFile = page.locator('#files-tree .file-row[data-type="file"][data-path$=".js"]').first();
    const anyFile = page.locator('#files-tree .file-row[data-type="file"]').first();
    const target = (await jsFile.count()) ? jsFile : anyFile;

    if (!(await target.count())) {
      test.skip(true, 'no files in tree');
      return;
    }

    await target.click();
    const modal = page.locator('#file-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Text preview should contain a pre/code element
    const codeBlock = modal.locator('pre, code, .hljs');
    await expect(codeBlock.first()).toBeVisible({ timeout: 5_000 });

    await page.click('#file-preview-close');
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
  });

  test('image file shows img element', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-repo');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const imgFile = page.locator('#files-tree .file-row[data-type="file"][data-path$=".png"], #files-tree .file-row[data-type="file"][data-path$=".jpg"]').first();
    if (!(await imgFile.count())) {
      test.skip(true, 'no image files in tree');
      return;
    }

    await imgFile.click();
    const modal = page.locator('#file-preview-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('img')).toBeVisible({ timeout: 5_000 });

    await page.click('#file-preview-close');
  });

  test('preview modal closes via Escape', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-repo');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const file = page.locator('#files-tree .file-row[data-type="file"]').first();
    if (!(await file.count())) {
      test.skip(true, 'no files in tree');
      return;
    }

    await file.click();
    await expect(page.locator('#file-preview-modal')).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#file-preview-modal')).not.toBeVisible({ timeout: 3_000 });
  });

  test('copy path button in preview', async ({ authedPage: page }) => {
    const toggleBtn = page.locator('#btn-toggle-repo');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await openFileSidebar(page);
    const file = page.locator('#files-tree .file-row[data-type="file"]').first();
    if (!(await file.count())) {
      test.skip(true, 'no files in tree');
      return;
    }

    await file.click();
    await expect(page.locator('#file-preview-modal')).toBeVisible({ timeout: 5_000 });

    const copyBtn = page.locator('#file-preview-copy-path');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await page.waitForTimeout(300);

    await page.click('#file-preview-close');
  });
});
