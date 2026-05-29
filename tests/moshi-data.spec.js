// E2E für moshi-hook Daten-Schicht:
//   A — Recent-Dirs list im New-Session Modal (mit Source-Badges)
//   B — Hidden wenn keine Dirs vorhanden, Tree-Picker bleibt sichtbar
//   C — Account-Panel in der Usage-Ansicht
import { test, expect } from './fixtures.js';

test.describe('moshi-hook Daten-Schicht', () => {
  // ── Test A: Recent-Dirs mit Source-Badges ───────────────────────────────
  test('recent-dirs list mit source badges', async ({ authedPage: page }) => {
    // Mock muss VOR goto registriert sein — authedPage nutzt page.goto('/') intern,
    // aber wir können page.route() vor dem Modal-Open setzen da die Daten erst
    // beim Modal-Open via loadRecentDirs() gefetcht werden.
    await page.route('**/api/recent-dirs**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dirs: [
            { cwd: '/Users/x/alpha', sources: ['claude'], lastUsed: 1780056840 },
            { cwd: '/Users/x/beta', sources: ['codex', 'cursor'], lastUsed: 1780056813 },
          ],
        }),
      });
    });

    // Modal öffnen
    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    // Recent-Dirs-Block muss sichtbar sein
    await expect(page.locator('#recent-dirs')).toBeVisible({ timeout: 5_000 });

    // Exakt 2 Einträge
    await expect(page.locator('.recent-dir-item')).toHaveCount(2);

    // Erster Eintrag hat Badge "claude"
    const firstBadge = page.locator('.recent-dir-item').first().locator('.recent-src-badge').first();
    await expect(firstBadge).toHaveText('claude');

    // Klick auf ersten Eintrag → #tree-selected zeigt den Pfad
    await page.locator('.recent-dir-item').first().click();
    await expect(page.locator('#tree-selected')).toContainText('/Users/x/alpha');

    // Aufräumen
    await page.keyboard.press('Escape');
  });

  // ── Test B: hidden wenn keine Dirs, Tree-Picker bleibt sichtbar ─────────
  test('hidden wenn keine recent-dirs', async ({ authedPage: page }) => {
    await page.route('**/api/recent-dirs**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dirs: [] }),
      });
    });

    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    // Kurz warten damit loadRecentDirs() ausgeführt wurde
    await page.waitForTimeout(500);

    // recent-dirs muss versteckt bleiben
    await expect(page.locator('#recent-dirs')).toBeHidden();

    // Tree-Picker muss sichtbar sein
    await expect(page.locator('#tree-picker')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  // ── Test C: Account-Panel in der Usage-Ansicht ──────────────────────────
  test('account panel in Usage-Ansicht', async ({ authedPage: page }) => {
    // resetsAt als unix seconds (wie die REAL-Route nach Fix 1 liefert),
    // damit formatResetCountdown(unixTs) keinen NaN-Countdown rendert.
    const resetsAt5h = Math.floor(Date.now() / 1000) + 3600;
    const resetsAt7d = Math.floor(Date.now() / 1000) + 86400;
    await page.route('**/api/usage/limits**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accounts: [
            {
              accountId: 'claude:abc',
              accountLabel: 'Max 5x',
              agent: 'claude-code',
              windows: [
                { label: '5h', usedPercentage: 7, resetsAt: resetsAt5h },
                { label: '7d', usedPercentage: 8, resetsAt: resetsAt7d },
              ],
            },
          ],
          points: [],
          peaks5h: 0,
          peaks7d: 0,
        }),
      });
    });

    // Usage-Tab aktivieren — Navigation ist in der Sidebar (nicht in .dashboard-tabs).
    // Auf Mobile/Tablet muss die Sidebar zuerst geöffnet werden.
    const sidebarToggle = page.locator('#sidebar-toggle');
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      await page.waitForTimeout(300);
    }
    await page.click('[data-sidebar-nav="usage"]');
    await page.waitForSelector('body[data-active-tab="usage"]', { timeout: 5_000 });

    // Account-Label muss "Max 5x" enthalten
    await expect(page.locator('.usage-account-label').first()).toContainText('Max 5x', { timeout: 5_000 });

    // Reset-Countdown darf kein "NaN" enthalten — prüft dass resetsAt als
    // unix seconds korrekt durch formatResetCountdown() verarbeitet wird.
    const resetText = await page.locator('.usage-limit-reset').first().innerText();
    expect(resetText).not.toContain('NaN');
  });
});
