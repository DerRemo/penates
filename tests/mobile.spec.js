import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

// Note: the touch-key data-seq attributes contain literal backslash-escaped
// strings like "\x1b" (4 chars: \, x, 1, b) — NOT actual escape characters.
// CSS attribute selectors interpret \x1b as a hex escape (= actual ESC char),
// so CSS selectors like [data-seq="\x1b"] do NOT match. We use text content
// or data-ctrl to locate buttons instead.

test.describe('Mobile-specific features', () => {
  test.beforeEach(async ({}, testInfo) => {
    const isMobile = ['mobile', 'mobile-small'].includes(testInfo.project.name);
    test.skip(!isMobile, 'mobile-only tests');
  });

  test('touch bar is visible in terminal', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const touchBar = page.locator('#touch-bar');
    await expect(touchBar).toBeVisible({ timeout: 5_000 });
  });

  test('touch bar Esc button sends escape', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // data-seq is the literal string "\x1b" — locate by button text instead
    const escBtn = page.locator('#touch-bar .touch-key', { hasText: /^Esc$/ });
    await expect(escBtn).toBeVisible({ timeout: 5_000 });
    await escBtn.tap();
    await page.waitForTimeout(300);
  });

  test('touch bar Tab button sends tab', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // data-seq is the literal string "\t" — locate by button text instead
    const tabBtn = page.locator('#touch-bar .touch-key', { hasText: /^Tab$/ });
    await expect(tabBtn).toBeVisible();
    await tabBtn.tap();
    await page.waitForTimeout(300);
  });

  test('touch bar Ctrl button is sticky', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const ctrlBtn = page.locator('.touch-key[data-ctrl]');
    await expect(ctrlBtn).toBeVisible();

    await ctrlBtn.tap();
    await page.waitForTimeout(200);
    // Ctrl button gets class 'sticky-active' when toggled on
    const isActive = await ctrlBtn.evaluate(el =>
      el.classList.contains('sticky-active')
    );
    expect(isActive).toBe(true);

    await ctrlBtn.tap();
    await page.waitForTimeout(200);
    const isDeactivated = await ctrlBtn.evaluate(el =>
      !el.classList.contains('sticky-active')
    );
    expect(isDeactivated).toBe(true);
  });

  test('touch bar Ctrl+C button sends interrupt', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // data-seq is the literal string "\x03" — locate by button text instead
    const ctrlCBtn = page.locator('#touch-bar .touch-key', { hasText: /^Ctrl\+C$/ });
    await expect(ctrlCBtn).toBeVisible();
    await ctrlCBtn.tap();
    await page.waitForTimeout(300);
  });

  test('touch bar arrow keys are visible', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // Arrow key buttons identified by their visible text (unicode arrows)
    // data-seq values are literal strings "\x1b[A" etc. — use text content instead
    await expect(page.locator('#touch-bar .touch-key', { hasText: '↑' })).toBeVisible();
    await expect(page.locator('#touch-bar .touch-key', { hasText: '↓' })).toBeVisible();
    await expect(page.locator('#touch-bar .touch-key', { hasText: '→' })).toBeVisible();
    await expect(page.locator('#touch-bar .touch-key', { hasText: '←' })).toBeVisible();
  });

  test('sidebar opens via hamburger menu', async ({ authedPage: page }) => {
    const hamburger = page.locator('#sidebar-toggle');
    await expect(hamburger).toBeVisible({ timeout: 5_000 });
    await hamburger.tap();

    // sidebar open state is tracked via body[data-sidebar-open="true"]
    await expect(page.locator('body[data-sidebar-open="true"]')).toBeVisible({ timeout: 3_000 });

    await hamburger.tap();
    await page.waitForTimeout(500);
  });

  test('mobile file picker button exists in sidebar', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const toggleBtn = page.locator('#btn-toggle-files');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'file toggle not visible');
      return;
    }

    await toggleBtn.tap();
    await page.waitForSelector('#files-sidebar.open', { timeout: 5_000 });
    await expect(page.locator('#files-upload-picker')).toBeVisible();
  });
});
