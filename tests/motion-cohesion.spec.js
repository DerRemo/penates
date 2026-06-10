import { test, expect } from './fixtures.js';

const NAV = (k) => `[data-sidebar-nav="${k}"]`;

async function openSidebarIfMobile(page, isMobile) {
  if (!isMobile) return;
  const h = page.locator('#sidebar-toggle');
  if (await h.isVisible()) await h.click();
}

test.describe('Motion cohesion', () => {
  test('view switch still works and applies an enter animation', async ({ authedPage: page, isMobile }) => {
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('projects'));
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
    const view = page.locator('[data-view="projects"]');
    await expect(view).toBeVisible();
    // animation-name is set on the visible view (view-enter), not 'none'.
    const name = await view.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('view-enter');
  });

  test('.btn has an :active scale rule wired (transform in transition)', async ({ authedPage: page }) => {
    // The :active scale only resolves under a real press; assert the wiring:
    // .btn transitions transform, and a scale rule exists in a stylesheet.
    const hasTransform = await page.evaluate(() => {
      const btn = document.querySelector('.btn');
      if (!btn) return false;
      return getComputedStyle(btn).transitionProperty.includes('transform');
    });
    expect(hasTransform).toBeTruthy();
    const hasActiveRule = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        let rules; try { rules = sheet.cssRules; } catch { continue; }
        for (const r of rules) {
          if (r.selectorText && /\.btn:active/.test(r.selectorText)
              && /scale/.test(r.style.transform)) return true;
        }
      }
      return false;
    });
    expect(hasActiveRule).toBeTruthy();
  });

  test('reduced-motion toggle collapses the view-enter animation', async ({ authedPage: page, isMobile }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-reduce-motion', 'true');
    });
    await openSidebarIfMobile(page, isMobile);
    await page.click(NAV('usage'));
    const view = page.locator('[data-view="usage"]');
    await expect(view).toBeVisible();
    // With reduce-motion the explicit `animation: none !important` wins.
    const name = await view.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });
});
