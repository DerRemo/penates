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

  test('Ctrl+V does not emit ^V to the PTY (falls through to native paste)', async ({ authedPage: page, hubSession }) => {
    // The bug: xterm converts Ctrl+V → ^V (0x16) and cancels the keydown, so
    // the native paste never fires and the inner TUI (claude) receives ^V —
    // which it reads as "paste image". The fix returns false from the custom
    // key handler so xterm bails before emitting ^V / calling preventDefault,
    // letting the browser run its native paste.
    //
    // Playwright's synthetic Ctrl+V cannot drive a real OS-level clipboard
    // paste (untrusted event), so we assert the precise BUG SIGNATURE instead:
    // Ctrl+V must NOT push the ^V control byte onto the PTY stream. The real
    // end-to-end paste is verified on-device (Firefox/Windows).
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);
    await page.locator('#terminal-container').click();

    await page.evaluate(() => {
      window.__ptyOut = [];
      window.__cchubTerm.onData(d => window.__ptyOut.push(d));
    });

    await page.keyboard.press('a');           // sanity: a normal key reaches the PTY
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+v');   // must not emit ^V
    await page.waitForTimeout(200);

    const { sawA, sawCtrlV } = await page.evaluate(() => ({
      sawA: window.__ptyOut.some(d => d.includes('a')),
      sawCtrlV: window.__ptyOut.some(d => d.includes('\x16')),
    }));
    expect(sawA, 'sanity: a normal key should reach the PTY stream').toBeTruthy();
    expect(sawCtrlV, 'Ctrl+V must NOT emit ^V (0x16) to the PTY').toBeFalsy();
  });
});
