import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

test.describe('Terminal clipboard OSC 52', () => {
  // Clipboard read/write zuverlässig nur auf chromium mit erteilten Permissions.
  test.skip(({ browserName }) => browserName !== 'chromium', 'clipboard API: chromium only');

  test('OSC 52 write lands in the browser clipboard + shows a toast', async ({ authedPage: page, hubSession, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // Simuliere eine App, die OSC 52 emittiert: ESC ] 52 ; c ; <base64> BEL.
    await page.evaluate(() => {
      const payload = btoa('hello-osc52');
      window.__cchubTerm.write('\x1b]52;c;' + payload + '\x07');
    });
    await page.waitForTimeout(400);

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe('hello-osc52');

    await expect(page.locator('#toast-container .toast')).toContainText('Copied to clipboard');
  });

  test('OSC 52 read query does not clobber the clipboard (write-only)', async ({ authedPage: page, hubSession, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    await page.evaluate(() => navigator.clipboard.writeText('PRESET-CLIP'));
    await page.evaluate(() => window.__cchubTerm.write('\x1b]52;c;?\x07'));
    await page.waitForTimeout(300);

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe('PRESET-CLIP');
  });
});
