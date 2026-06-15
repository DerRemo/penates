import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Implement-spawn UI spec (Idea Pipeline Phase 4). The real endpoint spawns a
// claude --dangerously-skip-permissions session — too heavy for CI. We stub the
// endpoint with page.route() and assert the UI contract only. The E2E server
// runs with BOARD_PATH=/tmp/penates-e2e-board.json (isolated board).
//
// Moving a card INTO implement is what spawns the agent — via drag (desktop) OR
// the stage dropdown (mobile/detail). Drag in headless Chromium is flaky, so we
// drive the transition through the stage dropdown (same applyTransition path)
// and confirm the dialog. The spec gate (no brainstormDoc → noSpec, no spawn)
// and the absence of a start button are covered here.

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

// Seed a brainstorming card, optionally with a spec linked (brainstormDoc set
// via PATCH — addCard does not accept brainstormDoc).
async function seedCard(page, { title, withSpec }) {
  const r = await api(page, 'POST', '/api/board/cards', { projectId: 'penates', title, stage: 'brainstorming', origin: 'solo' });
  expect(r.ok(), `seed failed: ${r.status()}`).toBeTruthy();
  const card = await r.json();
  if (withSpec) {
    const p = await api(page, 'PATCH', `/api/board/cards/${card.id}`, { brainstormDoc: 'docs/spec.md' });
    expect(p.ok(), `link spec failed: ${p.status()}`).toBeTruthy();
    return await p.json();
  }
  return card;
}

async function goToBoard(page) {
  await ensureSidebarOpen(page);
  await page.click(NAV_BOARD);
  await page.waitForSelector('body[data-current-view="board"]', { timeout: 5_000 });
  await ensureSidebarClosed(page);
  await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
}

test.describe('Board implement spawn (Phase 4)', () => {
  test.beforeEach(async ({ authedPage: page }) => { await clearBoard(page); });

  test.afterAll(async ({ request }) => {
    const token = process.env.AUTH_TOKEN || '';
    const r = await request.get('/api/board/cards', { headers: { Authorization: `Bearer ${token}` } });
    for (const c of ((await r.json()).cards || [])) {
      await request.delete(`/api/board/cards/${c.id}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  });

  test('moving brainstorming→implement via stage dropdown triggers the implement endpoint (after confirm)', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    let calledUrl = '';
    await page.route('**/api/board/cards/*/implement', async (route) => {
      calledUrl = route.request().url();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: 'cc-impl-stub', reused: false }) });
    });

    const card = await seedCard(page, { title: 'IMPL spec ' + Date.now(), withSpec: true });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    await page.selectOption('#board-detail-stage', 'implement');
    await expect(page.locator('#penates-confirm-modal.open')).toBeVisible({ timeout: 2_000 });
    await page.locator('#penates-confirm-ok').click();

    await expect.poll(() => calledUrl, { timeout: 4_000 }).toContain(`/api/board/cards/${card.id}/implement`);
  });

  test('moving to implement without a spec is blocked (noSpec, no spawn, stays put)', async ({ authedPage: page, isMobile }) => {
    test.skip(!isMobile, 'stage dropdown is mobile-only (≤899px); desktop uses drag → real-app verify');
    let called = false;
    await page.route('**/api/board/cards/*/implement', async (route) => {
      called = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: 'cc-impl-stub' }) });
    });

    const card = await seedCard(page, { title: 'IMPL nospec ' + Date.now(), withSpec: false });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    await page.selectOption('#board-detail-stage', 'implement');
    // No confirm dialog (guard fires first), no endpoint call, card stays in brainstorming.
    await page.waitForTimeout(400);
    await expect(page.locator('#penates-confirm-modal.open')).toHaveCount(0);
    expect(called).toBeFalsy();
    const cards = await listCards(page);
    expect(cards.find(c => c.id === card.id)?.stage).toBe('brainstorming');
  });

  test('detail panel has no start button (attach only when a session is alive)', async ({ authedPage: page }) => {
    const card = await seedCard(page, { title: 'IMPL nobtn ' + Date.now(), withSpec: true });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await expect(page.locator('#board-detail-close')).toBeVisible();
    await expect(page.locator('#board-detail-implement')).toHaveCount(0);
    await expect(page.locator('#board-detail-open')).toHaveCount(0);
  });
});
