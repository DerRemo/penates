import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal, goBackToDashboard, getToken } from './helpers.js';

test.describe('Terminal', () => {
  test('terminal renders after session attach', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await expect(page.locator('#terminal-container .xterm-screen')).toBeVisible();
  });

  test('keyboard input appears in terminal', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const marker = `echo MARKER-${Date.now()}`;
    await page.locator('#terminal-container').click();
    await page.keyboard.type(marker, { delay: 30 });
    await page.keyboard.press('Enter');

    await page.waitForTimeout(1_000);
    const terminalText = await page.evaluate(() => {
      const term = window.__penatesTerm;
      if (!term) return '';
      const buf = term.buffer.active;
      let text = '';
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i);
        if (line) text += line.translateToString(true) + '\n';
      }
      return text;
    });
    expect(terminalText).toContain('MARKER-');
  });

  test('terminal resizes on viewport change', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const colsBefore = await page.evaluate(() => window.__penatesTerm?.cols);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(1_000);
    const colsAfter = await page.evaluate(() => window.__penatesTerm?.cols);

    if (colsBefore && colsAfter) {
      expect(colsAfter).not.toBe(colsBefore);
    }
  });

  test('disconnect button returns to dashboard', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await goBackToDashboard(page);
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'dashboard');
  });

  test('killing via dashboard card ends the session', async ({ authedPage: page }) => {
    const name = `e2e-kill-${Date.now()}`;
    const token = await getToken(page);
    await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: '/tmp', command: 'bash --noprofile --norc' },
    });

    try {
      // Card erscheint via 5s-Poll. Kill über das Karten-Aktionsmenü (Dashboard),
      // nicht mehr über einen Terminal-Toolbar-Button (entfernt).
      const card = page.locator(`.session-card[data-name="cc-${name}"]`);
      await card.waitFor({ timeout: 10_000 });
      await expect(card).toHaveAttribute('data-status', 'running');
      // Aktionen sind bis Hover ausgeblendet (visibility:hidden) — erst hovern.
      await card.hover();
      page.once('dialog', dialog => dialog.accept());
      await card.locator('[data-action="kill"]').click();
      // Hub-erstellte Sessions bleiben in known-sessions registriert → die Karte
      // wechselt nach dem Kill von running auf dormant (Session beendet, aber
      // wiederherstellbar), statt zu verschwinden.
      await expect(card).toHaveAttribute('data-status', 'dormant', { timeout: 10_000 });
    } finally {
      await page.request.delete(`/api/sessions/cc-${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  });

  test('idea capture modal opens', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const ideaBtn = page.locator('#idea-capture-btn');
    // Check DOM `hidden` property rather than CSS visibility — the `.btn`
    // display rule overrides the [hidden] attribute, so isVisible() can
    // return true even when the button is functionally disabled.
    const isHidden = await ideaBtn.evaluate(el => el.hidden);
    if (isHidden) {
      test.skip(true, 'idea capture button not active (no project context for this session)');
      return;
    }

    await ideaBtn.click();
    await expect(page.locator('#idea-modal')).toBeVisible({ timeout: 3_000 });
    await page.click('#idea-modal-cancel');
    await expect(page.locator('#idea-modal')).not.toBeVisible({ timeout: 3_000 });
  });

  test('connection status indicator shows connected', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    const status = page.locator('.connection-status, [data-connection-status]');
    if (await status.count() > 0) {
      await expect(status).toContainText(/connect/i, { timeout: 5_000 });
    }
  });
});
