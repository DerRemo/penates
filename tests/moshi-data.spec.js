// E2E für moshi-hook Daten-Schicht:
//   A — Recent-Dirs list im New-Session Modal (mit Source-Badges)
//   B — Hidden wenn keine Dirs vorhanden, Tree-Picker bleibt sichtbar
//   C — Account-Panel in der Usage-Ansicht
import { test, expect } from './fixtures.js';

test.describe('moshi-hook Daten-Schicht', () => {
  // ── Test A: Recent-Dirs mit Source-Badges ───────────────────────────────
  test('recent-dirs list mit source badges', async ({ authedPage: page }) => {
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

    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });

    // Recent-Liste liegt jetzt hinter dem "Zuletzt"-Tab (Browse ist Default)
    await page.locator('#dir-tabs button[data-tab="recent"]').click();
    await expect(page.locator('#dir-panel-recent')).toBeVisible({ timeout: 5_000 });

    // Exakt 2 Einträge
    await expect(page.locator('.recent-dir-item')).toHaveCount(2);

    // Erster Eintrag hat Badge "claude"
    const firstBadge = page.locator('.recent-dir-item').first().locator('.recent-src-badge').first();
    await expect(firstBadge).toHaveText('claude');

    // Klick auf ersten Eintrag → wechselt zurück auf Browse, #tree-selected zeigt den Pfad
    await page.locator('.recent-dir-item').first().click();
    await expect(page.locator('#tree-selected')).toContainText('/Users/x/alpha');

    await page.keyboard.press('Escape');
  });

  // ── Test B: leerer Recent-Tab zeigt Empty-State, Tree-Picker bleibt nutzbar ─
  test('leerer Recent-Tab zeigt Empty-State, Tree-Picker bleibt nutzbar', async ({ authedPage: page }) => {
    await page.route('**/api/recent-dirs**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dirs: [] }),
      });
    });

    await page.click('#new-session-btn');
    await page.waitForSelector('#new-session-modal.open', { timeout: 5_000 });
    await page.waitForTimeout(500);   // loadRecentDirs() abwarten

    // Browse ist Default → Tree-Picker sichtbar
    await expect(page.locator('#tree-picker')).toBeVisible();

    // Recent-Tab öffnen → kein Eintrag, Empty-State sichtbar
    await page.locator('#dir-tabs button[data-tab="recent"]').click();
    await expect(page.locator('.recent-dir-item')).toHaveCount(0);
    await expect(page.locator('#recent-empty')).toBeVisible();

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

    // Usage-View öffnen — Navigation ist in der Sidebar (Phase-1: eigene
    // Top-Level-View, kein Tab mehr). Auf Mobile/Tablet muss die Sidebar
    // zuerst geöffnet werden.
    const sidebarToggle = page.locator('#sidebar-toggle');
    if (await sidebarToggle.isVisible()) {
      await sidebarToggle.click();
      await page.waitForTimeout(300);
    }
    await page.click('[data-sidebar-nav="usage"]');
    await page.waitForSelector('body[data-current-view="usage"]', { timeout: 5_000 });

    // Account-Label muss "Max 5x" enthalten
    await expect(page.locator('.usage-account-label').first()).toContainText('Max 5x', { timeout: 5_000 });

    // Reset-Countdown darf kein "NaN" enthalten — prüft dass resetsAt als
    // unix seconds korrekt durch formatResetCountdown() verarbeitet wird.
    const resetText = await page.locator('.usage-limit-reset').first().innerText();
    expect(resetText).not.toContain('NaN');
  });
});
