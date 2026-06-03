import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

test.describe('Terminal clipboard', () => {
  // Clipboard read/write is reliable on chromium with granted permissions;
  // webkit's clipboard API is restricted in http test contexts.
  test.skip(({ browserName }) => browserName !== 'chromium', 'clipboard API: chromium only');

  test('Cmd/Ctrl+C copies the xterm selection', async ({ authedPage: page, hubSession, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    await page.locator('#terminal-container').click();
    await page.keyboard.type('echo COPYME-12345', { delay: 20 });
    await page.waitForTimeout(600);

    const selected = await page.evaluate(() => {
      const term = window.__cchubTerm;
      const buf = term.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        const s = buf.getLine(i)?.translateToString(true) || '';
        const col = s.indexOf('COPYME-12345');
        if (col >= 0) { term.select(col, i, 'COPYME-12345'.length); return term.getSelection(); }
      }
      return '';
    });
    expect(selected).toContain('COPYME-12345');

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+c`);
    await page.waitForTimeout(200);

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('COPYME-12345');
  });
});
