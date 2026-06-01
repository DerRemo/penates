// E2E Phase 3: Detail-Ansicht — Restyle-Präsenz + Sektionen ein-/ausklappen (persistiert).
import { test, expect } from './fixtures.js';

async function gotoProjectsTab(page, isMobile) {
  if (isMobile) {
    const h = page.locator('#sidebar-toggle');
    if (await h.isVisible()) {
      await h.click();
      await page.waitForSelector('body[data-sidebar-open="true"]', { timeout: 3_000 });
    }
  }
  await page.click('[data-sidebar-nav="projects"]');
  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'projects');
  // Auf Mobile bleibt das Drawer ggf. offen — schließen, damit es nicht overlayt.
  if (isMobile && await page.locator('body[data-sidebar-open="true"]').count()) {
    const h = page.locator('#sidebar-toggle');
    if (await h.isVisible()) await h.click();
    await page.waitForTimeout(300);
  }
  // Auf .project-card warten (nicht nur .usage-empty — das matcht sonst den
  // transienten "Lade…"-Placeholder bevor die Karten gerendert sind → falsches
  // Skip). Echtes Leer-/Fehler-State darf timeouten.
  await page.locator('.project-card').first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
}

async function openFirstProject(page, isMobile) {
  await gotoProjectsTab(page, isMobile);
  const card = page.locator('.project-card').first();
  if (await card.count() === 0) return false;
  await card.click();
  await expect(page.locator('body')).toHaveAttribute('data-current-view', 'project-detail');
  // Auf den gesettleten Detail-Render warten: entweder ein echter Sektions-Header
  // (parseable Roadmap) oder der cmd-output-block (Roadmap fehlt). NICHT auf
  // .usage-empty warten — das matcht den transienten "Lade Projekt…"-Placeholder.
  await page.locator('.roadmap-section-head, .cmd-output-block').first()
    .waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  return true;
}

test.describe('Projects detail (Phase 3)', () => {
  test('detail renders sectioned roadmap with collapsible headers', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProject(page, isMobile)) test.skip(true, 'no projects registered');
    const head = page.locator('.roadmap-section-head').first();
    if (await head.count() === 0) test.skip(true, 'project has no parseable roadmap');
    await expect(head).toBeVisible();
    await expect(head.locator('.roadmap-chevron')).toBeVisible();
  });

  test('clicking a section header collapses it and persists across re-navigation', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProject(page, isMobile)) test.skip(true, 'no projects registered');
    const section = page.locator('.roadmap-section').first();
    if (await section.count() === 0) test.skip(true, 'no sections');
    await section.locator('.roadmap-section-head').click();
    await expect(section).toHaveClass(/collapsed/);
    // Collapse persists in localStorage (keyed by projectId::section). Re-navigieren
    // (raus zur Projektliste, wieder ins selbe Projekt) und prüfen dass die erste
    // Sektion weiterhin collapsed ist — der section()-Renderer liest den State beim
    // Re-Render aus localStorage. (Reload landet nicht auf project-detail — die App
    // restauriert nur die Top-Level-Nav-View, daher der Re-Navigate-Fallback.)
    if (!await openFirstProject(page, isMobile)) test.skip(true, 'no projects on re-nav');
    await expect(page.locator('.roadmap-section').first()).toHaveClass(/collapsed/);
    // expand again (cleanup state)
    await page.locator('.roadmap-section').first().locator('.roadmap-section-head').click();
    await expect(page.locator('.roadmap-section').first()).not.toHaveClass(/collapsed/);
  });
});
