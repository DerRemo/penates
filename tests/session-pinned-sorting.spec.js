import { test, expect } from './fixtures.js';

// Route-mock /api/sessions — no real tmux. Names chosen so alphabetical order
// (aaa < zzz) fights pinned-first: cc-zzz is pinned, cc-aaa is not, so a
// correct "pinned first" beats a plain alphabetical sort.
const PIN_RUN  = { name: 'cc-zzz', status: 'running', attached: false, windows: 1, activity: 'idle',    command: 'claude', path: '/tmp', muted: false, pinned: true,  boardCard: null };
const PIN_DORM = { name: 'cc-apple', status: 'dormant', attached: false, windows: 0, activity: 'unknown', command: 'claude', path: '/tmp', muted: false, pinned: true,  boardCard: null, lastSeenAt: 1718000000000 };
const PLAIN    = { name: 'cc-aaa', status: 'running', attached: false, windows: 1, activity: 'idle',    command: 'claude', path: '/tmp', muted: false, pinned: false, boardCard: null };

function mockSessions(page, sessions) {
  return page.route('**/api/sessions', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    }
    return route.continue();
  });
}

test.describe('Pinned sessions ordering', () => {
  test('overview shows an Angeheftet section on top with pinned cards alphabetical', async ({ authedPage: page }) => {
    await mockSessions(page, [PLAIN, PIN_RUN, PIN_DORM]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    // session-sort.js is a <script type="module"> that can resolve after the
    // first /api/sessions render (race on DOMContentLoaded). Wait for
    // window.SessionSort, then for the Pinned/Angeheftet header to appear
    // (next poll at ≤5 s re-renders with the correct partitioning).
    await page.waitForFunction(() => !!(window.SessionSort), { timeout: 10_000 });
    // After SessionSort loads, polling re-renders with correct partitioning.
    // Wait for a header whose text starts with "Pinned" or "Angeheftet".
    // Timeout > 5 s covers at least one fresh poll cycle.
    await page.waitForFunction(
      () => {
        const h = document.querySelector('.sessions-section-header');
        if (!h) return false;
        const txt = (h.textContent || '').trim();
        return txt.startsWith('Pinned') || txt.startsWith('Angeheftet');
      },
      { timeout: 8_000 },
    );

    // First section header is the pinned one (locale-tolerant).
    const firstHeader = page.locator('.sessions-section-header').first();
    const headerText = (await firstHeader.textContent())?.trim() ?? '';
    expect(['Pinned', 'Angeheftet'].some(s => headerText.startsWith(s))).toBe(true);

    // Card DOM order: both pinned cards first (apple before zzz), then unpinned aaa.
    const order = await page.locator('.session-card').evaluateAll(
      els => els.map(e => e.getAttribute('data-name')),
    );
    expect(order).toEqual(['cc-apple', 'cc-zzz', 'cc-aaa']);

    // The pinned dormant session renders as a dormant card (restore action present).
    const appleCard = page.locator('.session-card[data-name="cc-apple"]');
    await expect(appleCard).toHaveAttribute('data-status', 'dormant');
  });

  test('sidebar floats the pinned session to the top with a pin glyph', async ({ authedPage: page }) => {
    await mockSessions(page, [PLAIN, PIN_RUN, PIN_DORM]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    // Default sidebar filter = active → running shown, dormant hidden.
    // Visible: cc-zzz (pinned), cc-aaa (unpinned). Pinned-first beats alphabetical.
    const items = await page.locator('#sidebar-sessions .sidebar__item').evaluateAll(
      els => els.map(e => e.getAttribute('data-session')),
    );
    expect(items).toEqual(['cc-zzz', 'cc-aaa']);

    // Pin glyph only on the pinned item.
    await expect(page.locator('#sidebar-sessions .sidebar__item[data-session="cc-zzz"] .sidebar__pin')).toBeVisible();
    await expect(page.locator('#sidebar-sessions .sidebar__item[data-session="cc-aaa"] .sidebar__pin')).toHaveCount(0);
  });
});
