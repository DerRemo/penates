import { test, expect } from './fixtures.js';
import { getToken, ensureSidebarOpen, ensureSidebarClosed } from './helpers.js';

// Projekt-Hub E2E (Idea Pipeline Phase 2).
// The E2E server runs with BOARD_PATH=/tmp/penates-e2e-board.json so creating/
// deleting board cards never touches the real ~/.penates/board.json.
// The projects registry and CHANGELOG.md files are real — tests MUST NOT
// mutate them (no checkbox clicks, no item edits, no releases).

const NAV_PROJECTS = '[data-sidebar-nav="projects"]';

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

async function goToProjectHub(page, projectId = 'penates') {
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
}

test.describe('Projekt-Hub (Phase 2)', () => {
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

  test('renders the 4 hub blocks', async ({ authedPage: page }) => {
    await goToProjectHub(page);
    await expect(page.locator('.project-hub-grid')).toBeVisible();
    await expect(page.locator('#hub-pipeline')).toBeVisible();
    await expect(page.locator('#hub-repo')).toBeVisible();
    await expect(page.locator('[data-block="sessions"]')).toBeVisible();
    await expect(page.locator('[data-block="releases"]')).toBeVisible();
  });

  test('+ Idee adds a card that appears in Pipeline-Slice', async ({ authedPage: page }) => {
    await goToProjectHub(page);
    await page.click('#project-add-idea-btn');
    await page.waitForSelector('#penates-input-modal.open', { timeout: 3_000 });
    const title = `E2E hub idea ${Date.now()}`;
    await page.fill('#penates-input-field', title);
    await page.click('#penates-input-ok');
    await page.waitForSelector('#penates-input-modal:not(.open)', { timeout: 3_000 });
    const card = page.locator('#hub-pipeline .hub-pl-card', { hasText: title });
    await expect(card).toBeVisible({ timeout: 5_000 });
  });

  test('Releases block exposes the restyled roadmap editor', async ({ authedPage: page }) => {
    await goToProjectHub(page);
    const releasesCell = page.locator('[data-block="releases"]');
    await expect(releasesCell).toBeVisible();
    // At least one roadmap section (Released / In Development / Changelog)
    await expect(releasesCell.locator('.roadmap-section').first()).toBeVisible();
    // Checkboxes exist (the hub CHANGELOG.md has items) — do NOT click them
    await expect(releasesCell.locator('.roadmap-checkbox').first()).toBeVisible();
  });

  test('Repo-Glance shows status + commits', async ({ authedPage: page }) => {
    await goToProjectHub(page);
    // Repo glance loads async; wait for the status pill to appear
    await expect(page.locator('#hub-repo .hub-repo-status')).toBeVisible({ timeout: 8_000 });
    // The hub repo always has commits
    await expect(page.locator('#hub-repo .hub-commits li').first()).toBeVisible({ timeout: 8_000 });
  });
});
