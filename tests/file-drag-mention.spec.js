// E2E für Drag&Drop aus dem FileBrowser ins Terminal → @-Mention.
// Echtes OS-Drag ist in Playwright nicht zuverlässig auslösbar (bekanntes
// fixme), daher wird der Drop synthetisch via DataTransfer + dispatchEvent
// gefahren und das WS-Input-Payload geprüft. window.currentWs wird gestubbt.
import { test, expect } from './fixtures.js';

const PATH_TYPE = 'application/x-penates-path';

test.describe('FileBrowser → Terminal @-Mention (DnD)', () => {
  test('interner Pfad-Drop schickt @<pfad> an die Terminal-Eingabe (kein Enter)', async ({ authedPage }) => {
    const page = authedPage;
    const result = await page.evaluate((PATH_TYPE) => {
      document.body.setAttribute('data-current-view', 'terminal');
      window.currentSessionName = 'cc-dnd-e2e';
      const sent = [];
      window.currentWs = { readyState: WebSocket.OPEN, send: (d) => sent.push(d) };
      window.term = { focus() {} };

      const container = document.getElementById('terminal-container');
      const dt = new DataTransfer();
      dt.setData(PATH_TYPE, 'src/server.js');

      const enter = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(enter, 'dataTransfer', { value: dt });
      container.dispatchEvent(enter);
      const label = document.getElementById('terminal-drop-label')?.textContent;

      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: dt });
      container.dispatchEvent(drop);

      return { sent, label };
    }, PATH_TYPE);

    expect(result.sent).toHaveLength(1);
    expect(JSON.parse(result.sent[0])).toEqual({ type: 'input', data: '@src/server.js ' });
  });

  test('OS-Datei-Drop wird weiterhin als Upload erkannt, nicht als Mention', async ({ authedPage }) => {
    const page = authedPage;
    const result = await page.evaluate(() => {
      document.body.setAttribute('data-current-view', 'terminal');
      window.currentSessionName = 'cc-dnd-e2e';
      const sent = [];
      window.currentWs = { readyState: WebSocket.OPEN, send: (d) => sent.push(d) };

      const container = document.getElementById('terminal-container');
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([1, 2, 3])], 'foo.bin', { type: 'application/octet-stream' }));

      const enter = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(enter, 'dataTransfer', { value: dt });
      container.dispatchEvent(enter);
      const label = document.getElementById('terminal-drop-label')?.textContent;

      return { sent, label, typesHasFiles: dt.types.includes('Files') };
    });

    // Datei-Drag → Upload-Label, keine @-Mention ins WS-Input.
    expect(result.typesHasFiles).toBe(true);
    expect(result.sent).toHaveLength(0);
    expect(result.label).not.toContain('@');
  });
});
