// E2E für Connection-Robustness:
//   1. Scrollback-History wird beim Session-Öffnen ins Terminal geseedet.
//   2. Auto-Reconnect nach gedropptem WS (expon. Backoff), xterm bleibt erhalten.
//   3. `online`-Event triggert sofortigen Reconnect.
//
// Sessions werden als normale tmux-Sessions mit cc-Prefix erstellt und
// über ihren card-click im Dashboard geöffnet — das ist die direkte
// Analogie zu diff-viewer.spec.js (startSession + card-click).
// Der cc-Prefix ist nötig, weil /api/sessions sie sonst nicht als "running"
// meldet (hub listet cc-*-Sessions als running, andere als foreign).
import { test, expect } from './fixtures.js';
import { execFileSync } from 'node:child_process';

const TMUX = process.env.TMUX_PATH || (() => {
  try { return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { return '/opt/homebrew/bin/tmux'; }
})();

function makeSession(name, seedCmd) {
  try { execFileSync(TMUX, ['kill-session', '-t', name], { stdio: 'pipe' }); } catch {}
  execFileSync(TMUX, ['new-session', '-d', '-s', name, '-x', '220', '-y', '24'], { stdio: 'pipe' });
  if (seedCmd) {
    execFileSync(TMUX, ['send-keys', '-t', name, seedCmd, 'Enter'], { stdio: 'pipe' });
    // Warten bis der Befehl durchgelaufen ist und in der tmux-History steht
    execFileSync('sh', ['-c', 'sleep 0.8'], { stdio: 'pipe' });
  }
}

function killSession(name) {
  try { execFileSync(TMUX, ['kill-session', '-t', name], { stdio: 'pipe' }); } catch {}
}

// Navigiert zum Dashboard und klickt die Session-Card mit data-name="${name}".
// Wartet dann bis der Terminal-View aktiv ist und der WS verbunden ist.
async function openSessionTerminal(page, name) {
  await page.goto('/');
  await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

  // Dashboard refresht Sessions automatisch beim Boot — die frisch gestartete
  // Session erscheint von selbst; der Card-Wait unten deckt das ab.
  // Running-Cards können direkt geklickt werden; foreign (kein cc-Prefix)
  // brauchen den [data-action="connect"]-Button. Unsere Sessions haben cc-Prefix
  // → erscheinen als running → einfacher Card-Click.
  const card = page.locator(`.session-card[data-name="${name}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'terminal', { timeout: 8_000 });
  // Warten bis der WS die Verbindung aufgebaut hat
  await expect(page.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 15_000 });
}

test.describe('Connection-Robustness', () => {
  test('scrollback history is seeded into the terminal on open', async ({ authedPage }) => {
    const sess = `cc-e2e-scrollback-${Date.now().toString(36)}`;
    // Genug Output, der sicher in der tmux-Scrollback-History landet
    makeSession(sess, 'for i in $(seq 1 60); do echo SCROLLMARK$i; done');
    try {
      await openSessionTerminal(authedPage, sess);
      // Das Seeding schreibt tmux-History ins xterm BEVOR der WS öffnet.
      // captureScrollback (-E -1) liefert die History OBERHALB des aktuellen
      // Pane-Screens. Der aktuelle Screen startet bei SCROLLMARK38 (letzte 24
      // sichtbare Rows einer 60-Echo-Session). SCROLLMARK23–37 kommen also
      // AUSSCHLIESSLICH aus dem Seed — sie wären ohne Seeding nie im xterm.
      // Der Viewport (40 Rows Terminalhöhe) zeigt SCROLLMARK23–60 + Prompt;
      // SCROLLMARK23 ist der erste Seed-exklusive Wert im sichtbaren Bereich.
      // Renderer-agnostisch über die xterm-Buffer-API prüfen (der WebGL-Renderer
      // zeichnet auf <canvas> ohne .xterm-rows-DOM; der Seed landet via term.write
      // im Buffer-Scrollback, also deckt buffer.active beide Renderer ab).
      await expect.poll(async () => authedPage.evaluate(() => {
        const t = window.__penatesTerm;
        if (!t) return '';
        const b = t.buffer.active;
        let s = '';
        for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) || '') + '\n';
        return s;
      }), { timeout: 10_000 }).toContain('SCROLLMARK23');
    } finally {
      killSession(sess);
    }
  });

  test('auto-reconnects after a dropped websocket', async ({ authedPage }) => {
    const sess = `cc-e2e-reconnect-${Date.now().toString(36)}`;
    makeSession(sess, 'echo HELLO');
    try {
      await openSessionTerminal(authedPage, sess);
      await expect(authedPage.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 8_000 });

      // WS von Seiten des Browsers schließen (kein 4001/4004 → Reconnect)
      await authedPage.evaluate(() => {
        if (window.currentWs) window.currentWs.close();
      });

      // Frontend soll selbständig neu verbinden (expon. Backoff, max 30s)
      await expect(authedPage.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 30_000 });

      // Das xterm-Objekt darf NICHT neu erzeugt worden sein
      const stillHasTerm = await authedPage.evaluate(() => !!window.term);
      expect(stillHasTerm).toBe(true);
    } finally {
      killSession(sess);
    }
  });

  test('online event triggers immediate reconnect', async ({ authedPage }) => {
    const sess = `cc-e2e-resume-${Date.now().toString(36)}`;
    makeSession(sess, 'echo HELLO');
    try {
      await openSessionTerminal(authedPage, sess);
      await expect(authedPage.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 8_000 });

      // WS schließen, dann sofort online-Event dispatchen →
      // reconnectNow() soll den Backoff-Timer abbrechen und sofort verbinden
      await authedPage.evaluate(() => {
        if (window.currentWs) window.currentWs.close();
        window.dispatchEvent(new Event('online'));
      });

      await expect(authedPage.locator('#conn-status')).toHaveAttribute('data-state', 'connected', { timeout: 10_000 });
    } finally {
      killSession(sess);
    }
  });

  // Echter Mobile-Sleep/Wake + Netzwerkwechsel (z.B. WiFi → LTE → WiFi) ist
  // in Playwright nicht zuverlässig simulierbar — die CDPSession-
  // emulateNetworkConditions-API erreicht keine echten OS-Network-Events,
  // und pageshow mit persisted=true lässt sich synthetisch nicht auslösen.
  test.fixme('real mobile sleep/wake + network switch recovery', async () => {});
});
