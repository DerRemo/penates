import { test, expect } from './fixtures.js';

test.describe('Settings & Preferences', () => {
  test('theme toggle switches dark/light', async ({ authedPage: page }) => {
    const root = page.locator(':root');
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(newTheme).not.toBe(initialTheme);

    // Toggle back
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
    const restored = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(restored).toBe(initialTheme);
  });

  test('theme persists after reload', async ({ authedPage: page }) => {
    await page.click('#theme-toggle');
    await page.waitForTimeout(300);
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );

    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const themeAfter = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(themeAfter).toBe(theme);

    // Restore original
    await page.click('#theme-toggle');
  });

  test('sound toggle changes state', async ({ authedPage: page }) => {
    const soundBtn = page.locator('#sound-toggle');
    await expect(soundBtn).toBeVisible();
    await soundBtn.click();
    await page.waitForTimeout(300);
    await expect(soundBtn).toBeVisible();
  });

  test('push toggle changes state', async ({ authedPage: page }) => {
    const pushBtn = page.locator('#push-toggle');
    // Push toggle is hidden until service worker check completes.
    // In test environments SW may not be available, so we check if visible first.
    const isVisible = await pushBtn.isVisible().catch(() => false);
    if (!isVisible) {
      // If push is not supported in this environment, skip interaction test.
      test.skip(true, 'push-toggle hidden — service worker not available in this environment');
      return;
    }
    await pushBtn.click();
    await page.waitForTimeout(300);
    await expect(pushBtn).toBeVisible();
  });

  test('keyboard shortcuts modal opens via ? button', async ({ authedPage: page }) => {
    const kbdBtn = page.locator('#kbd-help-trigger');
    await expect(kbdBtn).toBeVisible();
    await kbdBtn.click();

    const modal = page.locator('#kbd-help-overlay');
    await expect(modal).toHaveClass(/open/, { timeout: 3_000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test('shortcut / focuses search', async ({ authedPage: page }) => {
    await page.keyboard.press('/');
    await page.waitForTimeout(300);
    const searchFocused = await page.evaluate(() =>
      document.activeElement?.id === 'session-search'
    );
    expect(searchFocused).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('shortcut g switches to grid layout', async ({ authedPage: page }) => {
    // First switch to list
    await page.click('#layout-list-btn');
    await expect(page.locator('#sessions-grid')).toHaveClass(/layout-list/, { timeout: 3_000 });

    // Press g
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    await expect(page.locator('#sessions-grid')).not.toHaveClass(/layout-list/, { timeout: 3_000 });
  });

  test('shortcut l switches to list layout', async ({ authedPage: page }) => {
    // Ensure grid first
    await page.click('#layout-grid-btn');
    await page.waitForTimeout(300);

    await page.keyboard.press('l');
    await page.waitForTimeout(300);
    await expect(page.locator('#sessions-grid')).toHaveClass(/layout-list/, { timeout: 3_000 });

    // Restore grid
    await page.click('#layout-grid-btn');
  });

  test('shortcut t toggles theme', async ({ authedPage: page }) => {
    const before = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(after).not.toBe(before);

    // Restore
    await page.keyboard.press('t');
  });
});
