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
      const term = window.__cchubTerm;
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

    const colsBefore = await page.evaluate(() => window.__cchubTerm?.cols);
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(1_000);
    const colsAfter = await page.evaluate(() => window.__cchubTerm?.cols);

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

  test('kill button ends session and returns to dashboard', async ({ authedPage: page }) => {
    const name = `e2e-kill-${Date.now()}`;
    const token = await getToken(page);
    await page.request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, directory: '/tmp', command: 'bash --noprofile --norc' },
    });

    try {
      await navigateToSession(page, `cc-${name}`);
      await waitForTerminal(page);
      // killCurrentSession() uses confirm() dialog
      page.once('dialog', dialog => dialog.accept());
      await page.click('#kill-current-btn');
      await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
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
