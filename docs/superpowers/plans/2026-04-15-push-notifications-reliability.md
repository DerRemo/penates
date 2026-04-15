# Push Notifications Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push-Notifications sollen zuverlässig auf das iPhone landen wenn der User nicht gerade dieselbe Session im Vordergrund hat — egal ob in einer anderen Session, auf dem Desktop, oder mit geschlossenem Hub. Gleichzeitig VAPID/APNs-Transport so diagnostizierbar machen, dass 403-BadJwtToken-Fehler nicht mehr stumm passieren.

**Architecture:** Zwei unabhängige Tracks. Track B (Tasks 1–5) stabilisiert den VAPID/APNs-Transport und baut Diagnose-Logging ein. Track A (Tasks 6–11) ersetzt die tmux-`attached`-basierte Suppression durch ein Per-Device-Presence-Modell: jeder Client hat eine persistente Device-ID, meldet über den bestehenden Notifications-WebSocket welche Session er gerade sichtbar hat, und Push wird nur für Device/Session-Kombinationen unterdrückt, die *jetzt gerade* im Vordergrund sind.

**Tech Stack:** Node.js ESM, Express, express-ws, `web-push` lib, Vanilla-JS-Frontend (Single-File), Service Worker.

**Spec:** `docs/superpowers/specs/2026-04-15-push-notifications-reliability-design.md`

**Pre-Flight:**
- `CLAUDE.md` lesen (Konventionen, Security-Muster).
- LaunchAgent muss vor jedem `npm start`/`node server.js` gestoppt werden, sonst Port-Konflikt auf 3333:
  ```bash
  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
  ```
- Nach jedem Code-Change am Server, wenn LaunchAgent wieder aktiv ist, neu starten:
  ```bash
  launchctl kickstart -k gui/$(id -u)/com.derremo.claude-code-hub
  ```
- Tests laufen mit `node --test lib/`.

---

## Track B — VAPID/APNs Transport stabilisieren

### Task 1: `web-push` Library auf aktuelle Version bringen

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Aktuelle installierte Version prüfen**

```bash
cd ~/Projects/claude-code-hub && npm ls web-push
```

Expected: Output zeigt eine `web-push@3.x.x`-Version.

- [ ] **Step 2: Neueste Version installieren**

```bash
cd ~/Projects/claude-code-hub && npm install web-push@latest
```

Expected: `package.json` zeigt neue Version, `package-lock.json` aktualisiert.

- [ ] **Step 3: Smoke-Test: Server startet ohne Errors**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && timeout 3 node server.js; echo "exit=$?"
```

Expected: Startup-Lines inkl. `[vapid] …`, dann SIGTERM nach 3s. `exit=124` (timeout) ist OK.

- [ ] **Step 4: LaunchAgent wieder starten**

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "push: web-push lib auf aktuelle Version bumpen"
```

---

### Task 2: `push-subscriptions.js` Schema erweitern (deviceId, Diagnostik-Felder)

**Files:**
- Modify: `lib/push-subscriptions.js` (komplett)
- Create: `lib/push-subscriptions.test.js`

**Schema:**
```js
{
  endpoint, keys: {p256dh, auth},        // wie bisher
  expirationTime,                         // wie bisher
  deviceId,                               // NEU: UUID vom Client
  createdAt,                              // NEU: Millis
  failedAttempts,                         // NEU: Zähler für 403-Burst
  lastError,                              // NEU: { at, statusCode, reason }
}
```

Alte Subscriptions ohne `deviceId` werden beim Load **gepruned** — der Client registriert sich beim nächsten `initPush()` idempotent neu.

- [ ] **Step 1: Test für Load-Migration schreiben**

Create `lib/push-subscriptions.test.js`:

```js
// Tests für lib/push-subscriptions.js — node --test lib/push-subscriptions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// In-tmp override via HOME-env. Modul erwartet ~/.claude-code-hub.
const tmp = await fs.mkdtemp(join(tmpdir(), 'cchub-push-'));
process.env.HOME = tmp;

// Dynamischer Import nach HOME-Setup
const subs = await import('./push-subscriptions.js');

async function writeStore(data) {
  await fs.mkdir(join(tmp, '.claude-code-hub'), { recursive: true });
  await fs.writeFile(
    join(tmp, '.claude-code-hub', 'push-subscriptions.json'),
    JSON.stringify(data, null, 2),
    'utf-8',
  );
}

test('saveSub — vollständige Sub mit deviceId wird gespeichert', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  const all = subs.allSubs();
  assert.equal(all.length, 1);
  assert.equal(all[0].deviceId, 'dev-1');
  assert.equal(all[0].failedAttempts, 0);
  assert.equal(all[0].lastError, null);
  assert.equal(typeof all[0].createdAt, 'number');
});

test('saveSub — ohne deviceId wirft', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await assert.rejects(
    () => subs.saveSub({ endpoint: 'x', keys: {} }),
    /deviceId/,
  );
});

test('loadSubs — Alt-Einträge ohne deviceId werden beim Load gepruned', async () => {
  await writeStore({
    subscriptions: [
      { endpoint: 'https://old.test/e1', keys: { p256dh: 'p', auth: 'a' } },
      { endpoint: 'https://new.test/e2', keys: { p256dh: 'p', auth: 'a' }, deviceId: 'dev-1', createdAt: 1, failedAttempts: 0, lastError: null },
    ],
  });
  await subs.loadSubs();
  const all = subs.allSubs();
  assert.equal(all.length, 1);
  assert.equal(all[0].endpoint, 'https://new.test/e2');
});

test('incrementFailure — erhöht Zähler und setzt lastError', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  const s = subs.allSubs()[0];
  assert.equal(s.failedAttempts, 2);
  assert.equal(s.lastError.statusCode, 403);
  assert.equal(s.lastError.reason, 'BadJwtToken');
});

test('resetFailure — setzt Zähler auf 0 und lastError auf null', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  await subs.resetFailure('https://example.test/e1');
  const s = subs.allSubs()[0];
  assert.equal(s.failedAttempts, 0);
  assert.equal(s.lastError, null);
});

test('isBroken — true ab 5 failedAttempts', async () => {
  await writeStore({ subscriptions: [] });
  await subs.loadSubs();
  await subs.saveSub({
    endpoint: 'https://example.test/e1',
    keys: { p256dh: 'p', auth: 'a' },
    deviceId: 'dev-1',
  });
  for (let i = 0; i < 5; i++) {
    await subs.incrementFailure('https://example.test/e1', { statusCode: 403, reason: 'BadJwtToken' });
  }
  assert.equal(subs.isBroken(subs.allSubs()[0]), true);
});
```

- [ ] **Step 2: Tests ausführen — rot erwartet**

```bash
cd ~/Projects/claude-code-hub && node --test lib/push-subscriptions.test.js
```

Expected: FAIL (neue Funktionen fehlen, deviceId wird noch nicht geprüft).

- [ ] **Step 3: `lib/push-subscriptions.js` umschreiben**

Replace full file content:

```js
// Persistente Speicherung von Web-Push-Subscriptions.
//
// Schema pro Subscription:
//   {
//     endpoint, expirationTime, keys: { p256dh, auth },  // vom Browser
//     deviceId,                                           // Client-generierte UUID
//     createdAt,                                          // ms since epoch
//     failedAttempts,                                     // konsekutive Delivery-Errors
//     lastError: { at, statusCode, reason } | null,
//   }
//
// Gespeichert in ~/.claude-code-hub/push-subscriptions.json
// Atomare Writes via tmp-Datei + rename.
//
// Migration: Alt-Einträge ohne `deviceId` werden beim loadSubs() weggeprunt.
// Der Client re-registriert sich idempotent beim nächsten initPush().

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BROKEN_THRESHOLD = 5;

function storePath() {
  return join(homedir(), '.claude-code-hub', 'push-subscriptions.json');
}
function storeDir() {
  return join(homedir(), '.claude-code-hub');
}

let subs = [];  // Array<Subscription>

async function save() {
  const path = storePath();
  const tmp = `${path}.tmp-${Date.now()}`;
  const data = JSON.stringify({ subscriptions: subs }, null, 2);
  await fs.mkdir(storeDir(), { recursive: true });
  await fs.writeFile(tmp, data, 'utf-8');
  await fs.rename(tmp, path);
}

export async function loadSubs() {
  try {
    const raw = await fs.readFile(storePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.subscriptions)) {
      const before = parsed.subscriptions.length;
      subs = parsed.subscriptions.filter((s) => s && s.endpoint && s.deviceId);
      const pruned = before - subs.length;
      if (pruned > 0) {
        console.log(`[push-subs] ${pruned} alte Subscription(s) ohne deviceId gepruned`);
        await save();
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[push-subs] load failed, starting fresh:', err.message);
    }
    subs = [];
  }
}

// Subscription hinzufügen (oder vorhandene per endpoint ersetzen).
// deviceId ist Pflicht.
export async function saveSub(sub) {
  if (!sub || !sub.endpoint) throw new Error('Invalid subscription: missing endpoint');
  if (!sub.deviceId) throw new Error('Invalid subscription: missing deviceId');

  const record = {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: sub.keys,
    deviceId: sub.deviceId,
    createdAt: Date.now(),
    failedAttempts: 0,
    lastError: null,
  };

  const idx = subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (idx >= 0) {
    // Beim Re-Subscribe: createdAt/failedAttempts behalten, Rest überschreiben.
    record.createdAt = subs[idx].createdAt;
    record.failedAttempts = subs[idx].failedAttempts;
    record.lastError = subs[idx].lastError;
    subs[idx] = record;
  } else {
    subs.push(record);
  }
  await save();
}

export async function removeSub(endpoint) {
  const before = subs.length;
  subs = subs.filter((s) => s.endpoint !== endpoint);
  if (subs.length !== before) {
    await save();
    return true;
  }
  return false;
}

export async function incrementFailure(endpoint, { statusCode, reason } = {}) {
  const s = subs.find((x) => x.endpoint === endpoint);
  if (!s) return;
  s.failedAttempts = (s.failedAttempts || 0) + 1;
  s.lastError = { at: Date.now(), statusCode: statusCode ?? null, reason: reason ?? null };
  await save();
}

export async function resetFailure(endpoint) {
  const s = subs.find((x) => x.endpoint === endpoint);
  if (!s) return;
  if (s.failedAttempts === 0 && s.lastError === null) return;
  s.failedAttempts = 0;
  s.lastError = null;
  await save();
}

export function isBroken(sub) {
  return !!sub && (sub.failedAttempts || 0) >= BROKEN_THRESHOLD;
}

// Snapshot aller aktuellen Subscriptions (für Broadcast).
export function allSubs() {
  return [...subs];
}
```

- [ ] **Step 4: Tests ausführen — grün erwartet**

```bash
cd ~/Projects/claude-code-hub && node --test lib/push-subscriptions.test.js
```

Expected: PASS (alle 6 Tests).

- [ ] **Step 5: Server.js anpassen: `/api/push/subscribe` nimmt `deviceId` entgegen**

Modify `server.js:835-846`. Ersetzen:

```js
// Subscription speichern. Body: { subscription: PushSubscriptionJSON, deviceId: string }
app.post('/api/push/subscribe', async (req, res) => {
  const sub = req.body?.subscription;
  const deviceId = req.body?.deviceId;
  if (!sub || !sub.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 128) {
    return res.status(400).json({ error: 'Missing or invalid deviceId' });
  }
  try {
    await pushSubs.saveSub({ ...sub, deviceId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Server starten und manuell prüfen dass 400 ohne deviceId kommt**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && node server.js &
SERVER_PID=$!
sleep 2
AUTH=$(grep '^AUTH_TOKEN=' .env | cut -d= -f2)
curl -s -X POST http://localhost:3333/api/push/subscribe \
  -H "Authorization: Bearer $AUTH" \
  -H "Content-Type: application/json" \
  -d '{"subscription":{"endpoint":"https://test","keys":{"p256dh":"p","auth":"a"}}}'
echo
kill $SERVER_PID 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: `{"error":"Missing or invalid deviceId"}`.

- [ ] **Step 7: Commit**

```bash
git add lib/push-subscriptions.js lib/push-subscriptions.test.js server.js
git commit -m "push: Subscription-Schema um deviceId + Failure-Tracking erweitern"
```

---

### Task 3: Clock-Skew-Check in `lib/vapid.js`

**Files:**
- Modify: `lib/vapid.js`

**Hintergrund:** VAPID-JWT `exp`-Claim wird von Apples Push-Service streng geprüft. Wenn System-Clock > ~30s off ist, kippt die Signatur. Beim Server-Start einmal gegen `https://web.push.apple.com/` ein HEAD-Request machen, `Date`-Header parsen, Delta loggen.

- [ ] **Step 1: `lib/vapid.js` erweitern**

Am Ende der Datei (nach `webpush.setVapidDetails(...)`, vor `return`) einfügen:

```js
  // Clock-Skew-Check gegen Apple's Push-Service. Fail-open: kein Netz → nur debuggen.
  try {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 3000);
    const resp = await fetch('https://web.push.apple.com/', { method: 'HEAD', signal: ctl.signal });
    clearTimeout(timeout);
    const dateHdr = resp.headers.get('date');
    if (dateHdr) {
      const serverMs = Date.parse(dateHdr);
      const localMs  = Date.now();
      const deltaS   = Math.round((localMs - serverMs) / 1000);
      if (Math.abs(deltaS) > 30) {
        console.warn(`[vapid] ⚠ Clock-Skew ${deltaS}s (local vs apple). VAPID-JWTs können als BadJwtToken abgelehnt werden. NTP prüfen!`);
      } else {
        console.log(`[vapid] Clock-Skew OK (${deltaS}s vs apple).`);
      }
    }
  } catch (err) {
    console.log(`[vapid] Clock-Skew-Check übersprungen: ${err.message}`);
  }
```

- [ ] **Step 2: Server starten und Log-Ausgabe prüfen**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && timeout 5 node server.js 2>&1 | grep vapid
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: Line `[vapid] Clock-Skew OK (Xs vs apple).` oder die Warn-Variante. Kein Crash.

- [ ] **Step 3: Commit**

```bash
git add lib/vapid.js
git commit -m "push: Clock-Skew-Check gegen Apple Push-Service beim Start"
```

---

### Task 4: Enhanced Error-Logging + 403 BadJwtToken Handling in `sendPushToAll`

**Files:**
- Modify: `server.js` (`sendPushToAll`, ca. Zeile 775–800)

**Regeln:**
- 410/404: Sub gone → entfernen (wie bisher).
- 401: VAPID-Auth hartes Fail → entfernen (wie bisher).
- 403: **nicht** entfernen — `incrementFailure()`. Ab 5 konsekutiven 403ern gilt Sub als broken (wird in Task 9 gefiltert).
- Success: `resetFailure()` + einen INFO-Log.
- Alle Fehler loggen mit: `host`, `statusCode`, `reason` (aus `err.body`), `subAgeHours`, `deviceId`.

- [ ] **Step 1: `sendPushToAll` ersetzen**

Replace `server.js:775-801`:

```js
async function sendPushToAll(event) {
  const subs = pushSubs.allSubs();
  if (!subs.length) return;
  const displayName = (event.name || '').replace(/^cc-/, '');
  const activityLabels = { idle: 'Bereit', waiting: 'Braucht Input', working: 'Arbeitet' };
  const actLabel = activityLabels[event.activity] || 'Aktiv';
  const payload = JSON.stringify({
    title: `${displayName} — ${actLabel}`,
    body:  `Session "${displayName}" hat Output und wartet auf dich.`,
    name:  event.name,
    activity: event.activity,
  });
  const opts = { TTL: 60, urgency: 'normal' };
  const now = Date.now();

  await Promise.allSettled(subs.map(async (sub) => {
    const host = (() => {
      try { return new URL(sub.endpoint).host; } catch { return 'unknown'; }
    })();
    const ageH = sub.createdAt ? ((now - sub.createdAt) / 3_600_000).toFixed(1) : '?';
    const tag = `${host} dev=${sub.deviceId} age=${ageH}h`;

    try {
      await webpush.sendNotification(sub, payload, opts);
      console.log(`[push] delivered: ${tag} session=${event.name}`);
      await pushSubs.resetFailure(sub.endpoint).catch(() => {});
    } catch (err) {
      const status = err.statusCode ?? 0;
      let reason = null;
      try {
        const body = typeof err.body === 'string' ? err.body : '';
        const m = body.match(/"reason"\s*:\s*"([^"]+)"/);
        if (m) reason = m[1];
      } catch {}

      if (status === 410 || status === 404) {
        await pushSubs.removeSub(sub.endpoint).catch(() => {});
        console.log(`[push] gone, removed: ${tag} status=${status}`);
        return;
      }
      if (status === 401) {
        await pushSubs.removeSub(sub.endpoint).catch(() => {});
        console.log(`[push] unauthorized, removed: ${tag} status=401`);
        return;
      }
      if (status === 403) {
        await pushSubs.incrementFailure(sub.endpoint, { statusCode: 403, reason }).catch(() => {});
        console.warn(`[push] 403 ${reason || 'Forbidden'} (not removing): ${tag}`);
        return;
      }
      await pushSubs.incrementFailure(sub.endpoint, { statusCode: status, reason }).catch(() => {});
      console.warn(`[push] send failed: ${tag} status=${status} reason=${reason || '-'} msg=${err.message}`);
    }
  }));
}
```

- [ ] **Step 2: Smoke-Test — Server starten, kein Crash**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && timeout 4 node server.js 2>&1 | tail -20
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: Startup-Banner ohne JS-Errors.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "push: erweiterte Delivery-Diagnostik + 403-BadJwtToken-Handling"
```

---

### Task 5: Debug-Endpoint `POST /api/push/test`

**Files:**
- Modify: `server.js` (neuer Endpoint, direkt nach DELETE `/api/push/subscribe`)

**Zweck:** Health-Check. Vom Frontend oder per curl getriggert, sendet an alle registrierten Subscriptions eine Dummy-Notification. Ohne auf Claude-Hooks zu warten.

- [ ] **Step 1: Endpoint einfügen**

Modify `server.js`. Nach der Route `app.delete('/api/push/subscribe', ...)` (ca. Zeile 854), einfügen:

```js
// Smoke-Test: an alle registrierten Subscriptions eine Dummy-Notification senden.
// Primäre Nutzung: UI-Button "Push-Test" + Debugging nach VAPID/Library-Changes.
app.post('/api/push/test', async (_req, res) => {
  const subs = pushSubs.allSubs();
  if (!subs.length) {
    return res.json({ ok: true, sent: 0, note: 'no subscriptions' });
  }
  await sendPushToAll({
    type: 'session-attention',
    name: 'cc-test',
    activity: 'waiting',
    at: Date.now(),
  });
  res.json({ ok: true, sent: subs.length });
});
```

- [ ] **Step 2: Endpoint testen (ohne Subs → `sent: 0`)**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && node server.js &
SERVER_PID=$!
sleep 2
AUTH=$(grep '^AUTH_TOKEN=' .env | cut -d= -f2)
curl -s -X POST http://localhost:3333/api/push/test -H "Authorization: Bearer $AUTH"
echo
kill $SERVER_PID 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: `{"ok":true,"sent":0,"note":"no subscriptions"}`.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "push: Smoke-Test-Endpoint POST /api/push/test"
```

---

## Track A — Per-Device-Presence-Modell

### Task 6: Frontend — persistente Device-ID, Subscribe-Flow mit deviceId

**Files:**
- Modify: `public/index.html` (Push-Init-Sektion ab `~3720`, `initPush`/`enablePush`)

**Verhalten:** Beim ersten Laden liest/generiert der Client eine UUID aus `localStorage['cchub_device_id']`. Jeder Subscribe-POST schickt `{subscription, deviceId}`.

- [ ] **Step 1: Device-ID-Helper einfügen**

In `public/index.html`, vor `async function initPush()` (ca. Zeile 3724), einfügen:

```js
    // Persistente Device-ID pro Browser-Installation. Wird beim ersten Laden
    // generiert, dann unverändert in localStorage gehalten. Server nutzt sie,
    // um Push-Subscriptions einer Browser-Instanz zuzuordnen und Presence zu filtern.
    const DEVICE_ID_KEY = 'cchub_device_id';
    function getDeviceId() {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = (crypto?.randomUUID?.() ?? `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`);
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    }
```

- [ ] **Step 2: `initPush` anpassen — idempotenter Re-Register schickt deviceId**

In `public/index.html`, ersetzen im Block ab `if (existingSub) {` (ca. Zeile 3745):

```js
      if (existingSub) {
        // Subscription vorhanden → idempotent beim Server registrieren (Sync nach Server-Neustart).
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: existingSub.toJSON(), deviceId: getDeviceId() }),
        }).catch(() => {});
        localStorage.setItem(PUSH_KEY, '1');
      } else if (pushEnabled()) {
        // Keine Browser-Subscription, aber localStorage sagt 'on' → VAPID rotiert / Cache gelöscht.
        localStorage.setItem(PUSH_KEY, '0');
      }
```

- [ ] **Step 3: `enablePush` anpassen — erste Registrierung schickt deviceId**

In `public/index.html`, im `enablePush()`-Block ersetzen (ca. Zeile 3782):

```js
      try {
        const r = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), deviceId: getDeviceId() }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        localStorage.setItem(PUSH_KEY, '1');
        updatePushToggleUi(true);
        showToast('Push-Benachrichtigungen aktiviert', 'info');
      } catch (e) {
        await sub.unsubscribe().catch(() => {});
        showToast('Subscription konnte nicht gespeichert werden: ' + e.message, 'error');
      }
```

- [ ] **Step 4: Manuell testen (Browser): Device-ID wird gesetzt**

Browser (Hub-Seite) → DevTools Console:
```js
localStorage.getItem('cchub_device_id')
```

Expected: UUID-String (nachdem die Seite einmal geladen wurde mit der neuen Version).

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "push: Client-seitige Device-ID, Subscribe-Flow schickt deviceId mit"
```

---

### Task 7: Server — Presence-Map + WS-Message-Handler

**Files:**
- Modify: `server.js` (Notifications-WS ca. Zeile 821–830, neue `presence`-Map)

**Modell:**
- `presence: Map<deviceId, {session: string|null, visible: bool, lastSeenAt: number}>`
- Client schickt JSON-Frames: `{type:'presence', deviceId, session, visible}`.
- WS-Close → Eintrag entfernen.
- Server exportiert `isDeviceFocused(deviceId, sessionName)` für `sendPushToAll` (Task 9).

- [ ] **Step 1: Presence-Map + Helper oberhalb der WS-Route einfügen**

Modify `server.js`. Unmittelbar vor `const notificationClients = new Set();` (ca. Zeile 807), einfügen:

```js
// Per-Device-Presence. Key: deviceId (aus localStorage des Clients).
// Wert: { session: aktuell sichtbare Session oder null, visible, lastSeenAt }.
// Wird über den Notifications-WebSocket gepflegt (Client sendet JSON-Frames).
const PRESENCE_STALE_MS = 60_000;  // iOS PWA im Hintergrund throttled aggressive — großzügig.
const presence = new Map();

function updatePresence(deviceId, { session, visible }) {
  if (!deviceId) return;
  presence.set(deviceId, {
    session: session ?? null,
    visible: !!visible,
    lastSeenAt: Date.now(),
  });
}

function dropPresence(deviceId) {
  if (deviceId) presence.delete(deviceId);
}

// true wenn dieses Gerät gerade EXAKT diese Session im Vordergrund hat
// und die Presence-Info frisch ist. False sonst (inkl. stale/unbekannt).
function isDeviceFocused(deviceId, sessionName) {
  if (!deviceId || !sessionName) return false;
  const p = presence.get(deviceId);
  if (!p) return false;
  if (Date.now() - p.lastSeenAt > PRESENCE_STALE_MS) return false;
  return p.visible && p.session === sessionName;
}
```

- [ ] **Step 2: WS-Route auf Presence-Messages reagieren lassen**

Modify `server.js:821-830`. Ersetzen:

```js
app.ws('/api/notifications/events', (ws, req) => {
  if (AUTH_TOKEN && extractToken(req) !== AUTH_TOKEN) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  notificationClients.add(ws);
  let wsDeviceId = null;
  try { ws.send(JSON.stringify({ type: 'hello' })); } catch {}

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || msg.type !== 'presence') return;
    if (typeof msg.deviceId !== 'string' || msg.deviceId.length === 0 || msg.deviceId.length > 128) return;
    wsDeviceId = msg.deviceId;
    const session = typeof msg.session === 'string' ? msg.session : null;
    updatePresence(msg.deviceId, { session, visible: !!msg.visible });
  });

  ws.on('close', () => {
    notificationClients.delete(ws);
    dropPresence(wsDeviceId);
  });
  ws.on('error', () => {
    notificationClients.delete(ws);
    dropPresence(wsDeviceId);
  });
});
```

- [ ] **Step 3: Debug-Endpoint für Presence (nur stdout-Log) hinzufügen**

Unmittelbar nach der WS-Route einfügen:

```js
// Debug: Snapshot der aktuellen Presence-Map loggen. Auth-geschützt.
app.get('/api/push/presence', (_req, res) => {
  const out = [];
  for (const [deviceId, p] of presence.entries()) {
    out.push({ deviceId, ...p, ageMs: Date.now() - p.lastSeenAt });
  }
  res.json({ presence: out });
});
```

- [ ] **Step 4: Smoke-Test — Server starten, `/api/push/presence` → leer**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && node server.js &
SERVER_PID=$!
sleep 2
AUTH=$(grep '^AUTH_TOKEN=' .env | cut -d= -f2)
curl -s http://localhost:3333/api/push/presence -H "Authorization: Bearer $AUTH"
echo
kill $SERVER_PID 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: `{"presence":[]}`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "push: server-seitige Presence-Map über Notifications-WebSocket"
```

---

### Task 8: Frontend — Presence-Sender (visibility, navigation, heartbeat)

**Files:**
- Modify: `public/index.html` (Notifications-WS-Client-Code; Session-Navigation-Hooks)

**Was gesendet wird:**
- `{type:'presence', deviceId, session, visible}`
- `session` = Name der gerade sichtbaren Session (Terminal-View geöffnet), sonst `null`
- `visible` = `document.visibilityState === 'visible'`

**Trigger:**
- Sofort beim WS-`open`
- Bei `document.visibilitychange`
- Bei Terminal-View-Öffnen/Schließen
- Heartbeat alle 20 s als Safety-Net (iOS-Backgrounded-PWA throttles; Stale-Timeout ist 60s)

- [ ] **Step 1: Presence-Sender in den Notifications-WS-Client einbauen**

In `public/index.html`, suche den bestehenden Notifications-WS-Code. Mit Grep:

```bash
cd ~/Projects/claude-code-hub && grep -n "notifications/events" public/index.html
```

Expected: Eine oder mehr Zeilen im Frontend-Bereich.

- [ ] **Step 2: Code-Anker lesen**

Read `public/index.html` um die gefundene Zeile (±40 Zeilen) um den Block zu sehen. Identifiziere die Variable die den WS hält (vermutlich `notifyWs` o.ä.) und den State der aktuellen Terminal-Session (typisch `currentSession` oder `activeSessionName`).

- [ ] **Step 3: Helper + Hooks einfügen**

Direkt nach der WS-Öffnung (wo `onopen` gesetzt wird) Presence-Logik einbauen. Falls es eine Funktion `openNotifyWs()` gibt, sie so ergänzen (Platzhalter-Variable hier heißt `notifyWs`, **beim Implementieren den echten Namen verwenden**):

```js
    // ── Presence: Device-ID + sichtbare Session an Server melden ────────────
    // Getriggert bei WS-open, Visibility-Wechsel, Session-Navigation, Heartbeat.
    let presenceHeartbeatTimer = null;

    function currentFocusedSession() {
      // Wenn der User gerade im Terminal-View einer Session ist, deren Namen
      // liefern. Sonst null (Dashboard, Projekte, andere Views).
      // BEIM IMPLEMENTIEREN: an echten Router-State anpassen.
      return (typeof activeTerminalSession !== 'undefined' && activeTerminalSession) || null;
    }

    function sendPresence() {
      if (!notifyWs || notifyWs.readyState !== 1) return;
      try {
        notifyWs.send(JSON.stringify({
          type: 'presence',
          deviceId: getDeviceId(),
          session: currentFocusedSession(),
          visible: document.visibilityState === 'visible',
        }));
      } catch {}
    }

    function startPresenceHeartbeat() {
      stopPresenceHeartbeat();
      presenceHeartbeatTimer = setInterval(sendPresence, 20_000);
    }
    function stopPresenceHeartbeat() {
      if (presenceHeartbeatTimer) clearInterval(presenceHeartbeatTimer);
      presenceHeartbeatTimer = null;
    }

    document.addEventListener('visibilitychange', sendPresence);
    window.addEventListener('pagehide', () => {
      // Letzte Chance um "nicht sichtbar" zu melden. Best-effort.
      if (notifyWs && notifyWs.readyState === 1) {
        try {
          notifyWs.send(JSON.stringify({
            type: 'presence',
            deviceId: getDeviceId(),
            session: null,
            visible: false,
          }));
        } catch {}
      }
    });
```

Und im WS-`onopen`-Handler ergänzen:

```js
      sendPresence();
      startPresenceHeartbeat();
```

Im WS-`onclose`-Handler ergänzen:

```js
      stopPresenceHeartbeat();
```

- [ ] **Step 4: Presence bei Session-Navigation feuern**

Suche die Stelle, an der der User in den Terminal-View einer Session wechselt (Funktion wie `openTerminal(name)` oder `showSession(name)`) und die Stelle an der er ihn wieder verlässt. Nach dem State-Update (wo `activeTerminalSession` o.ä. gesetzt wird), `sendPresence()` aufrufen.

**Suche mit:**
```bash
cd ~/Projects/claude-code-hub && grep -n "openTerminal\|attachSession\|showSession\|activeSession" public/index.html | head -20
```

Nach jeder relevanten Zustandsänderung `sendPresence();` hinzufügen.

- [ ] **Step 5: Manueller E2E-Test mit `/api/push/presence`**

1. Server läuft (LaunchAgent aktiv).
2. Browser öffnet Hub auf `http://localhost:3333`.
3. Nach dem Login (Token eingeben) — der Notifications-WS sollte sich öffnen.
4. In einem zweiten Terminal:

```bash
AUTH=$(grep '^AUTH_TOKEN=' ~/Projects/claude-code-hub/.env | cut -d= -f2)
curl -s http://localhost:3333/api/push/presence -H "Authorization: Bearer $AUTH" | python3 -m json.tool
```

Expected: `presence`-Array mit einem Eintrag (deviceId, session: null, visible: true).

5. Eine Session im Hub öffnen (Terminal-View), dann Presence-Endpoint erneut abrufen.

Expected: `session`-Feld enthält den Session-Namen.

6. Browser-Tab in den Hintergrund bringen (anderes Fenster in den Vordergrund). Erneut abrufen.

Expected: `visible: false`.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "push: Client sendet Device-Presence (Visibility, Session, Heartbeat)"
```

---

### Task 9: `sendPushToAll` → `sendPushForAttention` mit Presence-Filter + Broken-Skip

**Files:**
- Modify: `server.js` (`sendPushToAll` umbenennen und Filter einbauen)

**Filter-Reihenfolge in der Loop (pro Sub):**
1. `pushSubs.isBroken(sub)` → skip, Log `[push] skipped (broken)`
2. `isDeviceFocused(sub.deviceId, event.name)` → skip, Log `[push] skipped (device focused)`
3. Sonst senden.

- [ ] **Step 1: Funktion umbenennen + Filter einbauen**

Modify `server.js`. In der Funktion aus Task 4, am Anfang der `Promise.allSettled(subs.map(async (sub) => {`-Callback, **vor** der Try-Block, einfügen:

```js
    if (pushSubs.isBroken(sub)) {
      console.log(`[push] skipped (broken): ${host} dev=${sub.deviceId}`);
      return;
    }
    if (isDeviceFocused(sub.deviceId, event.name)) {
      console.log(`[push] skipped (device focused on session): ${host} dev=${sub.deviceId} session=${event.name}`);
      return;
    }
```

Die `host`/`tag`-Variablen sollten davor berechnet werden — Reihenfolge innerhalb der map-Callback:

```js
  await Promise.allSettled(subs.map(async (sub) => {
    const host = (() => {
      try { return new URL(sub.endpoint).host; } catch { return 'unknown'; }
    })();
    const ageH = sub.createdAt ? ((now - sub.createdAt) / 3_600_000).toFixed(1) : '?';
    const tag = `${host} dev=${sub.deviceId} age=${ageH}h`;

    if (pushSubs.isBroken(sub)) {
      console.log(`[push] skipped (broken): ${tag}`);
      return;
    }
    if (isDeviceFocused(sub.deviceId, event.name)) {
      console.log(`[push] skipped (device focused): ${tag} session=${event.name}`);
      return;
    }

    try {
      // ... bestehender send-Code ...
```

- [ ] **Step 2: Funktion umbenennen**

Rename `async function sendPushToAll(event)` → `async function sendPushForAttention(event)`. Den Aufruf im `attention.subscribe`-Handler (aktuell `sendPushToAll(event)`) anpassen:

```js
  if (event.type === 'session-attention') {
    sendPushForAttention(event).catch((e) => console.error('[push] broadcast error:', e));
  }
```

Und in Task-5-Endpoint `/api/push/test` den Aufruf auf `sendPushForAttention` umziehen.

- [ ] **Step 3: Smoke-Test**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && timeout 4 node server.js 2>&1 | tail -15
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: Kein Runtime-Error. Startup-Banner wie gewohnt.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "push: Per-Device-Presence-Filter vor Delivery, broken-skip"
```

---

### Task 10: Alte `attached`-Logik aus `lib/attention.js` entfernen + Tests anpassen

**Files:**
- Modify: `lib/attention.js`
- Modify: `lib/attention.test.js`
- Modify: `server.js` (entferne `setAttached`-Aufruf in `/api/sessions`-Enrichment)

**Warum:** Die Suppression lebt jetzt in der Push-Delivery-Schicht. `attention.js` muss nicht mehr wissen ob irgendwer zuschaut. In-App-Notifications (Sound/Flash) werden vom Frontend selbst unterdrückt wenn die Session sichtbar ist.

- [ ] **Step 1: Tests anpassen — `attached`-Suppression-Test umdrehen**

Modify `lib/attention.test.js:53-62`. Ersetzen den Block:

```js
test('reportHookEvent — session-attention feuert auch wenn attached (Suppression lebt jetzt in Push-Schicht)', () => {
  reset();
  attention.reportHookEvent('cc-a', 'Stop', {}, 500); // Init state
  attention.setAttached('cc-a', true);  // no-op, bleibt als backwards-compat no-op
  const { events, activities } = collect();
  attention.reportHookEvent('cc-a', 'Notification', {}, 1000);
  assert.equal(events.length, 1, 'session-attention feuert trotz attached');
  assert.equal(events[0].activity, 'waiting');
  assert.equal(activities.length, 1);
});
```

- [ ] **Step 2: Test-Lauf — rot erwartet**

```bash
cd ~/Projects/claude-code-hub && node --test lib/attention.test.js
```

Expected: FAIL (alte Logik unterdrückt noch).

- [ ] **Step 3: `lib/attention.js` — `attached`-Branch entfernen**

Modify `lib/attention.js`. Zeile 101 (`if (prev.attached) return;`) löschen. Die Felder `attached` und `setAttached()` bleiben als no-op erhalten (Backwards-Compat, falls andere Caller noch existieren — aber sie haben keinen Effekt mehr).

Konkret ersetzen im Block `reportHookEvent` (ab ca. Zeile 99):

```js
  // Notification-Pfad: nur Stop/Notification sind Alarm-würdig.
  // Suppression nach "User schaut zu" lebt jetzt in der Push-Delivery-Schicht
  // (per Device-Presence). Hier feuern wir unabhängig davon.
  if (event === 'UserPromptSubmit') return;
  if (muteChecker(name)) return;
  if (now - prev.lastNotifiedAt < HOOK_COOLDOWN_MS) return;

  prev.lastNotifiedAt = now;
  broadcast({ type: 'session-attention', name, activity, at: now });
```

(`if (prev.attached) return;` ist raus.)

Und im Modul-Header-Kommentar die Zeile über `session-attention` — „feuert nur bei Stop oder Notification, unattached, nicht muted, außerhalb Cool-Down" — anpassen zu „feuert bei Stop/Notification, nicht muted, außerhalb Cool-Down. Device-Presence-Filter passiert in der Push-Schicht."

- [ ] **Step 4: Test-Lauf — grün erwartet**

```bash
cd ~/Projects/claude-code-hub && node --test lib/attention.test.js
```

Expected: PASS (alle Tests).

- [ ] **Step 5: `setAttached`-Call in server.js entfernen**

Modify `server.js:345`. Zeile:

```js
    if (s.status !== 'dormant') attention.setAttached(s.name, !!s.attached);
```

löschen. Die Zeile direkt davor (Kommentar über die Rückmeldung) auch entfernen bzw. ersetzen durch:

```js
    // attached-Flag bleibt in s.attached (UI-Anzeige), wird aber nicht mehr
    // zur Attention-Suppression verwendet — siehe Device-Presence in der Push-Schicht.
```

- [ ] **Step 6: Server-Smoke-Test**

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist 2>/dev/null
cd ~/Projects/claude-code-hub && timeout 4 node server.js 2>&1 | tail -15
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist
```

Expected: Startet sauber.

- [ ] **Step 7: Commit**

```bash
git add lib/attention.js lib/attention.test.js server.js
git commit -m "attention: attached-Suppression entfernen, Device-Presence übernimmt"
```

---

### Task 11: Frontend — In-App-Notification-Suppression bei sichtbarer Session

**Files:**
- Modify: `public/index.html` (Handler für `session-attention` im Notifications-WS)

**Zweck:** Weil der Server jetzt auch `session-attention` feuert wenn der User gerade die Session anschaut, muss das Frontend selbst entscheiden ob Sound/Flash/Unread getriggert wird. Regel: Sound/Flash nur wenn **nicht** (session im Vordergrund UND Tab visible).

- [ ] **Step 1: Bestehenden Handler finden**

```bash
cd ~/Projects/claude-code-hub && grep -n "session-attention" public/index.html
```

Expected: Eine oder mehr Zeilen im Notifications-WS-Handler.

- [ ] **Step 2: Suppression-Guard einbauen**

Am Anfang des `session-attention`-Handler-Blocks (vor Sound/Flash/Unread/Toast-Logik) einfügen:

```js
          // Suppression: Wenn der User gerade GENAU diese Session im Vordergrund
          // hat und der Tab sichtbar ist, ist die In-App-Notification sinnlos —
          // er sieht den Output ja schon live. Badge/activity bleiben synchron
          // weil session-activity einen separaten Event-Pfad hat.
          if (document.visibilityState === 'visible' && currentFocusedSession() === msg.name) {
            return;
          }
```

- [ ] **Step 3: Manuell testen**

1. Hub öffnen, Push aktivieren, Terminal einer Session öffnen.
2. In einem anderen Terminal Claude in dieser Session beenden / eine Nachricht schicken die einen `Stop`-Hook feuert.
3. Erwartung: **Kein** Sound, **kein** Flash im Browser, weil Session im Vordergrund.
4. Jetzt zu Dashboard wechseln. Noch mal einen Hook auslösen.
5. Erwartung: Sound + Flash + Toast + (bei unattached Device) Push auf anderes Gerät.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "push: In-App-Notification unterdrücken wenn Session im Vordergrund"
```

---

### Task 12: End-to-End-Verifikation gegen die Akzeptanz-Tests

**Files:** keine Code-Änderungen — reine Durchführung und Protokoll.

**Voraussetzung:**
- Phone mit Hub-PWA auf Home-Screen, Notifications erlaubt.
- Desktop-Browser mit Hub geöffnet, Token eingegeben.
- Mindestens zwei aktive Claude-Sessions (`cc-sessionA`, `cc-sessionB`).

Die sechs Akzeptanz-Tests aus dem Spec durchgehen. Jeden Schritt nach Durchführung abhaken. Wenn einer fehlschlägt, Root-Cause ins Log und ggf. Follow-Up-Task öffnen.

- [ ] **Step 1: Push-Test-Endpoint schmecken**

Desktop: in der DevTools Console:
```js
fetch('/api/push/test', {method:'POST', headers: apiHeaders()}).then(r=>r.json()).then(console.log)
```
Expected: `{ok:true, sent: N}` mit N ≥ 1, und Notification erscheint auf allen subscribed Geräten.

- [ ] **Step 2: Akzeptanz-Test 1 — PWA im Vordergrund, gleiche Session → kein Push**

iPhone: PWA auf, Session A im Terminal-View. Session A triggern (irgendeine Claude-Action die `Stop` feuert).

Expected: Auf iPhone kein Banner (Notification). In-App: kein Sound/Flash. Badge/Activity dennoch aktualisiert.

- [ ] **Step 3: Akzeptanz-Test 2 — PWA im Vordergrund, andere Session → Push**

iPhone: Session A im Vordergrund, Session B triggern.

Expected: Push-Banner auf iPhone für Session B.

- [ ] **Step 4: Akzeptanz-Test 3 — PWA im Hintergrund → Push**

iPhone: Home-Screen (PWA-Tab im Hintergrund), Session A triggern.

Expected: Push-Banner.

- [ ] **Step 5: Akzeptanz-Test 4 — Desktop in Session A, iPhone geschlossen**

Desktop: Hub offen, Terminal-View von Session A attached. iPhone PWA geschlossen/aus dem Task-Switcher. Session A triggern.

Expected: Push auf iPhone. Desktop: In-App-Notification suppressed für Session A (gleiche Session, visible).

- [ ] **Step 6: Akzeptanz-Test 5 — Desktop in Session A, iPhone geschlossen, Session B feuert**

Desktop: Hub offen, Session A im Vordergrund. Session B triggern.

Expected: Push aufs iPhone. Desktop: In-App-Notification für Session B (Sound/Flash/Toast).

- [ ] **Step 7: Akzeptanz-Test 6 — Niemand schaut hin**

Desktop: Hub-Tab schließen. iPhone: PWA im Task-Switcher killen. Session A triggern.

Expected: Push aufs iPhone (PWA wird aus dem Hintergrund aufgeweckt).

- [ ] **Step 8: Log-Review**

```bash
tail -60 ~/Projects/claude-code-hub/logs/stdout.log | grep '\[push\]'
```

Expected: Keine `[push] send failed`, keine `403 BadJwtToken`. Mindestens einige `delivered` und, in den richtigen Tests, `skipped (device focused)`.

- [ ] **Step 9: Falls alles grün — ROADMAP.md aktualisieren**

`ROADMAP.md` öffnen, unter dem aktuellen Entwicklungs-Release die abgeschlossene Arbeit als Checkbox abhaken; im Changelog kurz vermerken.

```bash
git add ROADMAP.md
git commit -m "roadmap: Push-Zuverlässigkeits-Fix abgehakt"
```

- [ ] **Step 10: Falls einer der Tests fehlschlägt**

Nicht "quick-fixen". Stattdessen: Log-Snippet + Schritt-Nummer in ein neues Issue-Dokument `docs/superpowers/specs/YYYY-MM-DD-push-followup.md` packen und in einer neuen Brainstorming-Runde angehen. Der Plan ist erst komplett, wenn alle sechs Tests sauber sind.

---

## Self-Review Checklist

**Spec-Coverage:**

| Spec-Anforderung | Task |
|---|---|
| Detection-Coupling (`attached` raus) | 10 |
| Per-Device-Presence-Modell | 7, 8 |
| VAPID 403 BadJwtToken handling | 4 |
| `web-push` Upgrade | 1 |
| Clock-Skew-Diagnose | 3 |
| Subscription-Schema erweitern | 2 |
| Debug-Endpoint `/api/push/test` | 5 |
| In-App-Suppression bei Visibility | 11 |
| Alte Subs prunen (Migration) | 2 |
| 6 Akzeptanz-Tests | 12 |

**Open Points aus Spec → resolved:**
- JWT-`exp`-API von `web-push`: übersprungen — Default (12h) reicht, Clock-Skew-Check macht den echten Unterschied.
- Clock-Skew-Quelle: `https://web.push.apple.com/` HEAD (Task 3).
- Migration Alt-Subs: Prune beim Load (Task 2, Step 3).
- Presence-Stale-Timeout: 60s (Task 7, Step 1).
- Cool-Down: bleibt unverändert.
