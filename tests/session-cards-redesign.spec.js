import { test, expect } from './fixtures.js';

// Eine running-Session mit allen früher sichtbaren Feldern befüllt — der
// Redesign-Test prüft, dass die meisten davon NICHT mehr gerendert werden.
const RUNNING = {
  name: 'cc-redesign', status: 'running', attached: false, windows: 1,
  activity: 'waiting', command: 'claude', path: '/tmp',
  contextPct: 71, git: { branch: 'main', dirty: true, ahead: 3, behind: 0 },
  muted: false, pinned: false, created: Date.now() - 3600_000,
  projectId: 'p1', projectName: 'demo-project',
};

// Wie RUNNING, aber mit Registry-Match (`project`-Objekt) — der Pfad-Basename
// ('tmp') ist absichtlich gleich dem project.name, um die frühere Dopplung
// (Header-Badge + leise Meta-Zeile) zu reproduzieren.
const RUNNING_REGISTERED = {
  ...RUNNING, name: 'cc-dup-proj', path: '/tmp',
  project: { id: 'p1', name: 'tmp' },
};

// Session nach ihrem Projekt benannt (Default cc-<projektname>), hier zusätzlich
// mit abweichender Groß-/Kleinschreibung: das Badge wäre redundant zum Namen
// und wird unterdrückt → der Projektname steht nur EINMAL auf der Card.
const RUNNING_SAMEPROJ = {
  ...RUNNING, name: 'cc-YouTube-pipeline', path: '/Users/x/youtube-pipeline',
  project: { id: 'p2', name: 'youtube-pipeline' },
};

function mockSessions(page, sessions) {
  return page.route('**/api/sessions', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessions) });
    }
    return route.continue();
  });
}

test.describe('session card redesign', () => {
  test('running card shows logo + name + status + quiet context meta, hides git/legacy badges', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Logo erscheint (async clis.js import)
    await page.waitForFunction(
      () => document.querySelector('.session-card[data-name="cc-redesign"] .cli-logo svg') !== null,
      { timeout: 10_000 },
    );

    // Name + Status sichtbar
    await expect(card.locator('.session-name-text')).toHaveText('redesign');
    await expect(card.locator('.session-status')).toBeVisible();

    // Status-Streifen folgt der activity
    await expect(card).toHaveAttribute('data-activity', 'waiting');

    // Entfernte Infos NICHT mehr da
    await expect(card.locator('.session-project-badge')).toHaveCount(0);
    await expect(card.locator('.git-badge')).toHaveCount(0);
    await expect(card.locator('.cli-badge')).toHaveCount(0); // Text-Badge ersetzt durch Logo
    // Kontext-% wird (als leise Meta-Zeile) bewusst gezeigt — siehe index.html
    // Kommentar "leise zweite Zeile". Kein Registry-Match (`project`) hier, also
    // kein Header-Badge; der Pfad-Basename steht als Fallback in der Meta-Zeile.
    await expect(card.locator('.session-meta-ctx')).toContainText('71%');
    await expect(card.locator('.session-card-project')).toHaveCount(0);
    // Kein eigener Verbinden-Button mehr
    await expect(card.locator('[data-action="connect"]')).toHaveCount(0);
  });

  // Regression: bei einem Registry-Match wurde der Projektname doppelt
  // gezeigt — als Header-Badge (.session-card-project) UND als leise
  // Meta-Zeile (.session-meta-proj, aus dem Pfad-Basename). Der Basename
  // ist Fallback und darf nur erscheinen, wenn KEIN Badge da ist.
  test('registered session shows the project name once (badge, no meta-proj dupe)', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING_REGISTERED]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const card = page.locator('.session-card[data-name="cc-dup-proj"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Header-Badge mit dem Registry-Namen ist da …
    await expect(card.locator('.session-card-project')).toHaveText('tmp');
    // … und die leise Meta-Proj-Zeile NICHT (sonst stünde 'tmp' doppelt).
    await expect(card.locator('.session-meta-proj')).toHaveCount(0);
    // Kontext-% bleibt in der Meta-Zeile erhalten.
    await expect(card.locator('.session-meta-ctx')).toContainText('71%');
  });

  // Regression: das neue Projekt-Badge wiederholte den Session-Namen, wenn die
  // Session nach ihrem Projekt benannt ist (Default) → "kalvo  kalvo". Das Badge
  // darf nur erscheinen, wenn es zusätzliche Info trägt (Name ≠ Projekt).
  test('session named after its project shows the project name once (badge suppressed, case-insensitive)', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING_SAMEPROJ]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    const card = page.locator('.session-card[data-name="cc-YouTube-pipeline"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    await expect(card.locator('.session-name-text')).toHaveText('YouTube-pipeline');
    // Redundantes Badge unterdrückt (== Name, case-insensitiv) + keine Meta-Proj.
    await expect(card.locator('.session-card-project')).toHaveCount(0);
    await expect(card.locator('.session-meta-proj')).toHaveCount(0);
    // Der Projektname steht genau einmal im Card-Text.
    const n = await card.evaluate(el => (el.textContent.match(/youtube-pipeline/gi) || []).length);
    expect(n).toBe(1);
  });

  test('actions hidden until hover on desktop, always visible on touch', async ({ authedPage: page }, testInfo) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    const kill = card.locator('[data-action="kill"]');
    const isTouch = !!testInfo.project.use.hasTouch;
    if (isTouch) {
      // Touch (@media hover:none): Aktionen dauerhaft sichtbar, kein Hover nötig
      await expect(kill).toBeVisible({ timeout: 2_000 });
      await expect(card.locator('[data-action="pin"]')).toBeVisible();
      await expect(card.locator('[data-action="mute"]')).toBeVisible();
    } else {
      // Desktop: erst nach Hover sichtbar
      await expect(kill).not.toBeVisible();
      await card.hover();
      await expect(kill).toBeVisible({ timeout: 2_000 });
      await expect(card.locator('[data-action="pin"]')).toBeVisible();
      await expect(card.locator('[data-action="mute"]')).toBeVisible();
    }
  });

  test('click on card body connects (opens terminal view)', async ({ authedPage: page }) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Klick auf den Namen (nicht auf einen Button) → Terminal-View
    await card.locator('.session-name-text').click();
    await expect(page.locator('body')).toHaveAttribute('data-current-view', 'terminal', { timeout: 10_000 });
  });

  // Regression: alte absolut-positionierte mute/pin-Regeln + altes
  // .session-actions .btn{flex:1 1 auto} hatten den Kill-Button über die
  // ganze Card gestreckt und pin/mute über die Status-Pille gelegt.
  test('action bar is compact: kill button not stretched, pin/mute aligned in the bar', async ({ authedPage: page }, testInfo) => {
    await mockSessions(page, [RUNNING]);
    await page.reload();
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });
    const card = page.locator('.session-card[data-name="cc-redesign"]');
    await expect(card).toBeVisible({ timeout: 10_000 });

    const kill = card.locator('[data-action="kill"]');
    const pin = card.locator('[data-action="pin"]');
    const mute = card.locator('[data-action="mute"]');
    if (!testInfo.project.use.hasTouch) await card.hover();
    await expect(kill).toBeVisible({ timeout: 2_000 });

    const [killBox, pinBox, muteBox, cardBox] = await Promise.all([
      kill.boundingBox(), pin.boundingBox(), mute.boundingBox(), card.boundingBox(),
    ]);

    // Kill-Button kompakt: nicht vertikal gestreckt, nicht über die ganze
    // Card-Breite gezogen (war vorher ~422px / volle Card-Breite).
    expect(killBox.height).toBeLessThan(44);
    expect(killBox.width).toBeLessThan(cardBox.width * 0.5);

    // pin/mute liegen in der Aktionsleiste (gleiche Zeile wie Kill), nicht
    // mehr absolut oben rechts über der Status-Pille. Vertikal überlappend
    // mit dem Kill-Button, und unterhalb der oberen Card-Hälfte.
    const killMidY = killBox.y + killBox.height / 2;
    for (const b of [pinBox, muteBox]) {
      expect(b.y).toBeLessThanOrEqual(killMidY);
      expect(b.y + b.height).toBeGreaterThanOrEqual(killMidY);
      expect(b.y).toBeGreaterThan(cardBox.y + cardBox.height / 2);
      // rechts ausgerichtet, rechts vom Kill-Button
      expect(b.x).toBeGreaterThan(killBox.x + killBox.width);
    }
  });
});
