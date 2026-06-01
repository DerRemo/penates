// E2E Phase 4: Detail-Editing-AFFORDANCES (open/cancel) — keine echte Mutation,
// weil die E2E die echte Registry trifft. Die Schreib-Logik ist hermetisch
// unit-getestet (lib/roadmap-writer.test.js, lib/projects.test.js).
import { test, expect } from './fixtures.js';

async function openFirstProjectWithItems(page, isMobile) {
  if (isMobile) { const h = page.locator('#sidebar-toggle'); if (await h.isVisible()) await h.click(); }
  await page.click('[data-sidebar-nav="projects"]');
  // Auf echte Karten warten — NICHT auf den transienten "Lade…"-Placeholder
  // (der teilt sich die .usage-empty-Klasse). Eine wirklich leere/fehlerhafte
  // Registry timeoutet hier bewusst und führt unten zum Skip.
  const card = page.locator('.project-card').first();
  await card.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  if (await card.count() === 0) return false;
  await card.click();
  // Auf den GELADENEN Detail-State warten — wieder nicht auf den
  // "Lade…"-Placeholder. Sektions-Köpfe gibt es nur im fertig gerenderten
  // Body; ein echtes Leer-/Fehler-State ist ein usage-empty ohne Loading-Text.
  await page.waitForFunction(() => {
    const body = document.querySelector('#project-detail-view .detail-body');
    if (!body) return false;
    if (body.querySelector('.roadmap-section-head')) return true;
    const empty = body.querySelector('.usage-empty');
    return !!empty && !/lade|loading/i.test(empty.textContent || '');
  }, { timeout: 8_000 }).catch(() => {});
  return (await page.locator('.roadmap-item').count()) > 0;
}

test.describe('Detail editing affordances (Phase 4)', () => {
  test('inline-edit input opens on edit button and cancels with Escape (no mutation)', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProjectWithItems(page, isMobile)) test.skip(true, 'no project items');
    const item = page.locator('.roadmap-item').first();
    const before = (await item.locator('.roadmap-text').textContent())?.trim();
    await item.hover();
    await item.locator('.roadmap-item-edit').click();
    await expect(item.locator('.roadmap-edit-input')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.roadmap-item').first().locator('.roadmap-text')).toHaveText(before);
  });

  test('inline-edit input opens via keyboard (Enter on focused text) and cancels with Escape (no mutation)', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProjectWithItems(page, isMobile)) test.skip(true, 'no project items');
    const item = page.locator('.roadmap-item').first();
    const text = item.locator('.roadmap-text');
    const before = (await text.textContent())?.trim();
    await text.focus();
    await page.keyboard.press('Enter');
    await expect(item.locator('.roadmap-edit-input')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.roadmap-item').first().locator('.roadmap-text')).toHaveText(before);
  });

  test('move menu opens and closes without selecting', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProjectWithItems(page, isMobile)) test.skip(true, 'no project items');
    const item = page.locator('.roadmap-item').first();
    await item.hover();
    await item.locator('.roadmap-item-move').click();
    await expect(page.locator('.roadmap-move-menu')).toBeVisible();
    await page.keyboard.press('Escape').catch(() => {});
    // Klick außerhalb schließt das Menü
    await page.mouse.click(5, 5);
    await expect(page.locator('.roadmap-move-menu')).toHaveCount(0);
  });

  test('version pill opens an input and cancels with Escape (no mutation)', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProjectWithItems(page, isMobile)) test.skip(true, 'no project items');
    const pill = page.locator('[data-version-edit]').first();
    if (await pill.count() === 0) test.skip(true, 'no versioned section');
    const before = (await pill.textContent())?.trim();
    await pill.click();
    await expect(page.locator('.roadmap-version-input')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-version-edit]').first()).toHaveText(before);
  });
});
