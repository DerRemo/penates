// E2E für die redesignte Usage-View: Pace-Hero mit Tick-Marker + farbigen Notes,
// Per-Provider-Block (Claude + Codex) mit Modell-Chips, Trend-SVG (kein Legacy-Table),
// Claude-only-Badge + Fehler-Card, sowie Empty-State.
// Alle drei API-Endpunkte werden per page.route gemockt.
import { test, expect } from './fixtures.js';

// ── Mock-Daten ───────────────────────────────────────────────────────────────

const HISTORY = {
  monthTotal: 48_200_000, monthSessions: 142,
  cacheRate: { read: 9, total: 10, pct: 92 }, workStyle: { toolUse: 86, endTurn: 14, total: 100 },
  days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-05-${String(i+1).padStart(2,'0')}`, input: 1_000_000, output: 500_000, cost: 1 })),
  byProject: [{ project: 'claude-code-hub', path: '/p/hub', tokens: 19_400_000 }],
  heatmap: [{ dow: 1, hour: 10, tokens: 5000 }],
  toolUsage: [{ name: 'Bash', count: 4172 }],
  dailySessions: {}, monthByModel: {},
  errors: { total: 23, byDate: [{ date: '2026-05-20', count: 5 }] },
  byProvider: [
    { provider: 'claude', label: 'Claude', tokens: 37_100_000, costUsd: 152.4, models: [{ model: 'claude-opus-4-6', tokens: 17_200_000, costUsd: 120 }, { model: 'claude-haiku-4-5', tokens: 5_500_000, costUsd: 2 }] },
    { provider: 'codex', label: 'Codex', tokens: 11_100_000, costUsd: 17.6, models: [{ model: 'gpt-5.5', tokens: 11_100_000, costUsd: 17.6 }] },
  ],
};

const LIMITS = { accounts: [
  { accountLabel: 'Max 5x', agent: 'claude-code', capturedAt: new Date().toISOString(),
    windows: [{ label: '5h', usedPercentage: 11, resetsAt: Math.floor(Date.now()/1000)+3*3600,
      pace: { stage: 'behind', deltaPct: -10, expectedPct: 21, actualPct: 11, etaSeconds: null, lastsToReset: true } }] },
  { accountLabel: 'Free', agent: 'codex', capturedAt: new Date().toISOString(),
    windows: [{ label: '30d', usedPercentage: 25, resetsAt: Math.floor(Date.now()/1000)+29*86400,
      pace: { stage: 'ahead', deltaPct: 19, expectedPct: 6, actualPct: 25, etaSeconds: 9*86400, lastsToReset: false } }] },
] };

const COSTS = { totalUsd: 170, totalApiDurationMs: 6.2*3600000, totalLinesAdded: 9015, totalLinesRemoved: 618 };

// ── Hilfsfunktion ────────────────────────────────────────────────────────────

async function gotoUsage(page, { history = HISTORY, limits = LIMITS, costs = COSTS } = {}) {
  await page.route('**/api/usage/history**', r => r.fulfill({ json: history }));
  await page.route('**/api/usage/limits**', r => r.fulfill({ json: limits }));
  if (costs !== null) {
    await page.route('**/api/usage/costs**', r => r.fulfill({ json: costs }));
  } else {
    await page.route('**/api/usage/costs**', r => r.fulfill({ status: 204, body: '' }));
  }

  // Auf Mobile/Tablet muss die Sidebar erst per Hamburger aufgeklappt werden.
  const sidebarToggle = page.locator('#sidebar-toggle');
  if (await sidebarToggle.isVisible()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }

  await page.click('[data-sidebar-nav="usage"]');
  await page.waitForSelector('body[data-current-view="usage"]', { timeout: 8_000 });

  // Auf Mobile/Tablet die Sidebar wieder schließen, damit die View zugänglich ist.
  if (await sidebarToggle.isVisible() &&
      await page.locator('body[data-sidebar-open="true"]').count()) {
    await sidebarToggle.click();
    await page.waitForTimeout(300);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Usage-View (Redesign)', () => {

  test('limit hero rendert mit Pace-Tick-Markern und farbigen Notes', async ({ authedPage: page }) => {
    await gotoUsage(page);
    // Zwei Account-Karten (Max 5x + Free)
    await expect(page.locator('.usage-accts .usage-acct')).toHaveCount(2, { timeout: 8_000 });
    // Mindestens ein Pace-Tick-Marker sichtbar
    await expect(page.locator('.usage-tick').first()).toBeVisible({ timeout: 5_000 });
    // Grüne Note (ahead) + rote Note (behind) vorhanden
    await expect(page.locator('.usage-pace-note.good').first()).toBeVisible();
    await expect(page.locator('.usage-pace-note.bad').first()).toBeVisible();
  });

  test('per-provider Block zeigt Claude + Codex mit Modell-Chips', async ({ authedPage: page }) => {
    await gotoUsage(page);
    // Zwei Provider-Zeilen
    await expect(page.locator('.usage-prov-row')).toHaveCount(2, { timeout: 8_000 });
    // Modell-Chips der beiden Provider
    await expect(page.getByText('claude-opus-4-6')).toBeVisible();
    await expect(page.getByText('gpt-5.5')).toBeVisible();
  });

  test('Trend-SVG vorhanden, Legacy-Tabelle nicht mehr im DOM', async ({ authedPage: page }) => {
    await gotoUsage(page);
    await expect(page.locator('.usage-trend svg')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('.usage-table')).toHaveCount(0);
  });

  test('Claude-only-Badge und Fehler-Card mit Zahl 23', async ({ authedPage: page }) => {
    await gotoUsage(page);
    // Badge (z.B. "Claude only") neben Work-Style- oder Fehler-Abschnitt
    await expect(page.locator('.usage-badge-cl').first()).toBeVisible({ timeout: 8_000 });
    // Fehler-Zahl als großer roter Wert
    await expect(page.locator('.usage-errbig')).toHaveText('23');
  });

  test('leerer Datensatz zeigt Empty-State', async ({ authedPage: page }) => {
    await gotoUsage(page, {
      history: { monthTotal: 0, days: [], byProvider: [], errors: { total: 0, byDate: [] } },
      limits: { accounts: [] },
      costs: null,
    });
    await expect(page.locator('.usage-empty')).toBeVisible({ timeout: 8_000 });
  });

});
