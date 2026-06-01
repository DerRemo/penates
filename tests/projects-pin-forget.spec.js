// E2E Phase 5: Pin/Forget-AFFORDANCES. Kein echtes Pin/Forget (trifft echte
// Registry) — nur Button-Präsenz + Forget-Confirm-State (kein 2. Klick).
// Pin/Forget-Verhalten ist hermetisch unit-getestet + via Wegwerf-Server live.
import { test, expect } from './fixtures.js';

async function gotoProjects(page, isMobile) {
  if (isMobile) { const h = page.locator('#sidebar-toggle'); if (await h.isVisible()) await h.click(); }
  await page.click('[data-sidebar-nav="projects"]');
  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
  // renderProjects() paints a transient "Loading…" .usage-empty first, then awaits
  // refreshSessions() before rendering the card list. Wait for the settled list
  // container (or a real empty/error block) so .project-card counts are accurate
  // and don't race the loading placeholder into a false skip.
  await page.locator('.project-list, .cmd-output-block').first()
    .waitFor({ timeout: 8_000 })
    .catch(() => {});
  if (isMobile && await page.locator('body[data-sidebar-open="true"]').count()) {
    await page.locator('#sidebar-toggle').click();
  }
}

test.describe('Pin/Forget affordances (Phase 5)', () => {
  test('pin + forget buttons render on cards', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    const card = page.locator('.project-card').first();
    if (await card.count() === 0) test.skip(true, 'no projects');
    await card.hover();
    await expect(card.locator('[data-action="pin"]')).toBeAttached();
    await expect(card.locator('[data-action="forget"]')).toBeAttached();
  });

  test('forget shows a confirm state on first click (no second click → no mutation)', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    const card = page.locator('.project-card').first();
    if (await card.count() === 0) test.skip(true, 'no projects');
    await card.hover();
    const forget = card.locator('[data-action="forget"]');
    await forget.click(); // ERSTER Klick — primt nur
    await expect(forget).toHaveClass(/confirm-pending/);
    // KEIN zweiter Klick → das Projekt wird NICHT entfernt.
    await expect(page.locator('.project-card').first()).toBeVisible();
  });
});
