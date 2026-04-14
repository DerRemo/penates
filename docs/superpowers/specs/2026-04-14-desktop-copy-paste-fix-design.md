# Desktop Copy/Paste Fix — Design

**Datum:** 2026-04-14
**Scope:** Nur Desktop. Mobile ist ein separates Brainstorming.

## Problem

Im Terminal-View funktionieren Kopieren und Einfügen unzuverlässig bzw. gar nicht — getestet primär in Firefox auf macOS:

1. **Markieren flasht weg, wenn das Remote-Programm Mouse-Tracking aktiviert hat.** Claude CLI (und tmux mit `mouse on`) schalten DEC-Mouse-Tracking ein. xterm.js leitet Maus-Events dann als Escape-Sequenzen weiter, statt Client-Selection zu machen. Workaround existiert (Shift+Drag bypasst Mouse-Tracking), ist aber nicht auffindbar für User.
2. **Cmd+C kopiert nichts.** Auch nach erfolgreichem Shift+Drag-Markieren landet nichts auf der Zwischenablage. Ursache: xterm.js rendert Selection per Canvas/DOM — es ist **keine** echte Browser-Selection. Der Browser weiß nichts davon, Cmd+C ist ein No-Op. Copy muss explizit verdrahtet werden.
3. **Rechtsklick-Paste zeigt in Firefox Doppel-UI.** Unser `contextmenu`-Handler ruft `navigator.clipboard.readText()`. Firefox erlaubt das nicht stumm und zeigt eine Permission-Bubble mit „Einfügen"-Button — zusätzlich zum nativen Kontextmenü, das wir per `preventDefault()` eigentlich unterdrücken wollten. Ergebnis: User sieht ein komisches Menü plus einen zweiten Einfügen-Button darüber.

## Nicht-Ziele

- Mobile-Bedienung (eigenes Spec).
- Auto-Copy bei Selection-End. Verworfen, weil es versehentliche Klicks auf Clipboard schreibt und andere Copy-Ops überschreibt.
- Native-Browser-Selection statt xterm-Selection. Wäre ein anderes Terminal-Rendering — Overkill.
- Mouse-Tracking abschalten. Brauchen wir weiterhin für Scroll-Wheel und Claude-CLI-UI.

## Lösung

Drei kleine, unabhängige Änderungen in `public/index.html`:

### 1. Cmd+C / Ctrl+C selbst implementieren

Via `term.attachCustomKeyEventHandler(ev => …)`:

- Nur bei `keydown`-Events reagieren.
- **Nur eingreifen, wenn eine Selection existiert** (`term.hasSelection()`). Ohne Selection muss `Ctrl+C` normal durchgehen — sonst bricht SIGINT und das Terminal ist unbrauchbar. Das ist der kritische Guard.
- Auf Mac: `ev.metaKey && ev.key === 'c'`. Auf Windows/Linux: `ev.ctrlKey && ev.key === 'c'`. Shift egal.
- Bei Treffer: `navigator.clipboard.writeText(term.getSelection())` (async, braucht keine Permission), dann `return false` → xterm schickt den Keystroke nicht weiter.
- Bei `writeText`-Fehler: Toast „Kopieren fehlgeschlagen".

Optional nach dem Copy: kurzer Toast „Kopiert" (500ms). Wird im Plan entschieden — in diesem Spec nicht festgelegt.

### 2. Rechtsklick-Handler Firefox-aware

Einmalig beim Modulstart: `const isFirefox = navigator.userAgent.includes('Firefox')`.

Im `contextmenu`-Handler am Container:
- **Nicht-Firefox** (Chrome/Safari/Brave/Arc): unverändert — `preventDefault()` + `navigator.clipboard.readText()` + `term.paste(text)`. Funktioniert dort silent.
- **Firefox:** Handler macht gar nichts. Natives Kontextmenü erscheint. User klickt „Einfügen", Firefox firet ein `paste`-Event auf die fokussierte Helper-Textarea, das bubbelt zum Container und wird vom existierenden `paste`-Listener (bereits vorhanden bei `container.addEventListener('paste', …)`) an `term.paste()` delegiert. Kein zweiter Einfügen-Button mehr.

UA-Sniffing ist hier vertretbar: das Verhalten ist wirklich Firefox-spezifisch (Clipboard-API-Policy), kein Feature das man sauber detecten kann.

### 3. One-Time-Hint für Selection

Einmaliger Toast beim ersten Öffnen eines Terminal-Views pro Browser-Profil:

> 💡 Shift+Drag zum Markieren · Cmd+C kopiert

Gated via `localStorage['cchub_hint_copy_seen'] = '1'`. Dauer ~6s, nicht-blockierend. Nutzt existierende `showToast()`-Funktion.

## Datenfluss Copy (neu)

```
User:   Shift+Drag → xterm zeichnet Client-Selection
User:   Cmd+C
xterm:  customKeyEventHandler prüft → hasSelection() === true
code:   navigator.clipboard.writeText(term.getSelection())
code:   return false → xterm schluckt den Keystroke
Browser: Text liegt im OS-Clipboard
```

## Datenfluss Paste (Firefox, neu)

```
User:   Rechtsklick auf Terminal
Firefox: zeigt natives Kontextmenü (unser Handler ist no-op)
User:   klickt „Einfügen"
Firefox: firet paste-Event auf xterm-helper-textarea
Browser: Event bubblet zum Container
code:   container.paste-Listener ruft term.paste(text)
xterm:  schickt Text (ggf. bracketed) an Backend → tmux → Claude
```

## Datenfluss Paste (Chrome/Safari, unverändert)

```
User:   Rechtsklick auf Terminal
code:   contextmenu-Handler preventDefault() + clipboard.readText()
code:   term.paste(text)
```

## Risiken

- **SIGINT brechen:** Wenn der `hasSelection()`-Guard vergessen wird, schluckt der Handler `Ctrl+C` auch ohne Selection → User kann laufende Prozesse nicht mehr abbrechen. Kritischer Bug. Muss im Plan als expliziter Testfall stehen: „Ctrl+C ohne Selection muss SIGINT senden".
- **UA-Sniffing Drift:** Wenn Firefox die Clipboard-API-Policy lockert, wäre unser Branch unnötig restriktiv. Akzeptabel — maximal Suboptimum, nichts bricht.
- **`writeText` braucht secure context:** `https://` oder `localhost`. Cloudflare-Tunnel ist https, lokaler Dev ist localhost — beides ✓.

## Testplan

Manuelle Tests nach Implementierung, in Firefox und Chrome auf macOS:

1. Shift+Drag markieren → `Cmd+C` → in anderem Fenster `Cmd+V` → Text korrekt?
2. **Ohne Selection** `Ctrl+C` im Terminal → laufender Prozess wird abgebrochen?
3. Text in externem Fenster kopieren → Rechtsklick im Terminal → „Einfügen":
   - Firefox: natives Menü, ein Paste-Button, Text landet im Terminal?
   - Chrome: kein Menü, Text landet sofort im Terminal?
4. Neuer Browser-Profil (oder `localStorage.clear()`) → Terminal öffnen → Hint-Toast erscheint einmal → Terminal erneut öffnen → kein Toast mehr.

## Betroffene Dateien

- `public/index.html` — `new Terminal()`-Setup-Block (~5098), `contextmenu`-Handler (~5145), Terminal-Open-Flow (~5202).

Keine Backend-Änderungen. Keine neuen Dependencies.
