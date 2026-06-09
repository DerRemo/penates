import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Implement-spawn UI spec (Idea Pipeline Phase 4). The real endpoint spawns a
// claude --dangerously-skip-permissions session — too heavy for CI. We stub the
// endpoint with page.route() and assert the UI contract only. The E2E server
// runs with BOARD_PATH=/tmp/cchub-e2e-board.json (isolated board).
//
// NOTE: drag→spawn is intentionally NOT tested here (same flaky headless-DnD
// reason as board-brainstorm.spec.js). Only the detail-panel button path +
// the brainstormDoc gate are covered. Full agent run = manual real-app verify.

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
  const r = await api(page, 'POST', '/api/board/cards', { projectId: 'claude-code-hub', title, stage: 'brainstorming', origin: 'solo' });
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

  test('detail button triggers the implement endpoint when a spec is linked', async ({ authedPage: page }) => {
    let calledUrl = '';
    await page.route('**/api/board/cards/*/implement', async (route) => {
      calledUrl = route.request().url();
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ session: 'cc-impl-stub', reused: false }) });
    });

    const card = await seedCard(page, { title: 'IMPL spec ' + Date.now(), withSpec: true });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });

    await expect(page.locator('#board-detail-implement')).toBeVisible({ timeout: 2_000 });
    await page.locator('#board-detail-implement').click();
    await expect.poll(() => calledUrl, { timeout: 4_000 }).toContain(`/api/board/cards/${card.id}/implement`);
  });

  test('a card without a spec shows no implement button', async ({ authedPage: page }) => {
    const card = await seedCard(page, { title: 'IMPL nospec ' + Date.now(), withSpec: false });
    await goToBoard(page);

    await page.locator(`.board-card[data-id="${card.id}"]`).click();
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await expect(page.locator('#board-detail-close')).toBeVisible();
    await expect(page.locator('#board-detail-implement')).toHaveCount(0);
  });
});
