import { test, expect } from './fixtures.js';
import { navigateToSession, waitForTerminal } from './helpers.js';

// These guard the three Settings → live-terminal effects that previously
// stored a pref but did nothing: copy-on-select was fully dead, and scrollback
// + bell only applied at the next terminal (re)connect, not live.

test.describe('Terminal pref effects', () => {
  test('Copy on select mirrors the selection into the clipboard', async ({ authedPage: page, hubSession, context, browserName }) => {
    // Clipboard read/write is reliable on chromium with granted permissions;
    // webkit's clipboard API is restricted in http test contexts.
    test.skip(browserName !== 'chromium', 'clipboard API: chromium only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // We assert the wiring we added: onSelectionChange → pref gate → copy path.
    // Force copyToClipboard's reliable async branch (execCommand('copy') needs a
    // trusted gesture that programmatic selection can't provide) and capture what
    // gets written. Programmatic term.select() fires onSelectionChange and sidesteps
    // tmux mouse-mode, which otherwise eats plain drags.
    await page.evaluate(async () => {
      await window.Prefs.load();
      document.execCommand = () => false;
      window.__copied = [];
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (t) => { window.__copied.push(t); return orig(t); };
      window.Prefs.setRaw('termCopyOnSelect', '0');
    });

    await page.locator('#terminal-container').click();
    await page.keyboard.type('echo AAAAA-11111 BBBBB-22222', { delay: 20 });
    await page.waitForTimeout(600);

    // Select DISTINCT markers in the OFF vs ON phase so the selection model truly
    // changes each time (xterm coalesces onSelectionChange to the net final state).
    const selectMark = (mark) => page.evaluate((m) => {
      const term = window.__cchubTerm;
      const buf = term.buffer.active;
      for (let i = 0; i < buf.length; i++) {
        const s = buf.getLine(i)?.translateToString(true) || '';
        const col = s.indexOf(m);
        if (col >= 0) { term.clearSelection(); term.select(col, i, m.length); return term.getSelection(); }
      }
      return '';
    }, mark);

    // Pref OFF (default): selecting fires onSelectionChange but must NOT copy.
    expect(await selectMark('AAAAA-11111')).toContain('AAAAA-11111');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__copied.length), 'pref OFF → no copy').toBe(0);

    // Pref ON: a fresh selection is mirrored into the clipboard.
    await page.evaluate(() => window.Prefs.setRaw('termCopyOnSelect', '1'));
    expect(await selectMark('BBBBB-22222')).toContain('BBBBB-22222');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__copied.some(t => t.includes('BBBBB-22222'))),
      'pref ON → selection copied').toBeTruthy();
  });

  test('Scrollback change applies live to the open terminal', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // Drive the real Settings input + its change handler (no panel toggle needed —
    // initTerminalPrefs binds the listener at startup) and assert the live xterm option.
    const applied = await page.evaluate(() => {
      const sb = document.getElementById('pref-term-scrollback');
      sb.value = '8000';
      sb.dispatchEvent(new Event('change', { bubbles: true }));
      return window.term.options.scrollback;
    });
    expect(applied).toBe(8000);
  });

  test('Bell toggle takes effect live on the open terminal', async ({ authedPage: page, hubSession }) => {
    await navigateToSession(page, hubSession.name);
    await waitForTerminal(page);

    // With the pref OFF, a BEL must not flash; with it ON (no reconnect), it must.
    const result = await page.evaluate(async () => {
      await window.Prefs.load();
      const term = window.__cchubTerm;
      const el = term.element;
      const flashesWhile = (setup) => new Promise((resolve) => {
        let seen = false;
        const obs = new MutationObserver(() => {
          if (el.classList.contains('term-bell-flash')) seen = true;
        });
        obs.observe(el, { attributes: true, attributeFilter: ['class'] });
        setup();
        term.write('\x07', () => {
          setTimeout(() => { obs.disconnect(); resolve(seen); }, 250);
        });
      });
      const off = await flashesWhile(() => window.Prefs.setRaw('termBell', '0'));
      const on = await flashesWhile(() => window.Prefs.setRaw('termBell', '1'));
      return { off, on };
    });
    expect(result.off, 'pref OFF → no flash').toBe(false);
    expect(result.on, 'pref ON → flash live').toBe(true);
  });
});
