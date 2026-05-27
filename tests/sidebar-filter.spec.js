import { test, expect } from './fixtures.js';

test.skip(({ isMobile }) => isMobile, 'desktop sidebar only');

test.describe('Sidebar filter toggle', () => {
  test('toggle is visible and default = Aktiv', async ({ authedPage: page }) => {
    const activeBtn = page.locator('.sidebar__filter-btn[data-sidebar-filter="active"]');
    const allBtn = page.locator('.sidebar__filter-btn[data-sidebar-filter="all"]');
    await expect(activeBtn).toBeVisible();
    await expect(allBtn).toBeVisible();
    await expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(allBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking All swaps aria-pressed and persists', async ({ authedPage: page }) => {
    const activeBtn = page.locator('.sidebar__filter-btn[data-sidebar-filter="active"]');
    const allBtn = page.locator('.sidebar__filter-btn[data-sidebar-filter="all"]');
    await allBtn.click();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(activeBtn).toHaveAttribute('aria-pressed', 'false');

    // Reload and verify persistence.
    await page.reload();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(activeBtn).toHaveAttribute('aria-pressed', 'false');

    // Reset back to default for other tests.
    await activeBtn.click();
    await expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
