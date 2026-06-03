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

  test('renders the 4 phase-1 anchor chips', async ({ authedPage: page }) => {
    await openSettings(page);
    const chips = page.locator('#settings-view .settings-anchor');
    await expect(chips).toHaveCount(4);
    await expect(chips.nth(0)).toContainText(/Darstellung|Appearance/);
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
