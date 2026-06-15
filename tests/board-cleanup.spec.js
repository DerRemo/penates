import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Cleanup-on-Done UI spec. Der echte Cleanup (git worktree/branch) ist Real-App-
// Abnahme; hier wird der UX-Contract isoliert getestet: Confirm-Gate vor dem
// done-PATCH (Drag + Dropdown teilen applyTransition) + Toast aus der cleanup-
// Summary. PATCH wird per page.route() gestubbt → deterministisch, kein Repo.
// Stage-Dropdown ist mobile-only (≤899px); Desktop-Drag → Real-App-Verify.

const NAV_BOARD = '[data-sidebar-nav="board"]';

async function api(page, method, path, body) {
  const token = await getToken(page);
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.data = body; }
  return page.request.fetch(path, { method, ...opts });
}
async function listCards(page) { return (await (await api(page, 'GET', '/api/board/cards')).json()).cards || []; }
async function clearBoard(page) { for (const c of await listCards(page)) await api(page, 'DELETE', `/api/board/cards/${c.id}`); }

async function seedCard(page, { title, stage, patch }) {
  const r = await api(page, 'POST', '/api/board/cards', { projectId: 'penates', title, stage, origin: 'solo' });
  const card = await r.json();
  if (patch) await api(page, 'PATCH', `/api/board/cards/${card.id}`, patch);
  return card;
}

async function goToBoard(page) {
  await ensureSidebarOpen(page);
  await page.click(NAV_BOARD);
  await page.waitForSelector('body[data-current-view="board"]', { timeout: 5_000 });
  await ensureSidebarClosed(page);
  await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
}

test.describe('Board cleanup on done (Phase 5.1)', () => {
  test.beforeEach(async ({ authedPage: page }) => { await clearBoard(page); });

  test.afterAll(async ({ request }) => {
    const token = process.env.AUTH_TOKEN || '';
    const r = await request.get('/api/board/cards', { headers: { Authorization: `Bearer ${token}` } });
    for (const c of ((await r.json()).cards || [])) {
      await request.delete(`/api/board/cards/${c.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  });

  test('destructive done shows confirm; cancel keeps the card', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    // Karte mit nur sessionRef (Artefakt, aber keine git-Ops auf echtem Repo).
    const card = await seedCard(page, { title: 'CLEAN ' + Date.now(), stage: 'implement', patch: { sessionRef: 'cc-e2e-fake-ref' } });
    await goToBoard(page);
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await page.selectOption('#board-detail-stage', 'done');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-cancel').click();
    // Abbruch → Karte bleibt in implement (kein PATCH).
    await expect.poll(async () => (await listCards(page)).find(c => c.id === card.id)?.stage, { timeout: 3_000 }).toBe('implement');
  });

  test('confirming a destructive done moves the card and shows a cleanup toast', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    const card = await seedCard(page, { title: 'CLEAN2 ' + Date.now(), stage: 'implement', patch: { sessionRef: 'cc-e2e-fake-ref' } });
    // PATCH stubben → deterministische cleanup-Summary (kein echtes Repo nötig).
    await page.route(`**/api/board/cards/${card.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ...card, stage: 'done',
        cleanup: { sessionKilled: true, worktreeRemoved: true, branchDeleted: true, branchKept: false },
      }) });
    });
    await goToBoard(page);
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await page.selectOption('#board-detail-stage', 'done');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-ok').click();
    await expect(page.locator('#toast-container .toast.success')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('.board-col[data-stage="done"] .board-card', { hasText: 'CLEAN2' })).toBeVisible({ timeout: 3_000 });
  });

  test('artifact-less card moves to done with no confirm dialog', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    const card = await seedCard(page, { title: 'PLAIN ' + Date.now(), stage: 'idea' });
    await goToBoard(page);
    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await page.selectOption('#board-detail-stage', 'done');
    // Kein Confirm-Dialog für reine Ideen-Karten.
    await expect(page.locator('#penates-confirm-modal.open')).toHaveCount(0);
    await expect.poll(async () => (await listCards(page)).find(c => c.id === card.id)?.stage, { timeout: 3_000 }).toBe('done');
  });
});
