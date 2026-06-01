// E2E für den Shell-Refactor (Phase 1): die Sidebar-Nav-Einträge Overview/
// Projects/Usage öffnen jeweils eine eigene Top-Level-View (body[data-current-view])
// mit eigenem History-Eintrag; Back kehrt zur vorherigen View zurück.
import { test, expect } from './fixtures.js';

const NAV = (k) => `[data-sidebar-nav="${k}"]`;

async function openSidebarIfMobile(page, isMobile) {
  if (!isMobile) return;
  const hamburger = page.locator('#sidebar-toggle');
  if (await hamburger.isVisible()) await hamburger.click();
}

test.describe('Nav routing (Phase 1)', () => {
  test('projects nav opens its own view with history + back', async ({ authedPage: page, isMobile }) => {
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('projects'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
    await expect(page.locator('[data-view="projects"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'dashboard');
    await expect(page.locator('[data-view="dashboard"]')).toBeVisible();
  });

  test('usage nav opens its own view', async ({ authedPage: page, isMobile }) => {
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('usage'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'usage');
    await expect(page.locator('[data-view="usage"]')).toBeVisible();
  });

  test('"/" focuses the projects search on the projects view', async ({ authedPage: page, isMobile }) => {
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('projects'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
    await page.keyboard.press('/');
    await expect(page.locator('#projects-search')).toBeFocused();
  });

  test('restores last nav view after reload', async ({ authedPage: page, isMobile }) => {
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('projects'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');

    // …and switching back to the dashboard persists too (no stale 'projects').
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('sessions'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'dashboard');
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'dashboard');
  });
});
