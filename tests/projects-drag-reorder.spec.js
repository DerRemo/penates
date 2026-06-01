// E2E Phase 6: Drag-Reorder. Die Greifer + draggable-Attribute sind testbar;
// das eigentliche HTML5-Drag NICHT (Playwright löst keine echten OS-Drag-Events
// aus — siehe CLAUDE.md Tree-DnD). Reorder-Korrektheit: hermetische Unit-Tests
// (lib/roadmap-writer.test.js, lib/projects.test.js) + Route-Live-Check.
import { test, expect } from './fixtures.js';

async function openFirstProjectWithItems(page, isMobile) {
  if (isMobile) { const h = page.locator('#sidebar-toggle'); if (await h.isVisible()) await h.click(); }
  await page.click('[data-sidebar-nav="projects"]');
  await page.waitForSelector('.project-list, .cmd-output-block');
  const card = page.locator('.project-card').first();
  if (await card.count() === 0) return false;
  await card.click();
  await page.waitForSelector('.roadmap-item, .roadmap-section-head, .cmd-output-block');
  return (await page.locator('.roadmap-item').count()) > 0;
}

test.describe('Drag-reorder (Phase 6)', () => {
  test('items expose a drag grip + draggable + data-index', async ({ authedPage: page, isMobile }) => {
    if (!await openFirstProjectWithItems(page, isMobile)) test.skip(true, 'no items');
    const item = page.locator('.roadmap-item').first();
    await expect(item).toHaveAttribute('draggable', 'true');
    await expect(item).toHaveAttribute('data-index', /\d+/);
    await expect(item.locator('.roadmap-grip')).toBeAttached();
  });

  // eslint-disable-next-line no-empty-pattern
  test.fixme('drag a grip reorders the item (real HTML5 DnD not reproducible in Playwright)', async () => {
    // Reorder-Verhalten ist hermetisch unit-getestet; HTML5-DnD via Playwright
    // löst keine echten OS-Drag-Events aus. Manuell/Route-Level verifiziert.
  });
});
