# iOS Native-Feel Polish — Design

**Datum:** 2026-04-15
**Scope:** `public/index.html` — frontend only, kein Backend-Touch
**Ziel:** Terminal-View auf iOS von „Web-App im Browser" zu „fühlt sich nativ an" bringen. Der Hub wird auf iPhone aus Home-Screen-Icons / Safari aktiv benutzt, und die aktuelle UX hat mehrere überlagerte Reibungspunkte, die zusammen „komisch" ergeben.

## Problem

Der Nutzer berichtet drei Symptome in Terminal-View auf iOS:

1. **Scrolling im Terminal fühlt sich stufig an** — man sieht den Zeilen-Raster, das Gefühl ist nicht flüssig wie in nativen iOS-Apps.
2. **Tastatur hakt, Zeichen werden nicht erkannt** — Tipp-Eingabe ist unzuverlässig, einzelne Keystrokes kommen verzögert, doppelt oder gar nicht an.
3. **Bar über der Tastatur nimmt zu viel Platz weg** — zwischen Touch-Bar, iOS-QuickType-Bar und leerem App-Header bleibt kaum Terminal-Fläche.

Weitere im Brainstorming identifizierte Reibungspunkte:
4. Touch-Bar-Position **wackelt** beim Keyboard-Erscheinen.
5. **Pfeiltasten repeaten nicht** beim Halten — jedes `↑` muss neu getappt werden.
6. **Ctrl-Sticky ist unklar und löchrig** — Touch-Bar-Keys respektieren Ctrl nicht, State bleibt stale, Aktiv-Indikator ist leicht zu übersehen.

## Root-Cause-Analyse

### Problem 1 — Scroll stufig

Claude läuft im xterm-Alt-Screen-Buffer, d.h. xterm selbst hält keinen Scrollback — die History gehört tmux. Vertikale Swipes werden in SGR-Mouse-Wheel-Escape-Sequenzen (`\x1b[<64;1;1M` / `\x1b[<65;1;1M`) übersetzt und an tmux geschickt. Das ist architektonisch zeilenbasiert: tmux versteht nur ganzzahlige Wheel-Events, nicht Pixel. Zusätzlich:

- `PX_PER_LINE = 24` ist hardcodiert, unabhängig von der tatsächlichen xterm-Cell-Height. Wenn die gerenderte Zeile z.B. 17px hoch ist, muss der Finger 24px zurücklegen für einen Schritt, der visuell eine Zeile entspricht → Finger und Content sind schon vom Verhältnis her entkoppelt.
- Innerhalb einer Zeile passiert visuell **nichts**, dann springt der Content um eine ganze Zeile → sichtbares „Stufen".

### Problem 2 — Keyboard hakt + QuickType klaut Platz

Die `.xterm-helper-textarea` hat **keine** iOS-Input-Attribute gesetzt. Heißt bei iOS Safari:
- **Autocorrect ist an** → iOS routet Eingaben durch einen Composition-Layer (`compositionstart`/`-update`/`-end`), auch für normales Tippen. xterm.js' Helper-Textarea-Handler ist nicht hart für Composition ausgelegt, in Kombination mit den Custom-Touch-Handlern racet das → Keystrokes werden gepuffert, verzögert, dupliziert oder verloren.
- **Autocapitalize ist an** → erster Buchstabe jeder „Eingabe" wird großgeschrieben, zerstört Shell-Commands.
- **QuickType-Bar wird gezeigt** → die graue Predictive-Text-Bar (~40-45px) klebt über der Tastatur, in Kombination mit der eigenen Touch-Bar (44px + safe-area-inset-bottom) stapeln sich **zwei** Leisten über der Keyboard selbst.
- **Smart-Quotes, Spellcheck** → zusätzliche Artefakte.

### Problem 3 — Touch-Bar Position wackelt

`updateKeyboardInset()` läuft als synchroner Event-Handler auf `visualViewport.resize` und `scroll`. iOS feuert während der Keyboard-Animation mehrere Zwischen-Heights (~5-10 Events), jeder setzt direkt `bar.style.bottom = <inset>px`. `bottom`-Changes triggern Layout, nicht Compositing → sichtbares Jittern während der Keyboard-Animation.

### Problem 4 — Pfeiltasten kein Repeat

Im `setupTouchBar`-Handler ist nur ein `click`-Listener. Kein nativer Key-Repeat für HTML-Buttons.

### Problem 5 — Ctrl-Sticky löchrig

Die Transformation `pendingCtrl + letter → Ctrl+letter` findet nur in `term.onData` statt. Touch-Bar-Keys gehen durch `sendRawInput`, das `pendingCtrl` **nicht** prüft. Tappt man Ctrl, dann ein Touch-Bar-Key → Ctrl bleibt stale, Touch-Bar-Key wird roh gesendet. Außerdem: kein Auto-Release-Timeout, kein pulsierender Indikator.

### Problem 6 — App-Header in Terminal-View

Der globale `.header` (64px + `safe-area-inset-top` ≈ 108px auf iPhone mit Notch) ist in Terminal-View **funktional leer**: Back-Navigation und Session-Name sind in der `.terminal-toolbar` darunter, Push/Sound/Theme-Toggles + Kbd-Help sind Settings die man während aktiver Terminal-Arbeit nicht berührt. Reine Platzverschwendung.

## Design

### Einheits-Prinzip

Alle Fixes sind **chirurgische Eingriffe** in existierende Stellen in `public/index.html`. Keine neuen Module, kein Build-Step, keine Dependencies, kein Backend-Touch. Jeder Fix ist für sich testbar und unabhängig von den anderen. Reihenfolge der Umsetzung frei wählbar, aber logisches Bündeln nach Bereich (Scroll / Keyboard / Touch-Bar / Header) empfohlen.

### Fix 1 — Terminal-Scroll: Sub-Line-Smoothness + dynamic PX_PER_LINE

**Where:** Der existierende Touch-Scroll-Block in `connectTerminal()` (ca. Zeile 5399-5443 in `public/index.html`).

**Änderungen:**
1. `PX_PER_LINE` wird dynamisch aus der aktuellen xterm-Cell-Height berechnet. Primär über `term._core._renderService.dimensions.css.cell.height`, mit Fallback auf DOM-Messung (`container.querySelector('.xterm-rows > div')?.getBoundingClientRect().height`), Fallback-Fallback: `24`. Wird bei jedem `touchstart` neu gelesen, weil sich Cell-Height durch Font-Resize, Device-Rotation oder Zoom ändern kann.
2. Während eines aktiven Drags wird ein akkumulierter `partialDelta` (Rest-Pixel < einer Zeile) per `transform: translateY(<partialDelta>px)` auf `.xterm-screen` (oder `.xterm`-Element innerhalb `terminal-container`) angewendet. Das gibt visuelle Sub-Line-Smoothness — der Content klebt pixelgenau am Finger auch innerhalb einer Zeile.
3. Sobald der Akkumulator eine volle Zeile überschreitet, wird die entsprechende Anzahl Wheel-Events an tmux gesendet (wie jetzt) und `partialDelta` auf den Rest reduziert — der Transform wird entsprechend zurückgesetzt. Tmux-Redraw ersetzt die visuelle Translation durch echtes Scrolling.
4. Bei `touchend`/`touchcancel` wird `partialDelta` auf 0 zurück-animiert (transition 150ms ease-out) — falls der Finger mitten in einer halben Zeile losgelassen wird, gibt's ein kurzes Snap-Back. Alternative: Richtung des letzten Deltas weiter abschließen (ein zusätzliches Wheel-Event), falls `|partialDelta| > cellHeight/2`. **Zu entscheiden bei Implementierung welcher Ansatz sich besser anfühlt — Plan sollte beide Optionen listen und testen.**

**Trade-off:** Der Transform läuft rein visuell und verändert das DOM nicht. Achten auf: Selection-Overlay (Shift-Drag) darf nicht mit verschoben werden (`terminal-container` bleibt fix, nur `.xterm-screen` oder `.xterm` transformiert). Selection-Koordinaten müssen während aktivem Transform gedisabled sein (oder vor Selection-Start: Transform 0 setzen).

**Scope-Grenzen:** Momentum/Inertia und Rubber-Band-Bounce sind explizit **nicht** Teil dieser Spec. Können in einer Folge-Iteration nachgezogen werden, falls nach Fix 1 noch Bedarf besteht.

### Fix 2 — Keyboard-Input: iOS-Attribute auf xterm-helper-textarea

**Where:** In `connectTerminal()` direkt nach `term.open(container)`.

**Änderung:** Query `.xterm-helper-textarea` im Container, setze:
```js
const ta = container.querySelector('.xterm-helper-textarea');
if (ta) {
  ta.setAttribute('autocorrect', 'off');
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('autocomplete', 'off');
  ta.setAttribute('spellcheck', 'false');
}
```

**Effekt:**
- iOS skippt den Composition-Layer → Keystrokes werden direkt als `input`-Events gefeuert → kein Zeichen-Verlust mehr.
- QuickType-Bar wird von iOS nicht gezeigt → ~40-45px vertikaler Platz zurückgewonnen.
- Keine Auto-Großschreibung / Smart-Quotes / Spellcheck-Artefakte mehr.

**Idempotenz:** Falls xterm bei Reconnect eine neue Textarea anlegt (beim Dispose+Recreate), läuft der Code beim nächsten `connectTerminal()` erneut → immer frisch gesetzt. Kein Observer nötig.

**Trade-off:** Emoji-Shortcuts und Textvorschläge aus der QuickType-Bar nicht mehr verfügbar — bewusst akzeptiert, weil sie in einem Shell-Terminal-Kontext schädlich sind und vom User explizit so gewollt.

### Fix 3 — Touch-Bar Position: translate3d + rAF-Throttle

**Where:** `updateKeyboardInset()`-Funktion (ca. Zeile 5583).

**Änderung:**
1. rAF-Guard: `if (kbRafPending) return; kbRafPending = true; requestAnimationFrame(() => { kbRafPending = false; /* body */ });` — mehrere schnell hintereinander gefeuerte `visualViewport.resize`-Events werden auf ein Frame zusammengeführt.
2. `#touch-bar` wird nicht mehr über `bar.style.bottom = <inset>px` positioniert, sondern über `bar.style.transform = inset > 0 ? \`translate3d(0,-\${inset}px,0)\` : ''`. Das `bottom: env(safe-area-inset-bottom)` bleibt im CSS bestehen — der Transform legt den Keyboard-Offset additiv drauf.
3. Die `--kb-inset`-CSS-Variable wird weiterhin gesetzt (Fix 6 braucht sie auch).

**Effekt:** Compositor-only Position-Updates, GPU-beschleunigt, kein Layout-Trigger → smooth mitlaufend während der Keyboard-Animation statt Jitter.

### Fix 4 — Pfeiltasten Key-Repeat

**Where:** `setupTouchBar()`-Schleife (ca. Zeile 6157).

**Änderungen:**
1. Im HTML: `data-repeat` auf `↑`, `↓`, `←`, `→` Buttons setzen.
2. Im Handler: `pointerdown` statt `click` für Repeat-fähige Keys. Sofort ein Send, dann nach 400ms Delay ein `setInterval` mit 50ms Cadence. Stop-Handler auf `pointerup` / `pointercancel` / `pointerleave`. Pro-Button-lokaler State (kein globaler Interval-Id).
3. Keys ohne `data-repeat` (Esc, Tab, Ctrl, |, ~, /, Ctrl+C) verhalten sich wie bisher — nur ein Send pro Tap.

**Entscheidung:** Keine Beschleunigung auf 25ms nach 2s (wurde im Brainstorming als Option genannt, vom User als „kann weglassen" bestätigt). YAGNI.

**Edge-Cases:**
- Multi-Touch: Wenn während Drag eines Pfeils ein zweiter Finger woanders touched, soll der erste weiter repeaten. Pro-Button-State macht das automatisch richtig.
- Disconnect während Repeat: Disconnect-Teardown muss Intervalle cleanen. Nutzt denselben `touchScrollAbort`-artigen Mechanismus oder explizites `clearInterval` im Cleanup. **Plan sollte Cleanup-Pfad sicherstellen.**

### Fix 5 — Ctrl-Sticky härten

**Where:** `sendRawInput()` (Zeile 5561) und `setCtrlSticky()` (Zeile 5567).

**Änderungen:**
1. **`sendRawInput` respektiert Ctrl:** Identische Transformation wie in `term.onData`. Wenn `pendingCtrl` aktiv UND `data.length === 1` UND Code in 0x40-0x7E → zu Ctrl+letter transformieren (`code & 0x1f`), dann `setCtrlSticky(false)`. Shared-Helper-Funktion `applyPendingCtrl(data)` extrahieren, beide Stellen (`term.onData` und `sendRawInput`) nutzen sie.
2. **Auto-Release-Timeout:** In `setCtrlSticky(true)` einen 4s-Timeout setzen, der `setCtrlSticky(false)` ruft. In `setCtrlSticky(false)` den Timeout clearen. Ein aktiver Ctrl-State der 4s lang nicht benutzt wird, released automatisch.
3. **Visueller Glow:** `.touch-key.sticky-active` bekommt zusätzlich `box-shadow: 0 0 0 2px var(--teal), 0 0 12px rgba(45, 212, 191, 0.4)` und eine subtile pulse-Animation (`@keyframes sticky-pulse`, 1.2s infinite, opacity 0.7 ↔ 1). Macht den Active-State unübersehbar.

**Edge-Cases:**
- Disconnect während Ctrl-Sticky aktiv: `disconnectTerminal` ruft schon `setCtrlSticky(false)` (Zeile 5616), das wird den Timeout mit-clearen sobald der Cleanup-Code ergänzt ist.
- Ctrl + `|` (Shift-1, nicht ASCII-Letter): `|` hat Code 0x7C, liegt im 0x40-0x7E Range. Wird zu `\x1c` (File Separator). Unschön, aber konsistent mit dem existierenden Verhalten — tmux interpretiert's sinnvoll in den meisten Fällen. **Nicht ändern.**

### Fix 6 — App-Header auf Mobile in Terminal-View verstecken

**Where:** Neues Media-Query-Block im existierenden `@media (pointer: coarse)`-Block (ca. Zeile 1977).

**Änderung:**
```css
@media (pointer: coarse) {
  body[data-current-view="terminal"] .header { display: none; }
  body[data-current-view="terminal"] .terminal-view {
    /* Top-Offset weg, weil Header weg ist */
    top: 0;
    height: calc(100dvh - var(--kb-inset, 0px));
  }
}
```

Existierende `.terminal-view`-Regel (Zeile 1876-1879) hat `height: calc(100dvh - 64px - env(safe-area-inset-top) - var(--kb-inset, 0px))`. Die wird im Mobile-Terminal-Case überschrieben auf `calc(100dvh - var(--kb-inset, 0px))`.

**Effekt:** ~108px vertikaler Platz zurückgewonnen auf iPhone mit Notch in Terminal-View.

**Trade-off:** Push/Sound/Theme-Toggles + Kbd-Help-Button nicht in Terminal-View erreichbar. Bewusst akzeptiert, sind Settings die man einmal konfiguriert. Im Dashboard bleibt der Header wie gehabt. Kbd-Help-Button ist ohnehin für Desktop-Shortcuts gedacht und auf Touch-Geräten nicht relevant.

**Regressions-Check:** Die existierende terminal-toolbar (Back + Session-Name + Disconnect + Kill) bleibt unverändert sichtbar und deckt alle nötigen Terminal-View-Actions ab.

## Architektur-Boundaries

- **Kein Backend-Touch.** `server.js`, `lib/*.js`, Hooks bleiben unberührt.
- **Kein Build-Step.** Alles direkt in `public/index.html`, inline CSS + inline JS wie im Rest der Codebase.
- **Keine neuen Dependencies.** Kein npm install, kein CDN-Script neu.
- **Dashboard-View bleibt unverändert.** Alle Fixes sind an Terminal-View + Touch-Bar gebunden.
- **Desktop-View bleibt unverändert.** Fixes 3, 4, 6 sind `pointer: coarse`-gated. Fixes 1, 2, 5 wirken auch auf Desktop, verbessern dort aber höchstens leicht und verschlechtern nichts (autocorrect-off auf Desktop-Textarea ist ein No-Op, translate3d ist universell, Ctrl-Sticky wurde von Touch-Nutzern gemeldet aber funktioniert auf Desktop mit Maus ebenfalls).

## Testing

Keine automatisierten Tests im Projekt. Manueller Test-Plan:

**Device:** iPhone (aktuelles Safari), Zielansicht Terminal-View mit laufender Claude-Session.

1. **Scroll smooth:** Langes Swipen im Terminal-Output. Prüfen: Content folgt Finger pixelgenau, keine Stufen innerhalb einer Zeile, Snap-Back bei touchend wirkt natürlich.
2. **Keyboard:** Shell-Commands tippen (`ls`, `cd ~/Projects`, `git status`). Prüfen: jeder Buchstabe kommt an, keine Großschreibung, keine Korrekturen, keine Smart-Quotes.
3. **Kein QuickType:** QuickType-Bar sollte beim Focus auf Terminal **nicht** erscheinen.
4. **Touch-Bar smooth:** Tastatur auftauchen lassen (Tap ins Terminal), Tastatur dismissen (Done-Button o.ä.). Prüfen: Touch-Bar-Position fließt glatt mit, kein Jitter.
5. **Key-Repeat:** `↑` halten → Command-History sollte nach ~400ms beginnen hochzulaufen, mit ~20 Events/Sekunde. Esc/Tab halten → nur ein Event.
6. **Ctrl-Sticky:** Ctrl tappen → pulse-glow sichtbar. `C` auf iOS-Tastatur → Ctrl+C wird gesendet, Sticky released. Ctrl tappen + `|` in Touch-Bar tappen → Ctrl+| wird gesendet. Ctrl tappen + 5s warten → Sticky auto-releases.
7. **Header versteckt:** Terminal-View öffnen → kein App-Header sichtbar, Terminal nutzt ganze Höhe bis zur Touch-Bar. Zurück → Dashboard-Header wieder da.
8. **Regressions:** Desktop-Browser (Chrome/Firefox macOS) testen — alles soll aussehen und funktionieren wie vorher.

## Rollout

Ein einziger PR / Commit-Set mit allen 6 Fixes. Dev-Testing direkt auf einem iPhone über `code.derremo.xyz`. Rollback = git revert, low-risk weil alles frontend-only und keine State-Migration.

## Offene Fragen / Entscheidungen bei Implementierung

1. **Fix 1 — Snap-Back vs. Finish-Scroll bei touchend:** Zwei Ansätze testen, welcher sich besser anfühlt.
2. **Fix 1 — Welches Element transformieren:** `.xterm-screen`, `.xterm`, oder `.xterm-rows`? Plan sollte im Code kurz prüfen welche Ebene ohne Layout-Side-Effects verschiebbar ist.
3. **Fix 5 — Ctrl+non-letter:** `|`, `~`, `/` im Ctrl-Sticky — aktuelles Verhalten (Transform auf alle 0x40-0x7E) beibehalten, nicht ändern.
