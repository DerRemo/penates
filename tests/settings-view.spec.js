// E2E for the re-skinned Settings view (Phase 1):
// app-topbar chrome, 4 anchor chips, 4 labelled sections, theme toggle regression,
// anchor-chip active state.
// All assertions target NEW markup that does NOT exist yet — tests must fail
// until later tasks implement the markup in public/index.html.
import { test, expect } from './fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openSettings(page) {
  // On mobile/tablet the sidebar is collapsed — open it first.
  const sidebarToggle = page.locator('#sidebar-toggle');
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }

  await page.click('#sidebar-settings-entry');
  await page.waitForSelector('body[data-current-view="settings"]', { timeout: 8_000 });

  // Close sidebar again on mobile so the view is accessible.
  if (await sidebarToggle.isVisible() &&
      await page.locator('body[data-sidebar-open="true"]').count()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Settings-View (Redesign Phase 1)', () => {

  test('settings view uses app-topbar chrome with title', async ({ authedPage: page }) => {
    await openSettings(page);
    const topbar = page.locator('#settings-view .app-topbar__title');
    await expect(topbar).toBeVisible();
  });

  test('renders the 6 anchor chips incl. Terminal + Account', async ({ authedPage: page }) => {
    await openSettings(page);
    const chips = page.locator('#settings-view .settings-anchor');
    await expect(chips).toHaveCount(6);
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-terminal"]')).toBeAttached();
    await expect(page.locator('#settings-view .settings-anchor[data-anchor="sec-account"]')).toBeAttached();
  });

  test('terminal + account sections are present', async ({ authedPage: page }) => {
    await openSettings(page);
    await expect(page.locator('#settings-view #sec-terminal')).toBeAttached();
    await expect(page.locator('#settings-view #sec-account')).toBeAttached();
  });

  test('a terminal pref persists across reload', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#sec-terminal [data-cursor-value="block"]');
    await expect(page.locator('#sec-terminal [data-cursor-value="block"]')).toHaveClass(/is-active/);
    await page.reload();
    await openSettings(page);
    await expect(page.locator('#sec-terminal [data-cursor-value="block"]')).toHaveClass(/is-active/);
  });

  test('density compact sets the html attribute', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#sec-appearance [data-density-value="compact"]');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });

  test('sign out clears the token', async ({ authedPage: page }) => {
    await openSettings(page);
    await page.click('#pref-logout-btn');
    const cleared = await page.evaluate(() => localStorage.getItem('cchub_token'));
    expect(cleared).toBeNull();
  });

  test('all phase-1 sections are present', async ({ authedPage: page }) => {
    await openSettings(page);
    for (const id of ['sec-appearance', 'sec-notifications', 'sec-behavior', 'sec-help']) {
      await expect(page.locator(`#settings-view #${id}`)).toBeAttached();
    }
  });

  test('theme toggle still works after re-skin', async ({ authedPage: page }) => {
    // Confirmed mechanism: setTheme() calls
    // document.documentElement.setAttribute('data-theme', t)
    // so the assertion is html[data-theme="latte"].
    await openSettings(page);
    await page.click('#settings-view [data-theme-value="latte"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'latte');
    await page.click('#settings-view [data-theme-value="mocha"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'mocha');
  });

  test('clicking an anchor chip marks it active', async ({ authedPage: page }) => {
    await openSettings(page);
    const helpChip = page.locator('#settings-view .settings-anchor[data-anchor="sec-help"]');
    await helpChip.click();
    await expect(helpChip).toHaveClass(/is-active/);
  });

});
