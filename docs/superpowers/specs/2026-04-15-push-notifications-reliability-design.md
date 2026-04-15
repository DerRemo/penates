# Push Notifications — Zuverlässigkeits-Fix

**Datum:** 2026-04-15
**Scope:** Web Push Delivery (VAPID/APNs) + Attention-Detection-Model.
Betrifft iOS-PWA als Primärziel, macht Desktop aber gleich mit.

## Problem

Push-Notifications kommen unzuverlässig an. Symptom-Schilderung: „Session wartet auf Input, aber kein Push auf dem iPhone." PWA ist installiert, Permission erteilt.

Log- und Code-Analyse zeigt **drei unabhängige Baustellen**, die zusammen „unzuverlässig" ergeben:

### Baustelle 1 — Detection-Coupling: `attached` ist zu grob

`lib/attention.js:101` unterdrückt `session-attention`-Broadcast wenn `prev.attached` true ist. `attached` kommt aus tmux `#{session_attached}` (`server.js:345`), also „irgendein tmux-Client ist connected" — nicht „ich als User schaue gerade diese Session an auf diesem Gerät".

Konkreter Failure-Case:
- User hat am Desktop den Hub-Tab offen und Session A im Terminal-View attached.
- Session B feuert `Stop`.
- Attention-Engine sieht: *irgendwer* schaut → **kein Broadcast** → **kein Push aufs iPhone**.

Zusätzlich: `setAttached()` wird nur aus `GET /api/sessions`-Response heraus gesetzt (`server.js:345`). Der Wert kann stale sein, bis das nächste Polling-Intervall kommt — was die Unzuverlässigkeit erratisch macht.

### Baustelle 2 — VAPID `403 BadJwtToken` auf APNs

`logs/stderr.log` (zuletzt 14.4. 19:05) zeigt Serien von:

```
[push] sendNotification failed: 403 Received unexpected response code {"reason":"BadJwtToken"}
```

`VAPID_SUBJECT=https://code.derremo.xyz` ist gesetzt und gültig. Typische Ursachen bei korrektem Subject:

- **System-Clock-Skew** auf dem Mac mini. Apples Push-Service akzeptiert JWT-`exp`-Claims nur innerhalb eines Fensters; wenn der Mac nach längerem Sleep noch nicht re-synced ist, kippt die Signatur.
- **Rotierte VAPID-Keys vs. Bestands-Subscription.** Wenn die Keys zwischendurch regeneriert wurden, ist die alte Subscription aus Apples Sicht ungültig-signiert.
- **Alter `web-push`-Library-Stand** mit bekannten APNs-Bugs um JWT-Format.

Track A alleine bringt nichts, solange der Transport intermittierend kippt.

### Baustelle 3 — `push-subscriptions.json` ist aktuell leer

`~/.claude-code-hub/push-subscriptions.json` hat `{"subscriptions": []}`. Heißt: bis die PWA das nächste Mal geöffnet wird und `initPush()` re-registriert, geht überhaupt kein Push raus. Self-healing ist schon drin — aber es deutet darauf, dass die Subs-Liste irgendwann gewischt wurde (manueller DELETE, 401/404/410 von Apple) ohne sichtbares Feedback im UI.

## Ziele

1. Push landet zuverlässig auf dem iPhone wenn **kein Gerät** aktiv die Session anschaut.
2. Push landet zuverlässig auf dem iPhone wenn **Desktop in einer anderen Session** unterwegs ist.
3. Kein Push wenn **dasselbe Gerät gerade diese Session im Vordergrund** hat.
4. VAPID-Delivery-Fehler sind im Log so diagnostizierbar, dass Clock-Skew von Key-Mismatch unterschieden werden kann.
5. Wenn Subscription wegen `BadJwtToken` scheitert, wird das Problem nicht stumm geschluckt — der User sieht im UI, dass Push kaputt ist.

## Nicht-Ziele

- Push-Routing nach Gerätetyp („nur iPhone, nie Desktop"). Keine Priorität; erste Version pusht an alle nicht-fokussierten Subscriptions.
- Push-Inhalte anreichern (Icons, Thread-ID, Actions). Bleibt wie heute — Titel + Body.
- Historie/Queue für verpasste Pushes. Out-of-scope.
- Mobile-Web-Push außerhalb PWA. Unterstützt iOS nicht, punkt.

## Lösung — zwei unabhängige Tracks

**Reihenfolge: Track B zuerst, dann Track A.** Grund: A auf kaputter Transport-Schicht zu bauen führt zu falschen Schlüssen beim Testen.

---

### Track B — VAPID/APNs stabilisieren + Diagnose

**Ziel:** Transport so bauen, dass wir beim nächsten Fehler in Sekunden sehen *warum*, nicht *dass*.

1. **`web-push` auf aktuelle Version upgraden** (`package.json`, `npm install`, `package-lock.json` commiten).

2. **Clock-Skew-Check beim Server-Start** — `lib/vapid.js` bekommt am Ende von `loadVapid()` einen HEAD-Request gegen `https://web.push.apple.com/` oder vergleichbar, parst `Date`-Header, vergleicht mit `Date.now()`, loggt Delta. Wenn `|Δ| > 30s`, deutliche Warnung in stderr. Fail-open: schlägt der Check fehl (kein Internet), nur debuggen, nicht abbrechen.

3. **Error-Logging in `sendPushToAll` erweitern** (`server.js:788-800`):
   - Endpoint-Hostname (`web.push.apple.com` vs `fcm.googleapis.com` vs `updates.push.services.mozilla.com`) — damit klar ist *welcher* Service meckert.
   - Subscription-Alter: Zeitstempel beim Subscribe speichern, beim Fehler Alter loggen.
   - `err.statusCode`, `err.body` (trunkiert), Klassifizierung: `clock-skew?`/`key-mismatch?`/`expired?`/`unknown`.
   - Erfolgsfall einmal pro Delivery einen INFO-Level-Log schreiben (`[push] delivered: <host> <session>`). Kostet fast nix, ist Gold beim Debuggen.

4. **403 `BadJwtToken` behandeln**: Die Subscription **nicht** removen (das Problem ist server-seitig — der Private-Key signiert falsch, der Endpoint ist weiter gültig). Stattdessen: Counter pro Endpoint hochzählen, ab 5 konsekutiven 403ern Subscription markieren als „broken" und im Frontend die Push-Toggle-UI auf rot setzen. Heißt: `push-subscriptions.json`-Schema bekommt `{endpoint, keys, createdAt, failedAttempts, lastError}`.

5. **VAPID-JWT `exp` explizit auf 12h setzen** in `lib/vapid.js` via `webpush.setVapidDetails(...)` — klappt nicht direkt, muss per `sendNotification(sub, payload, {TTL, urgency, ...})` parametrisiert werden. Prüfen welche Option die Lib anbietet; notfalls per `jwt.sign`-Wrapper selbst signieren. **Offener Punkt — im Plan verifizieren.**

6. **Debug-Endpoint `POST /api/push/test`**: Sendet an alle registrierten Subscriptions eine Dummy-Notification. Auth-geschützt. Damit kann der User (oder ein Health-Check) jederzeit verifizieren ob der Transport gerade läuft, ohne auf einen echten Claude-Hook zu warten.

**Akzeptanz-Test Track B:** Nach dem Fix muss `POST /api/push/test` vom iPhone-PWA-Subscribe zuverlässig ein Banner auslösen. Fehler im Log sind selbst-erklärend.

---

### Track A — Detection-Model auf Per-Device-Presence umbauen

**Ziel:** Push wird nur dann geskippt, wenn **exakt dieses Gerät** gerade **exakt diese Session** sichtbar im Vordergrund hat.

#### Datenmodell

Jede Hub-Client-Instanz bekommt eine persistente **Device-ID** in `localStorage` (`cchub_device_id`, UUIDv4, einmalig beim ersten Laden generiert).

`push-subscriptions.json` wird erweitert:

```json
{
  "subscriptions": [
    {
      "endpoint": "...",
      "keys": { "p256dh": "...", "auth": "..." },
      "deviceId": "uuid-...",
      "createdAt": 1744700000000,
      "failedAttempts": 0,
      "lastError": null
    }
  ]
}
```

`POST /api/push/subscribe` nimmt `{subscription, deviceId}` entgegen. `subscribe()`-Call im Frontend passt entsprechend an.

#### Presence-Channel

Der bestehende WS-Channel `/api/notifications/events` kriegt eine neue Client→Server-Message:

```json
{ "type": "presence", "deviceId": "uuid-...", "session": "cc-foo", "visible": true }
```

- `session: null` wenn der Client auf dem Dashboard oder einer anderen Hub-Seite ist.
- `visible: false` wenn `document.visibilityState !== 'visible'` (Tab im Background, App minimiert, Screen aus bei PWA).

Der Client sendet Presence:
- Beim WS-Connect sofort einmal.
- Bei jedem Session-Wechsel (Navigation in den Terminal-View oder raus).
- Bei `visibilitychange`.
- Optional: Heartbeat alle 20s (billig, hält Stale-Detection einfach).

Server hält `presence: Map<deviceId, {session, visible, lastSeenAt}>`. Bei WS-Close: Eintrag entfernen.

#### Neue Push-Filter-Logik

`sendPushToAll(event)` wird zu `sendPushForAttention(event)`:

```
for sub in subs:
  if sub.failedAttempts > 5 → skip (broken)
  if presence[sub.deviceId] exists:
    if presence.visible && presence.session === event.name:
      skip  // dieses Gerät schaut gerade zu → kein Push
    if presence.lastSeenAt < now - 30s:
      treat as offline → push anyway
  push → sub
```

Die **alte `attached`-Suppression in `lib/attention.js:101` fällt komplett weg.** `session-attention` wird **immer** gebroadcastet bei `Stop`/`Notification` (Cool-Down und Mute bleiben). Das Filtern passiert ausschließlich in der Push-Delivery-Schicht, nicht im Broadcast.

Konsequenz: WS-Clients bekommen `session-attention` auch wenn sie gerade die Session anschauen. Das Frontend wertet den Event weiter wie heute aus — der Sound/Flash wird **nicht** abgespielt wenn der User die Session gerade im Vordergrund hat (Frontend-seitiger Check via `document.visibilityState` + aktuelle Route). Das ist ohnehin schon nötig und vereinfacht die Gesamtlogik: **Server entscheidet nicht mehr für den Client, ob er schaut — der Client weiß es selbst.**

#### Was mit `setAttached` passiert

`setAttached()` und die gesamte `attached`-Path-Logik werden entfernt. Die Attention-Engine braucht `attached` nicht mehr zu kennen. `lib/attention.js` wird dadurch kleiner und ehrlicher. Bestehende Tests in `lib/attention.test.js` entsprechend anpassen (Test für `attached=true → no broadcast` fliegt raus; neuer Test: `session-attention` feuert immer bei Stop).

**Akzeptanz-Tests Track A:**

1. Hub-PWA auf iPhone offen, Session A im Vordergrund. Session A macht `Stop`. → **kein Push**, aber In-App-Notification (Sound/Flash/Unread).
2. Hub-PWA auf iPhone offen, Session A im Vordergrund. Session B macht `Stop`. → **Push** aufs iPhone.
3. Hub-PWA auf iPhone im Hintergrund (Home-Screen sichtbar). Session A macht `Stop`. → **Push**.
4. Hub-Tab auf Desktop offen, Session A attached. iPhone-PWA geschlossen. Session A macht `Stop`. → **Push aufs iPhone** (Desktop kriegt WS-Notification wie heute).
5. Hub-Tab auf Desktop offen, Session A attached. iPhone-PWA geschlossen. Session **B** macht `Stop`. → **Push aufs iPhone**, Desktop-WS-Notify.
6. Niemand hat den Hub irgendwo offen. Session macht `Stop`. → **Push an alle Subscriptions**.

## Architektur-Zusammenfassung

```
Claude CLI ──Hook──> POST /api/hooks/Stop
                               │
                               ▼
                       attention.reportHookEvent
                               │
                       broadcast session-attention
                        (IMMER bei Stop/Notif,
                         kein attached-Check mehr)
                               │
                   ┌───────────┴────────────┐
                   ▼                        ▼
          WS fan-out                 sendPushForAttention
          an alle Clients            (neu, filtert nach
          (Client entscheidet         presence[deviceId])
           visibility selbst)         │
                                      ▼
                              webpush.sendNotification
                              (+Fehler-Diagnostik,
                               Alter, Klassifizierung)
```

## Betroffene Dateien

- `lib/attention.js` — `attached`-Logik raus, `setAttached`/`setMuteChecker`-Rollen dokumentieren
- `lib/attention.test.js` — Tests anpassen
- `lib/push-subscriptions.js` — Schema erweitern (deviceId, createdAt, failedAttempts, lastError)
- `lib/vapid.js` — Clock-Skew-Check, optional JWT-exp explizit
- `server.js` —
  - `/api/push/subscribe` POST: `deviceId` akzeptieren
  - `sendPushToAll` → `sendPushForAttention` mit Presence-Filter
  - Presence-Map + WS-Message-Handling auf `/api/notifications/events`
  - `setAttached`-Call entfernen (`:345`)
  - `/api/push/test` neu
- `public/index.html` —
  - Device-ID-Generator (localStorage)
  - `initPush`/`enablePush`: `deviceId` mitschicken
  - WS-Presence-Sender (Visibility, Route, Heartbeat)
  - Frontend-seitiger Visibility-Check für In-App-Notify-Suppression (falls nicht schon vorhanden)
  - Push-Toggle-UI: „broken"-State visualisieren
- `public/sw.js` — unverändert, sofern Payload-Shape gleich bleibt
- `package.json` / `package-lock.json` — `web-push`-Bump

## Offene Punkte (für Plan-Phase zu klären)

1. **`web-push` JWT-`exp`-Parametrisierung**: Welche API die Lib anbietet. Falls keine: eigener JWT-Wrapper.
2. **Clock-Skew-Check-Quelle**: HEAD auf welchen Endpoint? Muss stabil + Date-Header-liefernd sein.
3. **Bestehende Subscriptions ohne `deviceId`**: Migration. Einfachste Lösung: beim nächsten `initPush()` wird ohnehin idempotent re-registriert — Alt-Sub-Einträge können beim Laden gefiltert/geprunt werden.
4. **Presence-Stale-Timeout**: 30s ist ein Raten. Ggf. 60s wenn iOS-Safari-PWA im Hintergrund aggressiv schläft und WS-Heartbeat dropped.
5. **Cool-Down (10s) beibehalten?** Bleibt erstmal; gilt pro Session, nicht pro Subscription. Edge-Case: zwei eng aufeinander folgende Stops derselben Session würden nur einen Push erzeugen — akzeptabel.
