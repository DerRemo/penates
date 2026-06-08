// E2E für Browser-Preview (Single-Host-Modell): Panel öffnet/toggelt, Port-Dropdown
// befüllt sich aus gemocktem /api/preview/ports, Port-Auswahl POSTet an
// /api/preview/select und lädt den FIXEN Host ins iframe, und der
// "nicht konfiguriert"-State erscheint bei config.enabled:false.
// Backend wird per page.route gemockt — keine echte Domain/Tunnel nötig.
import { test, expect } from './fixtures.js';

// Aktiviert das Panel ohne echte Terminal-WS-Verbindung. Terminal-View sichtbar
// machen, sonst ist das Panel display:none (Dashboard) und selectOption scheitert.
async function activate(page, name = 'cc-preview-e2e') {
  await page.evaluate((n) => {
    document.body.setAttribute('data-current-view', 'terminal');
    window.currentSessionName = n;
    window.PreviewPanel.activateForSession(n);
  }, name);
}

function mockConfig(page, body) {
  return page.route('**/api/preview/config', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }));
}
function mockPorts(page, ports) {
  return page.route('**/api/preview/ports', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ports }) }));
}

test.describe('Browser-Preview (single host)', () => {
  test('Combobox öffnet sich und listet die erkannten Ports', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }, { port: 3000, process: 'next' }]);

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await page.click('#preview-port-toggle');                       // Liste aufklappen
    const list = page.locator('#preview-port-list');
    await expect(list).toBeVisible();
    await expect(list.locator('li[data-port="5173"]')).toContainText(':5173');
    await expect(list.locator('li[data-port="3000"]')).toContainText(':3000');
  });

  test('Port-Wahl in der Combobox POSTet an /select und lädt den fixen Host', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }]);
    let selectedPort = null;
    await page.route('**/api/preview/select', async (r) => {
      const body = JSON.parse(r.request().postData() || '{}');
      selectedPort = body.port;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: body.port }) });
    });

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await page.click('#preview-port-toggle');
    await page.click('#preview-port-list li[data-port="5173"]');

    // Feld übernimmt den Port, Hub bekam ihn mitgeteilt …
    await expect(page.locator('#preview-port-input')).toHaveValue('5173');
    await expect.poll(() => selectedPort).toBe(5173);
    // … und das iframe zeigt auf den FIXEN Host, Port nur als Cache-Bust-Query.
    await expect(page.locator('#preview-iframe')).toHaveAttribute('src', 'https://preview.example.com/?__cchub=5173');
  });

  test('Freitext-Port + Enter lädt ebenfalls', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, []);
    let selectedPort = null;
    await page.route('**/api/preview/select', async (r) => {
      selectedPort = JSON.parse(r.request().postData() || '{}').port;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: selectedPort }) });
    });

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await page.fill('#preview-port-input', '8080');
    await page.press('#preview-port-input', 'Enter');
    await expect.poll(() => selectedPort).toBe(8080);
    await expect(page.locator('#preview-iframe')).toHaveAttribute('src', 'https://preview.example.com/?__cchub=8080');
  });

  test('"nicht konfiguriert"-State bei config.enabled:false', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: false, host: null, activePort: null });

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await expect(page.locator('#preview-overlay')).toHaveClass(/show/);
    await expect(page.locator('#preview-overlay')).toContainText('PREVIEW_DOMAIN');
  });

  test('Öffnen zeigt ALLE Ports trotz vorbefülltem Wert; Tippen filtert', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: 5173 });
    await mockPorts(page, [{ port: 5173, process: 'node' }, { port: 3000, process: 'next' }, { port: 8080, process: 'py' }]);
    await page.route('**/api/preview/select', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: 5173 }) }));
    // Letzten Port vorbelegen → Feld ist beim Öffnen befüllt (das war der Bug-Auslöser).
    await page.evaluate(() => localStorage.setItem('cchub_preview_port:cc-preview-e2e', '5173'));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-port-input')).toHaveValue('5173');
    // Chevron öffnen → ALLE drei Ports sichtbar (nicht auf "5173" gefiltert).
    await page.click('#preview-port-toggle');
    const list = page.locator('#preview-port-list');
    await expect(list.locator('li[data-port]')).toHaveCount(3);
    // Tippen filtert: "30" → nur 3000.
    await page.fill('#preview-port-input', '30');
    await expect(list.locator('li[data-port]')).toHaveCount(1);
    await expect(list.locator('li[data-port="3000"]')).toBeVisible();
  });

  test('Prozess-Chip zeigt den Prozess des aktiven Ports und versteckt sich bei unbekanntem', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }, { port: 3000, process: 'next' }]);
    await page.route('**/api/preview/select', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, port: 5173 }) }));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await page.click('#preview-port-toggle');
    await page.click('#preview-port-list li[data-port="5173"]');
    await expect(page.locator('#preview-port-input')).toHaveValue('5173');
    await expect(page.locator('#preview-proc-chip')).toBeVisible();
    await expect(page.locator('#preview-proc-chip')).toHaveText('node');   // Mock labelt 5173 als "node"
    // Unbekannter Freitext-Port → Chip verschwindet
    await page.fill('#preview-port-input', '49999');
    await expect(page.locator('#preview-proc-chip')).toBeHidden();
  });

  test('Empty-State "Port wählen" fokussiert die Combobox und öffnet die Liste', async ({ authedPage }) => {
    const page = authedPage;
    await mockConfig(page, { enabled: true, host: 'preview.example.com', activePort: null });
    await mockPorts(page, [{ port: 5173, process: 'node' }]);
    // Kein Port gespeichert → choose-port empty-state mit Aktion.
    await page.evaluate(() => localStorage.removeItem('cchub_preview_port:cc-preview-e2e'));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    const action = page.locator('#preview-overlay .preview-state-action');
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.locator('#preview-port-input')).toBeFocused();
    await expect(page.locator('#preview-port-list')).not.toHaveAttribute('hidden', /.*/);
  });

  // Echter Proxy/HMR-Round-Trip + CF-Routing ist in Playwright nicht reproduzierbar
  // (keine echte DNS/Tunnel/Access-Kette). Lokal end-to-end gegen echtes Vite verifiziert
  // (siehe finale Verifikation / Commit-Log).
  test.fixme('lädt + hot-reloadt einen echten Dev-Server über den fixen Host', async () => {});
});
