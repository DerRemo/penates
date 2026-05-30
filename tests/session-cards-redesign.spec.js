import { test, expect } from './fixtures.js';

// Eine running-Session mit allen früher sichtbaren Feldern befüllt — der
// Redesign-Test prüft, dass die meisten davon NICHT mehr gerendert werden.
const RUNNING = {
  name: 'cc-redesign', status: 'running', attached: false, windows: 1,
  activity: 'waiting', command: 'claude', path: '/tmp',
  contextPct: 71, git: { branch: 'main', dirty: true, ahead: 3, behind: 0 },
  muted: false, pinned: false, created: Date.now() - 3600_000,
  projectId: 'p1', projectName: 'demo-project',
};

function mockSessions(page, sessions) {
  return page.route('**/api/sessions', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    }
    return route.continue();
  });
}

test.describe('session card redesign', () => {
  test('running card shows logo + name + status, hides project/context/git', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Logo erscheint (async clis.js import)
    await page.waitForFunction(
      () => document.querySelector('.session-card[data-name="cc-redesign"] .cli-logo svg') !== null,
      { timeout: 10_000 },
    );

    // Name + Status sichtbar
    await expect(card.locator('.session-name-text')).toHaveText('redesign');
    await expect(card.locator('.session-status')).toBeVisible();

    // Status-Streifen folgt der activity
    await expect(card).toHaveAttribute('data-activity', 'waiting');

    // Entfernte Infos NICHT mehr da
    await expect(card.locator('.session-project-badge')).toHaveCount(0);
    await expect(card.locator('.git-badge')).toHaveCount(0);
    await expect(card.locator('.cli-badge')).toHaveCount(0); // Text-Badge ersetzt durch Logo
    await expect(card).not.toContainText('71%');
    // Kein eigener Verbinden-Button mehr
    await expect(card.locator('[data-action="connect"]')).toHaveCount(0);
  });

  test('actions hidden until hover on desktop, always visible on touch', async ({ authedPage: page }, testInfo) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    const kill = card.locator('[data-action="kill"]');
    const isTouch = !!testInfo.project.use.hasTouch;
    if (isTouch) {
      // Touch (@media hover:none): Aktionen dauerhaft sichtbar, kein Hover nötig
      await expect(kill).toBeVisible({ timeout: 2_000 });
      await expect(card.locator('[data-action="pin"]')).toBeVisible();
      await expect(card.locator('[data-action="mute"]')).toBeVisible();
    } else {
      // Desktop: erst nach Hover sichtbar
      await expect(kill).not.toBeVisible();
      await card.hover();
      await expect(kill).toBeVisible({ timeout: 2_000 });
      await expect(card.locator('[data-action="pin"]')).toBeVisible();
      await expect(card.locator('[data-action="mute"]')).toBeVisible();
    }
  });

  test('click on card body connects (opens terminal view)', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Klick auf den Namen (nicht auf einen Button) → Terminal-View
    await card.locator('.session-name-text').click();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'terminal', { timeout: 10_000 });
  });
});
