// E2E Phase 2: redesignte Projekt-Karten (Ring/Chips/Accent) + Header-Controls.
import { test, expect } from './fixtures.js';

async function gotoProjects(page, isMobile) {
  if (isMobile) { const h = page.locator('#sidebar-toggle'); if (await h.isVisible()) await h.click(); }
  await page.click('[data-sidebar-nav="projects"]');
  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
  // renderProjects() shows a transient "Loading…" placeholder, then awaits
  // refreshSessions() before painting cards. Wait for the rendered list (or a
  // terminal empty/filtered/no-files state) so .project-card counts are accurate
  // and don't race against the loading placeholder.
  await page.locator('.project-list, .cmd-output-block').first()
    .waitFor({ timeout: 8_000 })
    .catch(() => {});
  // On mobile the sidebar drawer overlays the header controls — close it.
  if (isMobile && await page.locator('body[data-sidebar-open="true"]').count()) {
    await page.locator('#sidebar-toggle').click();
  }
}

test.describe('Projects cards (Phase 2)', () => {
  test('cards render with ring + chips + token classes', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    const card = page.locator('.project-card').first();
    if (await card.count() === 0) test.skip(true, 'no projects registered');
    await expect(card).toBeVisible();
    await expect(card.locator('.project-ring')).toBeVisible();
    // Backlog chip moved to the global Board (Idea Pipeline Phase 1) → 2 chips:
    // Released + Dev.
    await expect(card.locator('.pchip')).toHaveCount(2);
    await expect(card).toHaveAttribute('data-activity', /active|idle|missing/);
  });

  test('layout toggle switches list/grid', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    if (await page.locator('.project-card').count() === 0) test.skip(true, 'no projects registered');
    await page.click('#projects-layout-list');
    await expect(page.locator('.project-list')).toHaveClass(/layout-list/);
    await page.click('#projects-layout-grid');
    await expect(page.locator('.project-list')).not.toHaveClass(/layout-list/);
  });

  test('sort + filter selects persist and re-render', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    if (await page.locator('.project-card').count() === 0) test.skip(true, 'no projects registered');
    // 'backlog' sort/filter removed in Idea Pipeline Phase 1 — use 'progress'.
    await page.selectOption('#projects-sort', 'progress');
    await expect(page.locator('#projects-sort')).toHaveValue('progress');
    await page.selectOption('#projects-filter', 'hideMissing');
    await expect(page.locator('.project-missing')).toHaveCount(0);
  });

  test('quick-start "Session hier" opens the new-session modal without navigating', async ({ authedPage: page, isMobile }) => {
    await gotoProjects(page, isMobile);
    const card = page.locator('.project-card').first();
    if (await card.count() === 0) test.skip(true, 'no projects registered');
    const modal = page.locator('#new-session-modal');
    const startBtn = card.locator('[data-action="start-session"]');

    // The action row is revealed on hover/focus-within (grid) — it's already
    // visible in list layout and on touch devices. Hover to surface it on
    // desktop grid before the mouse click.
    await card.hover();
    // mouse click — opens the modal, must NOT navigate to project-detail
    await startBtn.click();
    await expect(modal).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');

    // close (Esc is wired in the global keydown handler) and confirm hidden
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');

    // keyboard-activate the same button — guards the card keydown fix:
    // Enter on the focused button must open the modal (button native click),
    // and the bubbled keydown must NOT navigate the card to project-detail.
    await card.hover();
    await startBtn.focus();
    await page.keyboard.press('Enter');
    await expect(modal).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
  });
});
