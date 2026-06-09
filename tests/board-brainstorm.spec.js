import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Brainstorm-spawn UI spec (Idea Pipeline Phase 3).
// The real endpoint spawns a claude session — too heavy for CI. We stub the
// endpoint with page.route() and assert the UI contract only. The E2E server
// runs with BOARD_PATH=/tmp/cchub-e2e-board.json (isolated board).
//
// NOTE: Drag→spawn (idea col drag to brainstorming col) is intentionally
// SKIPPED. board.spec.js has no reliable drag helper; its desktop DnD path
// requires a two-phase mouse+dispatchEvent fallback and is inherently flaky in
// headless Chromium. The drag→confirm→spawn path is covered by manual real-app
// verification. Only the detail-panel button path is tested here.

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

async function seedCard(page, { projectId = 'claude-code-hub', title, stage = 'idea', priority = null }) {
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

  test('detail-panel button triggers the brainstorm endpoint', async ({ authedPage: page }) => {
    let calledUrl = '';
    await page.route('**/api/board/cards/*/brainstorm', async (route) => {
      calledUrl = route.request().url();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session: 'cc-stub', reused: false }),
      });
    });

    const card = await seedCard(page, { title: 'BS detail ' + Date.now(), stage: 'brainstorming' });
    await goToBoard(page);

    // Click card to open detail panel
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    // Brainstorm button must be visible for non-idea stage
    await expect(page.locator('#board-detail-brainstorm')).toBeVisible({ timeout: 2_000 });

    // Click triggers the stubbed endpoint
    await page.locator('#board-detail-brainstorm').click();
    await expect.poll(() => calledUrl, { timeout: 4_000 }).toContain(`/api/board/cards/${card.id}/brainstorm`);
  });

  test('idea card detail does NOT show the brainstorm button', async ({ authedPage: page }) => {
    const card = await seedCard(page, { title: 'BS idea ' + Date.now(), stage: 'idea' });
    await goToBoard(page);

    // Click card to open detail panel
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    // Detail is open (close button is present)
    await expect(page.locator('#board-detail-close')).toBeVisible();

    // No brainstorm button for idea stage
    await expect(page.locator('#board-detail-brainstorm')).toHaveCount(0);
  });
});
