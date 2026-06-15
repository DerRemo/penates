import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Brainstorm-spawn UI spec (Idea Pipeline Phase 3).
// The real endpoint spawns a claude session — too heavy for CI. We stub the
// endpoint with page.route() and assert the UI contract only. The E2E server
// runs with BOARD_PATH=/tmp/penates-e2e-board.json (isolated board).
//
// Moving a card INTO a stage is what spawns the session — via drag (desktop) OR
// the stage dropdown (mobile/detail). Drag in headless Chromium is flaky, so we
// drive the transition through the stage dropdown (same applyTransition path as
// drag) and confirm the dialog. The detail panel no longer has a start button —
// only an attach button when a session is alive.

const NAV_BOARD = '[data-sidebar-nav="board"]';

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
  await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
}

test.describe('Board brainstorm spawn (Phase 3)', () => {
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

  test('moving idea→brainstorming via stage dropdown triggers the brainstorm endpoint (after confirm)', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    let calledUrl = '';
    await page.route('**/api/board/cards/*/brainstorm', async (route) => {
      calledUrl = route.request().url();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session: 'cc-stub', reused: false }),
      });
    });

    const card = await seedCard(page, { title: 'BS detail ' + Date.now(), stage: 'idea' });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    // Move into brainstorming via the stage dropdown → confirm dialog → spawn.
    await page.selectOption('#board-detail-stage', 'brainstorming');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-ok').click();

    await expect.poll(() => calledUrl, { timeout: 4_000 }).toContain(`/api/board/cards/${card.id}/brainstorm`);
  });

  test('cancelling the confirm leaves the card in idea and calls nothing', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    let called = false;
    await page.route('**/api/board/cards/*/brainstorm', async (route) => {
      called = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: 'cc-stub' }) });
    });

    const card = await seedCard(page, { title: 'BS cancel ' + Date.now(), stage: 'idea' });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    await page.selectOption('#board-detail-stage', 'brainstorming');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-cancel').click();

    // No spawn, and the card is still in idea (server-side).
    await page.waitForTimeout(300);
    expect(called).toBeFalsy();
    const cards = await listCards(page);
    expect(cards.find(c => c.id === card.id)?.stage).toBe('idea');
  });

  test('detail panel shows no start button, and no attach button without a live session', async ({ authedPage: page }) => {
    const card = await seedCard(page, { title: 'BS nobtn ' + Date.now(), stage: 'brainstorming' });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await expect(page.locator('#board-detail-close')).toBeVisible();

    // Legacy start buttons are gone; attach button absent without a live session.
    await expect(page.locator('#board-detail-brainstorm')).toHaveCount(0);
    await expect(page.locator('#board-detail-open')).toHaveCount(0);
  });
});
