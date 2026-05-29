// E2E für Moshi-Interop: foreign Session meldet Activity unter Rohnamen,
// Adopt behält den Namen (kein cc--Prefix). Prüft auf API-Ebene.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { getToken } from './helpers.js';

const TMUX = process.env.TMUX_PATH || (() => {
  try { return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8', timeout: 3000 }).trim(); }
  catch { return '/opt/homebrew/bin/tmux'; }
})();

// Rohname ohne cc--Prefix → der Hub behandelt ihn als "foreign".
const FOREIGN = 'moshi-e2e-foreign';

function killForeign() {
  try { execFileSync(TMUX, ['kill-session', '-t', FOREIGN], { timeout: 5000, stdio: 'pipe' }); } catch {}
}
function createForeign() {
  execFileSync(TMUX, ['new-session', '-d', '-s', FOREIGN, '-c', process.env.HOME, 'bash', '--noprofile', '--norc'],
    { timeout: 5000, stdio: 'pipe' });
}

// Extrahiert das Sessions-Array unabhängig von der Response-Shape.
// GET /api/sessions liefert ein bare Array — kein Wrapper-Objekt.
async function getSessions(page, auth) {
  const res = await page.request.get('/api/sessions', { headers: auth });
  const data = await res.json();
  return Array.isArray(data) ? data : data.sessions;
}

test.afterEach(async ({ page }) => {
  killForeign();
  // Hook-State für FOREIGN aus dem Server-Memory löschen, damit nachfolgende
  // Projekte (laptop, tablet, mobile) nicht den 'waiting'-State des vorigen
  // Tests erben. SessionEnd löscht den Eintrag vollständig aus attention.js.
  try {
    const token = await getToken(page);
    if (token) {
      await page.request.post('/api/hooks/SessionEnd', {
        headers: { Authorization: `Bearer ${token}`, 'X-CC-Hub-Session': FOREIGN, 'Content-Type': 'application/json' },
        data: {},
      }).catch(() => {});
    }
  } catch {}
});

test('foreign Session meldet Activity unter Rohnamen', async ({ page }) => {
  killForeign();
  createForeign();

  await page.goto('/');
  const token = await getToken(page);
  const auth = { Authorization: `Bearer ${token}` };

  // Vor dem Hook: Session ist foreign mit activity:unknown.
  let sessions = await getSessions(page, auth);
  let s = sessions.find(x => x.name === FOREIGN);
  expect(s, 'foreign session in /api/sessions').toBeTruthy();
  expect(s.status).toBe('foreign');
  expect(s.activity).toBe('unknown');

  // Hook simulieren — wie der self-bootstrapping Hook unter dem tmux-Rohnamen.
  const hook = await page.request.post('/api/hooks/Notification', {
    headers: { ...auth, 'X-CC-Hub-Session': FOREIGN, 'Content-Type': 'application/json' },
    data: {},
  });
  expect(hook.ok()).toBeTruthy();

  // Nach dem Hook: activity ist gesetzt (waiting), Name unverändert.
  sessions = await getSessions(page, auth);
  s = sessions.find(x => x.name === FOREIGN);
  expect(s.activity).toBe('waiting');
});

test('Adopt behält den Originalnamen (kein cc--Prefix)', async ({ page }) => {
  killForeign();
  createForeign();

  await page.goto('/');
  const token = await getToken(page);
  const auth = { Authorization: `Bearer ${token}` };

  const adopt = await page.request.post(`/api/sessions/${encodeURIComponent(FOREIGN)}/adopt`, { headers: auth });
  expect(adopt.ok()).toBeTruthy();
  const body = await adopt.json();
  expect(body.name).toBe(FOREIGN); // kein cc--Prefix

  const sessions = await getSessions(page, auth);
  const s = sessions.find(x => x.name === FOREIGN);
  expect(s).toBeTruthy();
  expect(s.status).toBe('running');
  expect(sessions.find(x => x.name === `cc-${FOREIGN}`)).toBeUndefined();

  // Cleanup: known-Eintrag entfernen, damit Re-Runs sauber sind.
  await page.request.delete(`/api/sessions/${encodeURIComponent(FOREIGN)}/known`, { headers: auth }).catch(() => {});
});
