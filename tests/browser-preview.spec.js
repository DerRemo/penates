// E2E für Browser-Preview: Panel öffnet/toggelt, Port-Dropdown befüllt sich
// aus gemocktem /api/preview/ports, iframe-src wird korrekt gebaut, und der
// "nicht konfiguriert"-State erscheint bei config.enabled:false.
// Backend wird per page.route gemockt — keine echte Subdomain/Tunnel nötig.
import { test, expect } from './fixtures.js';

// Aktiviert das Panel ohne echte Terminal-WS-Verbindung: PreviewPanel braucht
// nur das DOM + activateForSession(name). Wir rufen es direkt im Browser auf.
async function activate(page, name = 'cc-preview-e2e') {
  await page.evaluate((n) => {
    // Terminal-View sichtbar machen, sonst ist das Panel display:none (Dashboard-View)
    // und sichtbarkeits-pflichtige Aktionen wie selectOption schlagen fehl.
    document.body.setAttribute('data-current-view', 'terminal');
    window.currentSessionName = n;
    window.PreviewPanel.activateForSession(n);
  }, name);
}

test.describe('Browser-Preview', () => {
  test('Panel öffnet sich und befüllt das Port-Dropdown aus /api/preview/ports', async ({ authedPage }) => {
    const page = authedPage;
    await page.route('**/api/preview/config', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, baseDomain: 'preview.example.com' }) }));
    await page.route('**/api/preview/ports', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ports: [{ port: 5173, process: 'node' }, { port: 3000, process: 'next' }] }) }));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    const opts = page.locator('#preview-port-select option');
    await expect(opts).toHaveCount(3);                 // placeholder + 2 ports
    await expect(page.locator('#preview-port-select')).toContainText(':5173');
    await expect(page.locator('#preview-port-select')).toContainText(':3000');
  });

  test('Auswahl eines Ports baut die korrekte iframe-src', async ({ authedPage }) => {
    const page = authedPage;
    await page.route('**/api/preview/config', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, baseDomain: 'preview.example.com' }) }));
    await page.route('**/api/preview/ports', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ports: [{ port: 5173, process: 'node' }] }) }));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await page.selectOption('#preview-port-select', '5173');
    await expect(page.locator('#preview-iframe')).toHaveAttribute('src', 'https://5173.preview.example.com/');
  });

  test('"nicht konfiguriert"-State bei config.enabled:false', async ({ authedPage }) => {
    const page = authedPage;
    await page.route('**/api/preview/config', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, baseDomain: null }) }));

    await activate(page);
    await page.evaluate(() => window.PreviewPanel.toggle());
    await expect(page.locator('#preview-panel')).toHaveClass(/open/);
    await expect(page.locator('#preview-overlay')).toHaveClass(/show/);
    await expect(page.locator('#preview-overlay')).toContainText('PREVIEW_DOMAIN');
  });

  // Echter Proxy/HMR-Round-Trip + CF-Subdomain-Routing ist in Playwright nicht
  // reproduzierbar (keine echte Wildcard-DNS/Tunnel/Access-Kette). Manuell
  // verifiziert (siehe finale Verifikations-Task).
  test.fixme('lädt + hot-reloadt einen echten Dev-Server über die Subdomain', async () => {});
});
