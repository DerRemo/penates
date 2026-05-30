// E2E für Voice-Input: Config-Gating (Button sichtbar/versteckt), Permission-
// Denied-Toast, Toggle-Zustand (recording-Klasse). Keine echten Audio-Frames
// möglich unter Playwright — WAV→POST→Inject-Pipeline ist als fixme markiert.
// Backend und MediaDevices werden per page.route / addInitScript gemockt.
import { test, expect } from './fixtures.js';

// Mockt /api/voice/config und wechselt in die Terminal-View, analog zu
// browser-preview.spec.js (PreviewPanel.activateForSession-Muster).
async function activateVoice(page, configBody, name = 'cc-voice-e2e') {
  await page.route('**/api/voice/config', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(configBody),
    })
  );
  // Terminal-View aktivieren + VoiceInput.refreshConfig() triggern — identisch
  // zum connectToSession-Pfad, aber ohne echte WS-Verbindung.
  await page.evaluate((n) => {
    document.body.setAttribute('data-current-view', 'terminal');
    window.currentSessionName = n;
    if (window.VoiceInput) window.VoiceInput.refreshConfig();
  }, name);
}

test.describe('Voice-Input', () => {
  test('Button ist versteckt wenn config.enabled:false', async ({ authedPage }) => {
    const page = authedPage;
    await activateVoice(page, { enabled: false });
    // refreshConfig setzt display:none sobald enabled=false
    await expect(page.locator('#voice-btn')).toBeHidden({ timeout: 3000 });
  });

  test('Button ist sichtbar wenn config.enabled:true', async ({ authedPage }) => {
    const page = authedPage;
    await activateVoice(page, { enabled: true });
    await expect(page.locator('#voice-btn')).toBeVisible({ timeout: 3000 });
  });

  test('Mikrofon-Permission verweigert → Fehler-Toast, kein voice-recording', async ({ authedPage, browserName }) => {
    // WebKit: navigator.mediaDevices ist im unsicheren (http) Kontext undefined und
    // Fake-Media wird nicht unterstützt → Mic-Pfad nur auf Chromium testbar.
    test.skip(browserName === 'webkit', 'WebKit: kein mediaDevices/Fake-Media im http-Kontext');
    const page = authedPage;
    await activateVoice(page, { enabled: true });
    await expect(page.locator('#voice-btn')).toBeVisible({ timeout: 3000 });

    // getUserMedia lehnt mit NotAllowedError ab. Override nach page-load via evaluate,
    // da addInitScript nach goto() keine Wirkung mehr hat.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    });

    await page.locator('#voice-btn').click();

    // Toast zeigt deutschen ("Mikrofon") oder englischen ("Microphone") Text
    await expect(page.locator('#toast-container')).toContainText(/Mikrofon|Microphone/i, { timeout: 5000 });

    // Kein recording-State trotz Klick
    await expect(page.locator('#voice-btn')).not.toHaveClass(/voice-recording/);
  });

  test('Toggle startet Aufnahme und stoppt sie wieder', async ({ authedPage, browserName }) => {
    // WebKit: Fake getUserMedia/AudioContext-Override greift nicht (mediaDevices im
    // http-Kontext undefined) → Toggle-Mic-Pfad nur auf Chromium testbar.
    test.skip(browserName === 'webkit', 'WebKit: kein mediaDevices/Fake-Media im http-Kontext');
    const page = authedPage;

    // Transcribe-Endpoint: gibt Text zurück (wird nach Stop aufgerufen)
    await page.route('**/api/voice/transcribe', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'commit das' }),
      })
    );

    await activateVoice(page, { enabled: true });
    await expect(page.locator('#voice-btn')).toBeVisible({ timeout: 3000 });

    // Fake-MediaDevices + AudioContext nach page-load einsetzen (addInitScript
    // hätte nach goto() keine Wirkung mehr). Override direkt auf den Objekten.
    await page.evaluate(() => {
      // Fake-Track & -Stream
      const fakeTrack = { stop() {} };
      const fakeStream = { getTracks: () => [fakeTrack] };
      navigator.mediaDevices.getUserMedia = () => Promise.resolve(fakeStream);

      // Fake-AudioContext-Klassen
      class FakeProcessor {
        constructor() { this.onaudioprocess = null; }
        connect() {}
        disconnect() { this.onaudioprocess = null; }
      }
      class FakeSource {
        connect() {}
        disconnect() {}
      }
      class FakeAudioContext {
        constructor() { this.sampleRate = 48000; this.destination = {}; }
        createMediaStreamSource() { return new FakeSource(); }
        createScriptProcessor() { return new FakeProcessor(); }
        close() {}
      }
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
    });

    // Erster Klick → Aufnahme starten
    await page.locator('#voice-btn').click();
    await expect(page.locator('#voice-btn')).toHaveClass(/voice-recording/, { timeout: 3000 });

    // Zweiter Klick → Aufnahme stoppen (encodeWAV liefert leeres WAV → errEmpty-Toast,
    // aber der recording-State wird in jedem Fall zurückgesetzt)
    await page.locator('#voice-btn').click();
    await expect(page.locator('#voice-btn')).not.toHaveClass(/voice-recording/, { timeout: 5000 });
  });

  // Die vollständige Pipeline (echter Audio-Frame → chunks → WAV-Encoding → POST
  // → Terminal-Inject) und WebKit-Mobile (iOS Safari) sind in Playwright nicht
  // reproduzierbar: Playwright-Fake-Media emittiert keine echten AudioBuffer-
  // Frames in den ScriptProcessorNode. Lokal gegen echtes Mikrofon verifiziert
  // (analog dem synthetic-DnD-fixme in diff-viewer.spec.js).
  test.fixme('Echte Audio-Pipeline: Aufnahme → WAV → POST → Terminal-Inject (WebKit)', async () => {});
});
