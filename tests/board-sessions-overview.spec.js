import { test, expect } from './fixtures.js';

// Eine running-Session, die eine Board-Karte trägt (boardCard-Subset wie vom
// /api/sessions-Enrichment). Wir route-mocken die Sessions-Liste — kein echter
// Spawn nötig (der Kill-on-Move-Flow wird per Real-App abgenommen, nicht hier).
const BOARD_SESSION = {
  name: 'cc-dark-mode', status: 'running', attached: false, windows: 1,
  activity: 'working', command: 'claude', path: '/tmp',
  muted: false, pinned: false,
  boardCard: { id: 'card-1', title: 'Dark mode toggle', stage: 'brainstorming' },
};

const PLAIN_SESSION = {
  name: 'cc-plain', status: 'running', attached: false, windows: 1,
  activity: 'idle', command: 'claude', path: '/tmp',
  muted: false, pinned: false, boardCard: null,
};

function mockSessions(page, sessions) {
  return page.route('**/api/sessions', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    }
    return route.continue();
  });
}

test.describe('Board sessions in overview', () => {
  test('board session renders in a separate Board section with stage chip + idea title', async ({ authedPage: page }) => {
    await mockSessions(page, [BOARD_SESSION, PLAIN_SESSION]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    // Eigene "Board"-Sektion existiert und steht ganz oben.
    const headers = page.locator('.sessions-section-header');
    await expect(headers.first()).toContainText('Board', { timeout: 10_000 });

    // Die Board-Session-Card trägt das data-board-Flag, zeigt den Ideen-Titel
    // (nicht den Slug) und einen Stage-Chip.
    const boardCard = page.locator('.session-card[data-name="cc-dark-mode"]');
    await expect(boardCard).toHaveAttribute('data-board', 'true');
    await expect(boardCard.locator('.session-name-text')).toHaveText('Dark mode toggle');
    const chip = boardCard.locator('.board-stage-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-stage', 'brainstorming');

    // Activity-Badge bleibt erhalten.
    await expect(boardCard).toHaveAttribute('data-activity', 'working');

    // Die normale Session bleibt OHNE data-board und ohne Stage-Chip.
    const plain = page.locator('.session-card[data-name="cc-plain"]');
    await expect(plain).not.toHaveAttribute('data-board', 'true');
    await expect(plain.locator('.board-stage-chip')).toHaveCount(0);
  });
});
