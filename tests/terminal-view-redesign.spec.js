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

  test('toolbar is icon-only with a hairline divider', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    // Keine sichtbaren Button-Labels in der Terminal-Toolbar.
    const visibleLabels = page.locator('.terminal-toolbar .btn-label:visible');
    await expect(visibleLabels).toHaveCount(0);
    // Hairline-Divider vorhanden.
    await expect(page.locator('.terminal-toolbar-divider')).toHaveCount(1);
  });

  test('panel toggle shows active state when its panel is open', async ({ authedPage: page, hubSession, isTouch }) => {
    test.skip(isTouch, 'panels are fullscreen overlays on touch — toolbar toggles not clickable');
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    const filesBtn = page.locator('#btn-toggle-files');
    // Der Files-Toggle ist nur sichtbar, wenn die Session aktivierbar ist.
    if (!(await filesBtn.isVisible())) test.skip(true, 'files toggle not available for this session');
    await expect(filesBtn).not.toHaveClass(/is-active/);
    await filesBtn.click();
    await page.waitForSelector('#files-sidebar.open', { timeout: 5_000 });
    await expect(filesBtn).toHaveClass(/is-active/);
  });

  test('toolbar buttons carry data-tooltip', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await expect(page.locator('#btn-toggle-search')).toHaveAttribute('data-tooltip', 'Search');
    await expect(page.locator('#image-picker-btn')).toHaveAttribute('data-tooltip', 'Insert image');
  });
});
