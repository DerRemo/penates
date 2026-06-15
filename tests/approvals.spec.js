// E2E: Approvals + granulare Activity. Kein echtes Claude nötig — der Test
// schickt selbst einen PreToolUse-Long-Poll (wie der Hook) und prüft Routing,
// Gating und das Dashboard-Prompt. foreign tmux-Session (kein cc-Prefix) als cwd.
import { test, expect } from './fixtures.js';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TMUX = process.env.TMUX_PATH || (() => {
  try { return execFileSync('/usr/bin/which', ['tmux'], { encoding: 'utf8' }).trim(); }
  catch { return '/opt/homebrew/bin/tmux'; }
})();
const TOKEN = process.env.AUTH_TOKEN || '';
let SESSION = 'approve-e2e';
let dir = null;

function kill() { try { execFileSync(TMUX, ['kill-session', '-t', SESSION], { stdio: 'pipe' }); } catch {} }

test.describe('Approvals + Activity', () => {
  test.beforeEach(async ({}, info) => {
    SESSION = `approve-e2e-${info.workerIndex}-${Date.now().toString(36)}`;
    dir = mkdtempSync(join(tmpdir(), 'approve-'));
    kill();
    execFileSync(TMUX, ['new-session', '-d', '-s', SESSION, '-c', dir, 'bash', '--noprofile', '--norc'], { stdio: 'pipe' });
  });
  test.afterEach(async () => { kill(); if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null; } });

  test('gerouteter PreToolUse zeigt Approval-Card und Allow liefert die Decision', async ({ page, request }) => {
    // Registriere den WS-Listener BEVOR wir die Seite laden, damit das
    // tool-approval-request Event nicht verpasst wird.
    const wsReady = page.waitForEvent('websocket', {
      predicate: ws => ws.url().includes('/api/notifications/events'),
      timeout: 15_000,
    });

    await page.goto('/');
    await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

    // WS-Verbindung abwarten bevor der Hook abgeschickt wird.
    const notifyWs = await wsReady;
    // Warte auf erstes Frame (bestätigt dass der Server die Verbindung akzeptiert hat).
    await notifyWs.waitForEvent('framereceived', { timeout: 8_000 }).catch(() => {});

    const poll = request.post('/api/hooks/pre-tool-use', {
      headers: { Authorization: `Bearer ${TOKEN}`, 'X-Penates-Session': SESSION, 'Content-Type': 'application/json' },
      data: { tool_name: 'Bash', permission_mode: 'default', tool_input: { command: 'rm -rf build' } },
      timeout: 30_000,
    });

    const card = page.locator('.approval-card', { hasText: 'Bash' });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('rm -rf build');
    await card.locator('.approval-card__allow').click();

    const resp = await poll;
    const body = await resp.json();
    expect(body.hookSpecificOutput.permissionDecision).toBe('allow');
    await expect(card).toBeHidden();
  });

  test('yolo-Modus wird sofort gedefert (kein Prompt, leerer Body)', async ({ request }) => {
    const resp = await request.post('/api/hooks/pre-tool-use', {
      headers: { Authorization: `Bearer ${TOKEN}`, 'X-Penates-Session': SESSION, 'Content-Type': 'application/json' },
      data: { tool_name: 'Bash', permission_mode: 'bypassPermissions', tool_input: { command: 'ls' } },
    });
    expect(resp.status()).toBe(200);
    expect((await resp.text()).length).toBe(0);
  });

  test('PreToolUse setzt das läuft-Badge der Session', async ({ page, request }) => {
    // Für den Badge-Test brauchen wir eine RUNNING-Session (hub-managed),
    // da foreign-Cards keine .session-status-Pill haben. Wir erstellen eine
    // Session über die API (cc-Prefix wird automatisch gesetzt).
    const suffix = `approve-badge-${Date.now().toString(36)}`;
    const createRes = await request.post('/api/sessions', {
      headers: { Authorization: `Bearer ${TOKEN}` },
      data: { name: suffix, directory: dir, command: 'bash --noprofile --norc' },
    });
    expect(createRes.ok(), `session create failed: ${createRes.status()}`).toBeTruthy();
    const hubName = `cc-${suffix}`;

    try {
      // Notifications-WS-Listener VOR dem Seitenaufruf registrieren
      const wsReady = page.waitForEvent('websocket', {
        predicate: ws => ws.url().includes('/api/notifications/events'),
        timeout: 15_000,
      });

      await page.goto('/');
      await page.waitForSelector('body[data-current-view="dashboard"]', { timeout: 10_000 });

      // WS abwarten und Session-Card laden
      const notifyWs = await wsReady;
      await notifyWs.waitForEvent('framereceived', { timeout: 8_000 }).catch(() => {});

      const card = page.locator(`.session-card[data-name="${hubName}"]`);
      await expect(card).toBeVisible({ timeout: 15_000 });

      // PreToolUse mit acceptEdits — wird nicht geroutet (mode!=='default'),
      // aber reportToolStart wird aufgerufen → session-activity-Broadcast
      // → patchActivityBadge → Badge zeigt "läuft: Bash" / "running: Bash"
      await request.post('/api/hooks/pre-tool-use', {
        headers: { Authorization: `Bearer ${TOKEN}`, 'X-Penates-Session': hubName, 'Content-Type': 'application/json' },
        data: { tool_name: 'Bash', permission_mode: 'acceptEdits', tool_input: { command: 'ls' } },
      });

      const badge = card.locator('.session-status');
      await expect(badge).toContainText('Bash', { timeout: 8_000 });
    } finally {
      await request.delete(`/api/sessions/${encodeURIComponent(hubName)}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }).catch(() => {});
    }
  });
});
