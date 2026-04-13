# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Hub

Web-Interface zum Verwalten und Fernsteuern von Claude Code Sessions auf einem Mac mini (Apple Silicon, macOS, User: `rocky`).

## Projektstruktur

```
~/Projects/claude-code-hub/
├── server.js            # Express + WebSocket Backend (node-pty, tmux)
├── public/
│   ├── index.html       # Single-Page Frontend (Vanilla JS, xterm.js, inline CSS)
│   └── fonts/           # Lokal gehostete Webfonts (JetBrains Mono + Noto Sans Symbols)
├── package.json         # Dependencies: express, express-ws, node-pty, dotenv
├── .env                 # Konfiguration (PORT, AUTH_TOKEN, SESSION_PREFIX, DEFAULT_PROJECT_DIR, TMUX_PATH)
├── .env.example         # Template
├── setup.sh             # Installationsscript (LaunchAgent, .env, npm install)
├── logs/                # stdout.log, stderr.log
├── ROADMAP.md           # Roadmap (Released / In Entwicklung / Backlog / Changelog)
└── CLAUDE.md
```

## Roadmap / Planung

`ROADMAP.md` im Projekt-Root ist das **lebende Roadmap-Dokument** und wird seit 2026-04-13 über die Projekt-Verwaltung im Hub selbst gepflegt (dogfood). Struktur folgt dem `lib/roadmap.js`-Parser:

- **`## Released: vX.Y.Z`** — was aktuell live ist (letztes Release).
- **`## In Entwicklung: vA.B.C`** — woran gerade gearbeitet wird.
- **`## Backlog / Ideen`** — alles was P0/P1/P2-Priorität hat oder als offene Entscheidung ansteht. Items tragen `{priority: p0|p1|p2, theme: …}` oder `{type: decision}` als Meta-Suffix.
- **`## Changelog`** — Narrative pro geshiptem Release, freies Markdown.

Vor neuer Feature-Arbeit: erst `ROADMAP.md` lesen (oder im Hub unter Projekte → claude-code-hub öffnen), schauen ob das Feature schon spezifiziert ist, und bei Änderungen der Planung die Datei mitpflegen. Items werden direkt im Hub-Detail-View getoggelt/ergänzt (`PATCH /api/projects/:id/items`). Nach Abschluss eines Features: Checkbox abhaken und im Changelog des jeweiligen Releases vermerken. Der „Version abschließen"-Flow (Released ← Dev, Release-Notes generieren) kommt mit Phase 1 Step 3.

**Parser-Regeln beim manuellen Editieren:** nur Top-Level-Checkboxen (keine Indents), keine `{}` im Item-Text (kollidiert mit Meta-Suffix), keine Control-Chars. Änderungen via Hub sind parser-safe validiert.

## Architektur

- **Backend:** Express.js Server auf Port 3333 (`server.js`). REST-API für Session-CRUD, WebSocket-Endpunkt für Terminal-Zugriff via node-pty. ES Modules (`"type": "module"`). Verwendet durchgehend `execFileSync` mit Argv-Arrays — kein Shell-Interpolation, kein Injection-Risiko.
- **Frontend:** Single HTML-Datei (`public/index.html`) mit eingebettetem CSS/JS. Dashboard mit Session-Cards + Terminal-View mit xterm.js. Kein Build-Step, keine Frameworks, kein clientseitiges Routing — Express fällt alle nicht-API-Routen auf `index.html` zurück.
- **Sessions:** tmux-Sessions mit Prefix `cc-`. Jede Session startet einen Befehl (default: `claude`) in einem Projektverzeichnis. Das Backend hält keinen eigenen Session-State — tmux ist die Source of Truth. `GET /api/sessions` ruft `tmux list-sessions` + `tmux capture-pane` pro Session auf, Previews werden 2 Sekunden lang gecached.
- **Auth:** Bearer-Token aus `.env`. Frontend holt sich den Token beim ersten Laden per `prompt()` und speichert ihn im `localStorage` unter `cchub_token` — der Token steht **nicht** im HTML-Quelltext. REST akzeptiert `Authorization: Bearer <token>`; WebSocket akzeptiert Token per `Sec-WebSocket-Protocol: bearer.<token>` (mit `?token=` als Fallback für die Migration).
- **Remote-Zugriff:** Cloudflare Tunnel auf `code.derremo.xyz` → `localhost:3333`.
- **Auto-Start:** macOS LaunchAgent `com.derremo.claude-code-hub` (siehe `setup.sh` für plist-Template).
- **Graceful Shutdown:** Beim `SIGTERM`/`SIGINT` werden alle aktiven PTYs gekillt bevor der Server schließt.

## Wichtige Pfade & Konstanten

- tmux Binary: `/opt/homebrew/bin/tmux` (Default, overridable via `TMUX_PATH` in `.env`)
- Node Binary: `/opt/homebrew/bin/node`
- Home: `/Users/rocky`
- Projekte: `~/Projects`
- LaunchAgent: `~/Library/LaunchAgents/com.derremo.claude-code-hub.plist`
- Auth-Token im Client: `localStorage['cchub_token']`

## API-Endpunkte

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/sessions` | Liste aller tmux-Sessions mit Preview (`?preview=0` deaktiviert N+1-capture) |
| POST | `/api/sessions` | Neue Session erstellen (`{ name, directory, command }`). Name-Whitelist: `/^[\w\-. ]{1,64}$/`. |
| DELETE | `/api/sessions/:name` | Session beenden |
| PATCH | `/api/sessions/:name` | Session umbenennen (`{ newName }`) |
| GET | `/api/browse` | Verzeichnis-Picker (`?path=…&hidden=1`) für UI-Tree. Pfade werden auf `$HOME` eingeschränkt (403 sonst). |
| WS | `/api/terminal/:name` | WebSocket Terminal-Verbindung. Prüft Session-Existenz vor Attach; schließt mit `4004` wenn Session fehlt, `4001` bei Auth-Fehler. |

## WebSocket-Protokoll

**Client → Server (Text frames, JSON):**
- `{ "type": "input", "data": "..." }` — Tastatureingabe
- `{ "type": "resize", "cols": N, "rows": N }` — Terminal-Größe ändern

**Server → Client:**
- Binary frames — rohe PTY-Bytes (UTF-8). xterm.js dekodiert chunkboundary-sicher via `term.write(Uint8Array)`.
- Text frame `{ "type": "error", "message": "..." }` — Fehlermeldung vor Close.

**Auth-Handshake:**
Client: `new WebSocket(url, [\`bearer.\${token}\`])`. Server echo'd das Protocol zurück (siehe `wsOptions.handleProtocols` in `server.js`).

## Konventionen

- Sprache im UI: Deutsch
- Design: Dark Theme, Teal-Akzent (#2dd4bf), JetBrains Mono für Code, DM Sans für UI
- Session-Namen bekommen automatisch den Prefix `cc-` (auch beim Rename)
- Session-Name-Whitelist: `^[\w\-. ]{1,64}$`. Verletzungen liefern 400.
- Alle tmux-Aufrufe gehen durch `execFileSync(TMUX, [argv...])` — **nie** Shell-String-Interpolation. Bei Erweiterungen dasselbe Muster nutzen.
- Alle externen Binaries mit vollem Pfad referenzieren (`TMUX`-Konstante oder `TMUX_PATH`-Env)
- Frontend ist eine Single-File SPA — CSS und JS inline in index.html, kein Build-Step
- xterm.js, xterm-addon-fit und xterm-addon-web-links werden per CDN geladen; JetBrains Mono + Noto Sans Symbols liegen lokal in `public/fonts/`
- Fehlertexte im UI sind Deutsch, API-Error-Strings Englisch — bewusste Trennung zwischen User- und Dev-Ebene.

## Entwicklung

Kein Build-Step, keine Tests, kein Linter. Änderungen werden durch Neustart des Servers und manuellen Browser-Test verifiziert.

```bash
# Server manuell starten (zum Testen)
cd ~/Projects/claude-code-hub && npm start      # = node server.js
npm run dev                                      # identisch — kein Watcher/Hot-Reload

# LaunchAgent neustarten (nach Code-Änderungen nötig, sonst läuft alte Version weiter)
launchctl kickstart -k gui/$(id -u)/com.derremo.claude-code-hub

# LaunchAgent stoppen (nötig vor manuellem `npm start`, sonst Port-3333-Konflikt)
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist

# LaunchAgent erstmalig laden (nach Edit der plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.derremo.claude-code-hub.plist

# Logs
tail -f logs/stdout.log
tail -f logs/stderr.log
```

Setup auf frischem Mac: `./setup.sh` (installiert tmux/deps, generiert Token, richtet LaunchAgent ein).

## Bekannte Einschränkungen

- tmux-Socket muss existieren (`/private/tmp/tmux-501/`) — wird beim ersten `tmux new-session` automatisch erstellt
- node-pty erfordert Xcode Command Line Tools zum Kompilieren
- `claude` CLI muss im PATH sein (`/opt/homebrew/bin/` oder via `~/.local/bin`). `server.js` ergänzt beides zur Laufzeit; der LaunchAgent-PATH selbst bleibt minimal.
- LaunchAgent-plist **muss** Mode `644` haben — launchd verweigert world-writable Dateien stillschweigend mit `Bootstrap failed: 5: Input/output error`. `setup.sh` setzt das automatisch; bei manuellem Edit der plist daran denken.
- Pfade in der plist sind case-sensitiv zu behandeln (`/Users/rocky/Projects/...` mit großem `P`), auch wenn APFS standardmäßig case-insensitiv ist.
- tmux muss beim Attach mit `-u` aufgerufen werden, damit es im UTF-8-Mode läuft; außerdem setzt `server.js` `LANG`/`LC_CTYPE` im PTY-Env. Ohne beides ersetzt tmux Multi-Byte-Zeichen (Umlaute, ⏺ ⎿ ✻) durch `_`.
- tmux mouse mode wird beim Server-Start mit `set-option -g mouse on` aktiviert. Ohne das funktioniert Scroll-Wheel im xterm-Terminal nicht, weil tmux keine Wheel-Events an den Client forwarded.
