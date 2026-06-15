import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Finish UI spec (Idea Pipeline Phase 5). The real finish merges+pushes — too
// heavy/irreversible for CI. We stub /finish and /branch-diff with page.route()
// and assert the UI contract only. Isolated BOARD_PATH. Stage dropdown is
// mobile-only (≤899px); desktop uses drag → real-app verify.

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
  for (const c of await listCards(page)) await api(page, 'DELETE', `/api/board/cards/${c.id}`);
}

async function seedReviewCard(page, title) {
  const r = await api(page, 'POST', '/api/board/cards', { projectId: 'penates', title, stage: 'review', origin: 'solo' });
  const card = await r.json();
  await api(page, 'PATCH', `/api/board/cards/${card.id}`, { branch: 'idea/x', brainstormDoc: 'docs/spec.md' });
  return card;
}

async function goToBoard(page) {
  await ensureSidebarOpen(page);
  await page.click(NAV_BOARD);
  await page.waitForSelector('body[data-current-view="board"]', { timeout: 5_000 });
  await ensureSidebarClosed(page);
  await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
}

test.describe('Board finish (Phase 5)', () => {
  test.beforeEach(async ({ authedPage: page }) => { await clearBoard(page); });

  test.afterAll(async ({ request }) => {
    const token = process.env.AUTH_TOKEN || '';
    const r = await request.get('/api/board/cards', { headers: { Authorization: `Bearer ${token}` } });
    for (const c of ((await r.json()).cards || [])) {
      await request.delete(`/api/board/cards/${c.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  });

  test('moving review→done via stage dropdown finishes (after confirm)', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    let calledUrl = '';
    await page.route('**/api/board/cards/*/finish', async (route) => {
      calledUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, base: 'main', pushed: true }) });
    });
    const card = await seedReviewCard(page, 'FIN ' + Date.now());
    await goToBoard(page);
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await page.selectOption('#board-detail-stage', 'done');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-ok').click();
    await expect.poll(() => calledUrl, { timeout: 4_000 }).toContain(`/api/board/cards/${card.id}/finish`);
  });

  test('View diff button renders the branch diff (stubbed)', async ({ authedPage: page }) => {
    await page.route('**/api/board/cards/*/branch-diff', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        isRepo: true, base: 'main', branch: 'idea/x',
        files: [{ path: 'a.txt', additions: 1, deletions: 0, binary: false, oversize: false, diff: 'diff --git a/a.txt b/a.txt\n@@ -1 +1,2 @@\n one\n+two\n' }],
      }) });
    });
    const card = await seedReviewCard(page, 'FINDIFF ' + Date.now());
    await goToBoard(page);
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await page.locator('#board-detail-viewdiff').click();
    await expect(page.locator('#board-detail-diff .udiff__row.add')).toBeVisible({ timeout: 3_000 });
  });
});
