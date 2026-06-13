import { test, expect } from './fixtures.js';
import {
  navigateToSession, waitForTerminal, navigateToBoard,
  createBoardCard, deleteBoardCard, ensureSidebarClosed,
} from './helpers.js';

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

  test('mobile file picker button exists in the repo Files tab', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const toggleBtn = page.locator('#btn-toggle-repo');
    if (!(await toggleBtn.isVisible())) {
      test.skip(true, 'repo toggle not visible');
      return;
    }

    await toggleBtn.tap();
    await page.waitForSelector('#repo-panel.open', { timeout: 5_000 });
    await page.tap('#repo-tab-files');
    await page.waitForSelector('#repo-pane-files.active', { timeout: 5_000 });
    await expect(page.locator('#files-upload-picker')).toBeVisible();
  });
});

// ── Mobile-Optimierung (2026-06-13): Board quick-move + sheet, modal sticky
//    footer, roadmap ▲▼, landscape, terminal copy, tap-targets ────────────
test.describe('Mobile optimization', () => {
  test.beforeEach(async ({}, testInfo) => {
    const isMobile = ['mobile', 'mobile-small'].includes(testInfo.project.name);
    test.skip(!isMobile, 'mobile-only tests');
  });

  test('board quick-move: idea card has ‹ disabled, › enabled', async ({ authedPage: page }) => {
    const card = await createBoardCard(page, { title: 'qm-boundary-idea', stage: 'idea' });
    try {
      await navigateToBoard(page);
      const cardEl = page.locator(`.board-card[data-id="${card.id}"]`);
      await cardEl.waitFor({ timeout: 5_000 });
      await expect(cardEl.locator('.board-card__qm-btn[data-qm="-1"]')).toBeDisabled();
      await expect(cardEl.locator('.board-card__qm-btn[data-qm="1"]')).toBeEnabled();
    } finally {
      await deleteBoardCard(page, card.id);
    }
  });

  test('board quick-move: ‹ on a done card moves it to review', async ({ authedPage: page }) => {
    const card = await createBoardCard(page, { title: 'qm-done-back', stage: 'done' });
    try {
      await navigateToBoard(page);
      const cardEl = page.locator(`.board-card[data-id="${card.id}"]`);
      await cardEl.waitFor({ timeout: 5_000 });
      // done→review takes the plain patchCard path (no confirm dialog).
      await cardEl.locator('.board-card__qm-btn[data-qm="-1"]').tap();
      await expect(page.locator(`.board-card[data-id="${card.id}"]`))
        .toHaveAttribute('data-stage', 'review', { timeout: 5_000 });
    } finally {
      await deleteBoardCard(page, card.id);
    }
  });

  test('board detail opens as a bottom-sheet and backdrop tap closes it', async ({ authedPage: page }) => {
    const card = await createBoardCard(page, { title: 'sheet-card', stage: 'idea' });
    try {
      await navigateToBoard(page);
      const cardEl = page.locator(`.board-card[data-id="${card.id}"]`);
      await cardEl.waitFor({ timeout: 5_000 });
      await cardEl.locator('.board-card__title').tap();
      const detail = page.locator('#board-detail');
      await expect(detail).toBeVisible();
      // Sheet sits at the bottom of the viewport (within a few px of the fold).
      const box = await detail.boundingBox();
      const vh = page.viewportSize().height;
      expect(box.y + box.height).toBeGreaterThan(vh - 4);
      // Backdrop tap closes (tap top-left, clear of the bottom sheet).
      await page.locator('#board-backdrop').tap({ position: { x: 10, y: 10 }, force: true });
      await expect(detail).toBeHidden({ timeout: 5_000 });
    } finally {
      await deleteBoardCard(page, card.id);
    }
  });

  test('board quick-move buttons are ≥44px touch targets', async ({ authedPage: page }) => {
    // Custom controls (not native <select>, which opens the OS picker on iOS).
    const card = await createBoardCard(page, { title: 'tap-target-card', stage: 'idea' });
    try {
      await navigateToBoard(page);
      const qm = page.locator(`.board-card[data-id="${card.id}"] .board-card__qm-btn`).first();
      await qm.waitFor({ timeout: 5_000 });
      const box = await qm.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    } finally {
      await deleteBoardCard(page, card.id);
    }
  });

  test('new-session modal: submit button is in the viewport', async ({ authedPage: page }) => {
    await ensureSidebarClosed(page);
    await page.tap('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });
    await expect(page.locator('#new-session-modal .modal-actions .btn-primary')).toBeInViewport();
  });

  test('terminal copy-output button is visible on mobile', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await expect(page.locator('#btn-copy-output')).toBeVisible();
  });

  test('landscape: no horizontal page scroll on dashboard', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await ensureSidebarClosed(page);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() =>
      document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('usage view: no horizontal page scroll (heatmap scrolls in-container)', async ({ authedPage: page }) => {
    await page.locator('#sidebar-toggle').tap();
    await page.waitForSelector('body[data-sidebar-open="true"]', { timeout: 3_000 });
    await page.tap('.sidebar__item[data-sidebar-nav="usage"]');
    await page.waitForSelector('body[data-current-view="usage"]', { timeout: 5_000 });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() =>
      document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
