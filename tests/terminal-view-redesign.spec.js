import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

test.describe('Terminal-View redesign', () => {
  test('back button is hidden on desktop, visible on touch', async ({ authedPage: page, hubSession, isTouch }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const back = page.locator('#disconnect-btn');
    if (isTouch) {
      await expect(back).toBeVisible();
    } else {
      await expect(back).toBeHidden();
    }
  });

  test('conn-status pill is hidden once connected', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const status = page.locator('#conn-status');
    // Logik unverändert: data-state wird auf 'connected' gesetzt …
    await expect(status).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
    // … aber per CSS display:none — also nicht sichtbar.
    await expect(status).toBeHidden();
  });
});
