import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Idea-generation UI spec (Idea Pipeline Phase 3-B). The real endpoint spawns a
// claude session — too heavy for CI. We stub POST /api/projects/:id/ideagen with
// page.route() and assert the UI contract only. Notes editing hits the real
// (isolated) board via PENATES_HOME=/tmp/penates-e2e-home.

const NAV_PROJECTS = '[data-sidebar-nav="projects"]';
const NAV_BOARD = '[data-sidebar-nav="board"]';
const PROJECT_ID = 'penates';

async function api(page, method, path, body) {
  const token = await getToken(page);
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.data = body;
  }
  return page.request.fetch(path, { method, ...opts });
}

async function clearBoard(page) {
  const r = await api(page, 'GET', '/api/board/cards');
  for (const c of ((await r.json()).cards || [])) {
    await api(page, 'DELETE', `/api/board/cards/${c.id}`);
  }
}

async function goToProjectHub(page, projectId = PROJECT_ID) {
  await ensureSidebarOpen(page);
  await page.click(NAV_PROJECTS);
  await page.waitForSelector('body[data-current-view="projects"]', { timeout: 5_000 });
  await ensureSidebarClosed(page);
  // Wait for the project cards to render
  await page.waitForSelector(`.project-card[data-project-id="${projectId}"]`, { timeout: 8_000 });
  await page.click(`.project-card[data-project-id="${projectId}"]`);
  await page.waitForSelector('body[data-current-view="project-detail"]', { timeout: 5_000 });
  // Wait for the hub grid to be rendered (loader is replaced by the grid)
  await page.waitForSelector('.project-hub-grid', { timeout: 8_000 });
  // Wait for the ideagen button to become visible (set by hub loader)
  await page.waitForSelector('#project-ideagen-btn:not([hidden])', { timeout: 8_000 });
}

test.describe('Idea-gen spawn + notes (Phase 3-B)', () => {
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

  test('Hub "Brainstorm ideas" button POSTs to /ideagen', async ({ authedPage: page }) => {
    let hit = null;
    await page.route(`**/api/projects/${PROJECT_ID}/ideagen`, async (route) => {
      hit = route.request().method();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ session: 'cc-ideas-penates', reused: false }),
      });
    });
    await goToProjectHub(page);
    await page.click('#project-ideagen-btn');
    await expect.poll(() => hit, { timeout: 5_000 }).toBe('POST');
  });

  test('collab card notes render and save in the detail panel', async ({ authedPage: page }) => {
    const created = await (await api(page, 'POST', '/api/board/cards',
      { projectId: PROJECT_ID, title: 'ideagen e2e card', origin: 'collab', notes: 'seed note', stage: 'idea' })).json();
    expect(created.notes).toBe('seed note');

    await ensureSidebarOpen(page);
    await page.click(NAV_BOARD);
    await page.waitForSelector('body[data-current-view="board"]', { timeout: 5_000 });
    await ensureSidebarClosed(page);
    await page.waitForSelector('.board-col[data-stage="idea"]', { timeout: 5_000 });
    await page.click(`.board-card[data-id="${created.id}"]`);
    await page.waitForSelector('#board-detail:not([hidden])', { timeout: 3_000 });
    await expect(page.locator('#board-detail-notes')).toHaveValue('seed note');

    await page.fill('#board-detail-notes', 'edited note');
    await page.locator('#board-detail-notes').blur();
    await expect.poll(async () => {
      const r = await api(page, 'GET', '/api/board/cards');
      return ((await r.json()).cards.find(c => c.id === created.id) || {}).notes;
    }, { timeout: 5_000 }).toBe('edited note');

    await api(page, 'DELETE', `/api/board/cards/${created.id}`);
  });
});
