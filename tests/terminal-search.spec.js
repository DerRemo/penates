import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

// Schreibt einen eindeutigen Token mehrfach ins Terminal und wartet auf Render.
async function seedTerminal(page, token) {
  await page.locator('#terminal-container').click();
  await page.keyboard.type(`printf '${token} ${token} ${token}\\n'`, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
}

test.describe('Terminal search', () => {
  test('toolbar button toggles the search overlay', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const overlay = page.locator('#term-search');
    await expect(overlay).toBeHidden();

    await page.click('#btn-toggle-search');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#term-search-input')).toBeFocused();

    // Toggle wieder zu.
    await page.click('#btn-toggle-search');
    await expect(overlay).toBeHidden();
  });

  test('search finds matches, navigates, and Esc closes', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const token = `SRCH${Date.now()}`;
    await seedTerminal(page, token);

    await page.click('#btn-toggle-search');
    await page.locator('#term-search-input').fill(token);

    // Trefferzähler erscheint als "aktiv/gesamt" mit gesamt >= 1.
    const count = page.locator('#term-search-count');
    await expect(count).toHaveText(/^\d+\/\d+$/);
    const [, total] = (await count.textContent()).split('/').map(Number);
    expect(total).toBeGreaterThanOrEqual(1);

    // Aktiven Index notieren, "nächster" klicken, Index muss sich ändern (bei total>1).
    const before = await count.textContent();
    await page.click('#term-search-next');
    await expect(count).toHaveText(/^\d+\/\d+$/);
    if (total > 1) {
      await expect(count).not.toHaveText(before);
    }

    // Esc schließt das Overlay.
    await page.locator('#term-search-input').press('Escape');
    await expect(page.locator('#term-search')).toBeHidden();
  });
});
