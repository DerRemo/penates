import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// The board view (Idea Pipeline Phase 1). The E2E server runs with an isolated
// BOARD_PATH=/tmp/penates-e2e-board.json (see playwright.config.js) so creating/
// deleting cards never touches the real ~/.penates/board.json. We still
// reset the store between tests via the API so each test is independent.

const NAV_BOARD = '[data-sidebar-nav="board"]';
const STAGES = ['idea', 'brainstorming', 'implement', 'review', 'done'];

async function api(page, method, path, body) {
  const token = await getToken(page);
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.data = body;
  }
  return page.request.fetch(path, { method, ...opts });
}

async function listCards(page) {
  const r = await api(page, 'GET', '/api/board/cards');
  return (await r.json()).cards || [];
}

async function clearBoard(page) {
  const cards = await listCards(page);
  for (const c of cards) {
    await api(page, 'DELETE', `/api/board/cards/${c.id}`);
  }
}

async function seedCard(page, { projectId = 'penates', title, stage = 'idea', priority = null }) {
  const r = await api(page, 'POST', '/api/board/cards', { projectId, title, stage, priority, origin: 'solo' });
  expect(r.ok(), `seed card failed: ${r.status()}`).toBeTruthy();
  return await r.json();
}

async function goToBoard(page) {
  await ensureSidebarOpen(page);
  await page.click(NAV_BOARD);
  await page.waitForSelector('body[data-current-view="board"]', { timeout: 5_000 });
  await ensureSidebarClosed(page);
  // BoardView.activate() fetches + renders the 6 columns
  await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
}

test.describe('Board (Idea Pipeline)', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await clearBoard(page);
  });

  test.afterAll(async ({ request }) => {
    const token = process.env.AUTH_TOKEN || '';
    const r = await request.get('/api/board/cards', { headers: { Authorization: `Bearer ${token}` } });
    const cards = (await r.json()).cards || [];
    for (const c of cards) {
      await request.delete(`/api/board/cards/${c.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  });

  test('nav opens the board with five columns', async ({ authedPage: page }) => {
    await goToBoard(page);
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'board');
    for (const stage of STAGES) {
      await expect(page.locator(`.board-col[data-stage="${stage}"]`)).toBeVisible();
    }
    await expect(page.locator('.board-col')).toHaveCount(5);
  });

  test('+ idea creates a card via the input dialog', async ({ authedPage: page }) => {
    await goToBoard(page);
    await page.click('#board-add-idea');
    await page.waitForSelector('#penates-input-modal.open', { timeout: 3_000 });
    const title = `E2E idea ${Date.now()}`;
    await page.fill('#penates-input-field', title);
    await page.click('#penates-input-ok');
    await page.waitForSelector('#penates-input-modal:not(.open)', { timeout: 3_000 });
    const card = page.locator('.board-col[data-stage="idea"] .board-card', { hasText: title });
    await expect(card).toBeVisible({ timeout: 4_000 });
    // persisted server-side
    const cards = await listCards(page);
    expect(cards.some(c => c.title === title && c.stage === 'idea')).toBeTruthy();
  });

  test('card move persists across reload (drag or stage dropdown)', async ({ authedPage: page, isMobile }) => {
    const seeded = await seedCard(page, { title: 'Movable card' });
    await goToBoard(page);
    await expect(page.locator('.board-col[data-stage="idea"] .board-card', { hasText: 'Movable card' })).toBeVisible();

    // Target a non-guarded transition: idea→implement is blocked by the
    // spec-guard (needs a brainstorm doc first), so we move to 'review' — a
    // plain stage change — to exercise the drag/persist mechanic itself.
    if (isMobile) {
      // Mobile path: open detail panel and use the stage dropdown.
      await page.click('.board-card:has-text("Movable card")');
      await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
      await page.selectOption('#board-detail-stage', 'review');
      await page.waitForTimeout(400);
    } else {
      // Desktop path: HTML5 DnD via dispatched events (Playwright dragTo is
      // unreliable for native DnD, so we synthesise the dataTransfer flow).
      const source = page.locator('.board-card:has-text("Movable card")');
      const target = page.locator('.board-col[data-stage="review"] .board-col__list');
      await source.hover();
      await page.mouse.down();
      await target.hover();
      await target.hover();
      await page.mouse.up();
      // Native DnD via mouse can be flaky in headless Chromium; fall back to
      // dispatched DnD events if the mouse approach didn't move it.
      await page.waitForTimeout(300);
      let moved = await page.locator('.board-col[data-stage="review"] .board-card', { hasText: 'Movable card' }).count();
      if (!moved) {
        await page.evaluate((id) => {
          const card = document.querySelector(`.board-card[data-id="${id}"]`);
          const list = document.querySelector('.board-col[data-stage="review"] .board-col__list');
          const dt = new DataTransfer();
          card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
          list.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
          list.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        }, seeded.id);
        await page.waitForTimeout(400);
      }
    }

    // Server-side persistence: the card is now in 'review'.
    await expect.poll(async () => {
      const cards = await listCards(page);
      return cards.find(c => c.id === seeded.id)?.stage;
    }, { timeout: 4_000 }).toBe('review');

    // Survives a reload.
    await page.reload();
    await goToBoard(page);
    await expect(page.locator('.board-col[data-stage="review"] .board-card', { hasText: 'Movable card' })).toBeVisible({ timeout: 4_000 });
    await expect(page.locator('.board-col[data-stage="idea"] .board-card', { hasText: 'Movable card' })).toHaveCount(0);
  });

  test('project filter narrows visible cards', async ({ authedPage: page }) => {
    await seedCard(page, { projectId: 'penates', title: 'Hub card' });
    await seedCard(page, { projectId: 'some-other-project', title: 'Other card' });
    await goToBoard(page);
    await expect(page.locator('.board-card')).toHaveCount(2);

    await page.selectOption('#board-filter', 'penates');
    await page.waitForTimeout(300);
    await expect(page.locator('.board-card', { hasText: 'Hub card' })).toBeVisible();
    await expect(page.locator('.board-card', { hasText: 'Other card' })).toHaveCount(0);

    // Back to all
    await page.selectOption('#board-filter', '');
    await page.waitForTimeout(300);
    await expect(page.locator('.board-card')).toHaveCount(2);
  });

  test('detail panel opens, edits title, and deletes (2-click)', async ({ authedPage: page }) => {
    const seeded = await seedCard(page, { title: 'Detail card' });
    await goToBoard(page);
    await page.click('.board-card:has-text("Detail card")');
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    // Edit title, persists.
    await page.fill('#board-detail-title', 'Detail card edited');
    await page.locator('#board-detail-title').blur();
    await expect.poll(async () => {
      const cards = await listCards(page);
      return cards.find(c => c.id === seeded.id)?.title;
    }, { timeout: 4_000 }).toBe('Detail card edited');
    await expect(page.locator('.board-card:has-text("Detail card edited")')).toBeVisible({ timeout: 3_000 });

    // Delete: first click arms, second click deletes.
    await page.click('#board-detail-del');
    await page.click('#board-detail-del');
    await expect(page.locator('#board-detail')).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('.board-card:has-text("Detail card")')).toHaveCount(0);
    const cards = await listCards(page);
    expect(cards.some(c => c.id === seeded.id)).toBeFalsy();
  });
});
