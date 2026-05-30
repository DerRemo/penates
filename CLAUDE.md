# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Code Hub

Web-Interface zum Verwalten und Fernsteuern von Claude Code Sessions auf macOS (Apple Silicon + Intel).

## Projektstruktur

```
claude-code-hub/
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

Vor neuer Feature-Arbeit: erst `ROADMAP.md` lesen (oder im Hub unter Projekte → claude-code-hub öffnen), schauen ob das Feature schon spezifiziert ist, und bei Änderungen der Planung die Datei mitpflegen. Items werden direkt im Hub-Detail-View getoggelt/ergänzt (`PATCH /api/projects/:id/items`). Nach Abschluss eines Features: Checkbox abhaken und im Changelog des jeweiligen Releases vermerken.

**Parser-Regeln beim manuellen Editieren:** nur Top-Level-Checkboxen (keine Indents), keine `{}` im Item-Text (kollidiert mit Meta-Suffix), keine Control-Chars. Änderungen via Hub sind parser-safe validiert.

## Architektur

- **Backend:** Express.js Server (default Port 3333, konfigurierbar via `PORT` in `.env`). REST-API für Session-CRUD, WebSocket-Endpunkt für Terminal-Zugriff via node-pty. ES Modules (`"type": "module"`). Verwendet durchgehend `execFileSync` mit Argv-Arrays — kein Shell-Interpolation, kein Injection-Risiko.
- **Frontend:** Single HTML-Datei (`public/index.html`) mit eingebettetem CSS/JS. Dashboard mit Session-Cards + Terminal-View mit xterm.js. Kein Build-Step, keine Frameworks, kein clientseitiges Routing — Express fällt alle nicht-API-Routen auf `index.html` zurück.
- **Sessions:** tmux-Sessions mit Prefix `cc-`. Jede Session startet einen Befehl (default: `claude`) in einem Projektverzeichnis. Das Backend hält keinen eigenen Session-State — tmux ist die Source of Truth. `GET /api/sessions` ruft `tmux list-sessions` + `tmux capture-pane` pro Session auf, Previews werden 2 Sekunden lang gecached.
- **Auth:** Bearer-Token aus `.env`. Frontend holt sich den Token beim ersten Laden per `prompt()` und speichert ihn im `localStorage` unter `cchub_token` — der Token steht **nicht** im HTML-Quelltext. REST akzeptiert `Authorization: Bearer <token>`; WebSocket akzeptiert Token per `Sec-WebSocket-Protocol: bearer.<token>` (mit `?token=` als Fallback für die Migration).
- **Remote-Zugriff:** Optional via Cloudflare Tunnel auf eine eigene Domain → `localhost:<PORT>`.
- **Auto-Start:** macOS LaunchAgent (default: `com.claude-code-hub`, konfigurierbar via `LAUNCHAGENT_ID` Env). Siehe `setup.sh` für plist-Template.
- **Graceful Shutdown:** Beim `SIGTERM`/`SIGINT` werden alle aktiven PTYs gekillt bevor der Server schließt.

## Filebrowser (v0.6.0)

### lib/files.js

Zentrales File-I/O-Modul. Jede öffentliche Funktion geht zuerst durch `resolveSafe(projectDir, relPath)` — den **Path-Guard**: resolves den Pfad absolut und prüft dass er unter `projectDir` liegt (403 wenn nicht). Keine Ausnahmen, kein Escape via `../`. Funktionen:

- `listDir(dir, rel)` — Verzeichnisinhalt mit Typ, Größe, mtime
- `readFile(dir, rel)` — Text (≤2MB), Image (≤10MB, base64), PDF (≤10MB, base64), mime-sniffing via `file-type` + Extension-Fallback. Oversize liefert 413 + Metadaten.
- `mkdirSafe(dir, rel)` — `mkdir -p` unter Path-Guard
- `renameOrMove(dir, src, dst)` — atomic rename, beides unter Path-Guard
- `copyFile(dir, src, dst)` — `fs.cp` mit Path-Guard auf beide Seiten
- `writeStream(dir, rel, stream)` — Streaming-Write für Busboy-Uploads, self-write-Suppression via `noteSelfWrite`
- `deleteToTrash(dir, rel)` — ruft `/usr/bin/trash` auf (nicht `rm`, nicht osascript — macOS-Automation-Permission war geblockt)

### lib/file-watcher.js

Rekursives `fs.watch` pro Projekt, on-demand: `attachWatcher(projectDir)` / `detachWatcher(projectDir)`. 30s Idle-Timeout wenn kein Subscriber mehr. 80ms Debounce pro Projekt coalesct Event-Bursts. Self-Write-Suppression: `noteSelfWrite(path)` setzt eine 400ms-TTL; Events innerhalb des Fensters werden gedroppt (verhindert Echo des eigenen Uploads). Gibt Events an `lib/attention.js`-ähnlichen Broadcast weiter via `onFileEvent(cb)`.

### REST-Routen (Filebrowser)

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/projects/:id/files` | Verzeichnis-Listing (`?path=rel`) |
| GET | `/api/projects/:id/files/read` | Datei lesen (`?path=rel`) — Text/Image/PDF/Oversize |
| POST | `/api/projects/:id/files` | Datei erstellen / mkdir (`{ type, path }`) |
| PATCH | `/api/projects/:id/files` | Rename / Move / Copy (`{ op, src, dst }`) |
| DELETE | `/api/projects/:id/files` | In Trash löschen (`?path=rel`) |
| POST | `/api/sessions/:name/upload` | Upload in Session-cwd (Busboy multipart) |
| POST | `/api/sessions/:name/image` | Einzelnes PNG (`express.raw image/png`, ≤8 MB) → `.cch-images/`, liefert `{rel}` für die `@`-Mention |
| GET | `/api/preview/config` | Browser-Preview: `{enabled, host, activePort}` (fixer Preview-Host + aktiver Port) |
| GET | `/api/preview/ports` | Browser-Preview: lauschende localhost-Ports (`lsof`), Hub-Port ausgeblendet |
| POST | `/api/preview/select` | Browser-Preview: setzt den Port hinter dem fixen Host (`{port}`/`{port:null}`, SSRF-geguarded) |
| WS | `/api/files/events` | Live-Updates; `{ type: subscribe/unsubscribe, projectId }` — bearer-Subprotocol wie Terminal |

### Frontend-Module (inline in index.html)

- **`FileBrowser` IIFE** — aufklappbare Sidebar in der Terminal-View, resizable (drag-handle), offene Ordner persistent via `localStorage`. Lazy-Load des Trees: nur beim Aufklappen eines Ordners wird `/api/projects/:id/files?path=rel` gefetcht.
- **`FilePreview`** — Modal für Text/Image/PDF/Oversize. Text-Highlighting via `highlight.js` — lazy per `import()` vom ESM-CDN, nur beim ersten Preview-Open. PDF via `<iframe>` mit Blob-URL, Images inline. Oversize zeigt Metadaten + Download-Hinweis.
- **`FileActions`** — Context-Menu (Rechtsklick im Tree): Öffnen, Umbenennen (inline-Edit), Kopieren, Verschieben, Löschen (2-Klick-Confirm), Pfad kopieren.
- **`Uploader`** — Toast-Stack mit XHR-Fortschrittsbalken, sequenzielle Queue (kein paralleles Flood), Conflict-UI bei 409. Quellen: Tree-DnD (Drop auf Ordner, spring-loaded 600ms Dwell), Terminal-Drop-Overlay (capture-phase Listener vor xterm), Mobile File-Picker-Fallback.

### Tests

- **Unit:** `node --test lib/*.test.js` — deckt `files.js` (path-guard 403, preview 200/413), `file-watcher.js` (debounce, self-write-suppression), upload/cleanup.
- **E2E:** `npm run test:e2e` — Playwright mit zwei Projekten: `chromium` + `webkit-mobile` (iPhone 15 Viewport). 10 Specs pro Engine, 1 fixme pro Engine (synthetic DnD — Playwright input-pipeline löst keine echten OS-Drag-Events aus).

### Scope-Entscheidungen (v0.6.0)

- Nur Projekt-cwd (kein HOME-Zugriff aus dem Filebrowser)
- `/usr/bin/trash` für Delete (kein `rm`, kein osascript Finder)
- Text ≤2MB, Image ≤10MB, PDF ≤10MB; Markdown wird als raw Text geliefert
- Kein Cross-Projekt-Copy in v0.6.0
- Rate-Limit: globaler `writeLimiter` 60/min deckt Uploads (kein per-Route-Bucket)

---

## Hook-basierte State-Detection (Notifications)

Session-Zustand kommt **ausschließlich** aus Claude Code Hooks — kein
Regex-Parser, kein Poll-Loop mehr. Quelle ist `~/.claude/settings.json`,
wo `setup.sh` einen `hooks`-Block installiert, der bei `Stop` / `Notification`
/ `UserPromptSubmit` / `SubagentStop` / `SessionStart` / `SessionEnd` per curl
an `POST /api/hooks/:event` signalisiert. Fremde tmux-Sessions oder Pre-
Hook-Sessions (vor dem Upgrade gestartet) zeigen im Dashboard schlicht
`activity: unknown` → Label „Aktiv".

### Env-Injection

`server.js` injiziert beim `tmux new-session` drei Env-Vars via `-e`, die
als tmux-Session-Env an den Claude-Kindprozess vererbt werden:

- `CC_HUB_SESSION` — tmux-Session-Name (inkl. `cc-`-Prefix)
- `CC_HUB_URL` — `http://127.0.0.1:<PORT>`
- `CC_HUB_TOKEN` — Bearer-Token (nur wenn `AUTH_TOKEN` gesetzt)

### Self-bootstrapping Hooks (Moshi-Interop)

Der Hook-curl ist quellen-agnostisch: er sourct `~/.claude-code-hub/hook.env`
(`CC_HUB_URL` + `CC_HUB_TOKEN`, von `setup.sh` mit `chmod 600` geschrieben) und
leitet den Session-Namen zur Laufzeit aus tmux ab (`tmux display-message -p
'#S'`, Fallback `$CC_HUB_SESSION`). Dadurch melden auch Sessions an den Hub,
die NICHT über den Hub gestartet wurden (z.B. via Moshi per SSH/Mosh). Das
`tmux -e`-Inject (`hubEnvArgs`) bleibt als Fallback. Der StatusLine-Block
nutzt dasselbe Muster. Re-Runs von `setup.sh` ersetzen weiterhin nur die
Hub-eigenen Hook-Einträge (`_owner`-Sentinel) — fremde Hooks wie `moshi-hook`
bleiben erhalten.

### Datenfluss

```
Claude CLI ──Hook──> curl ──POST──> /api/hooks/:event
                                         │
                                         ▼
                            attention.reportHookEvent
                                         │
                                 ┌───────┴───────┐
                                 ▼               ▼
                       session-activity   session-attention
                       (immer, Badge)     (Notifiction-wert)
                                 │               │
                                 ▼               ▼
                            Frontend WS   Frontend WS
                            patchBadge    + Sound/Flash/Unread
```

### Broadcast-Typen (`lib/attention.js`)

- **`session-activity`** — reiner State-Update. Feuert bei JEDEM Hook-Event
  das die activity ändert, auch für attached + muted Sessions. Frontend
  patcht darauf die Badge inline via `patchActivityBadge()`. Payload:
  `{ type, name, activity, at }`.
- **`session-attention`** — Notification-wert. Feuert nur bei `Stop`/
  `Notification`, wenn die Session **unattached + nicht muted** ist und
  der Cool-Down (`HOOK_COOLDOWN_MS = 10s`) abgelaufen ist. Frontend spielt
  Beep, flasht die Card, markiert unread, zeigt Toast. Payload identisch.
- **Cool-Down gilt nur für `session-attention`**, nicht für
  `session-activity` — Badges sollen immer sofort stimmen.
- **Fremd-Attach-Suppression:** Ist eine Session von einem Nicht-Hub-Client
  (z.B. Moshi) attached (tmux meldet `session_attached`, der Hub hält aber
  keinen eigenen PTY — getrackt in `lib/attach-tracker.js`), unterdrückt der
  Hub die Push-Notification für diese Session.

### Event → Activity-Mapping

| Hook-Event        | activity | session-attention? |
|-------------------|----------|--------------------|
| `UserPromptSubmit`| working  | nein               |
| `Stop`            | idle     | ja (wenn unattached) |
| `SubagentStop`    | idle     | ja (wenn unattached) |
| `Notification`    | waiting  | ja (wenn unattached) |
| `SessionStart`    | —        | nein (State-Init)  |
| `SessionEnd`      | —        | nein (purge)       |

### Frische / Stale-Handling

`getHookActivity(name)` liefert null wenn der letzte Hook älter als
`HOOK_FRESH_MS = 60s` ist. `/api/sessions` fällt dann auf `unknown`
zurück — ehrlicher als ein veralteter Wert. Sobald der nächste Hook
kommt, ist der State wieder frisch.

### Rename-Handling

`CC_HUB_SESSION` wird beim `tmux new-session` gesetzt und bleibt im
Claude-Kindprozess auf dem ursprünglichen Namen, auch nach
`tmux rename-session`. Damit spätere Hook-POSTs trotzdem treffen:

- `server.js` hält einen `hookAlias: Map<origName, currentName>`, der bei
  jedem `PATCH /api/sessions/:name` via `aliasOnRename()` nachgezogen wird
  (inkl. Chain: A→B→C bleibt A→C *und* B→C).
- `resolveHookSession(envName)` im Hook-Endpoint löst den Alias auf.
- `attention.rename(old, neu)` verschiebt den State-Eintrag parallel,
  damit `getHookActivity(currentName)` auch nach dem Rename weiterhin
  funktioniert.

### Kaputtes Claude-Hook-JSON

Claude schickt gelegentlich syntaktisch invalides JSON auf stdin (z.B.
`{"line":}`). Die Hook-Route umgeht deshalb den globalen `express.json()`
und nutzt `express.raw()` + try/catch: Payload wird opportunistisch
geparst, bei Fehler als `{}` durchgereicht — der Endpoint wertet das
Payload eh nicht aus.

### Manuelles Unstick (Debugging)

Wenn das Badge in einem kaputten State feststeckt (z.B. durch einen
manuellen Test-POST):

```bash
AUTH=$(grep AUTH_TOKEN .env | cut -d= -f2)
curl -s -X POST "http://localhost:3333/api/hooks/Stop" \
  -H "Authorization: Bearer $AUTH" \
  -H "X-CC-Hub-Session: cc-<name>" \
  -H "Content-Type: application/json" -d '{}'
```

Nach 60s wäre der State ohnehin stale.

### Installation der Hooks in `~/.claude/settings.json`

`setup.sh` Schritt `[5/6]` merged idempotent via `jq` ein `hooks`-Block
pro Event mit Sentinel-Feld `"_owner": "claude-code-hub"`. Re-Runs
ersetzen nur Hub-eigene Einträge, User-eigene Hooks bleiben stehen.
Manueller Re-Install: `setup.sh` erneut laufen lassen.

## API-Endpunkte

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/sessions` | Liste aller tmux-Sessions mit Preview (`?preview=0` deaktiviert N+1-capture) |
| POST | `/api/sessions` | Neue Session erstellen (`{ name, directory, command }`). Name-Whitelist: `/^[\w\-. ]{1,64}$/`. |
| DELETE | `/api/sessions/:name` | Session beenden |
| PATCH | `/api/sessions/:name` | Session umbenennen (`{ newName }`) |
| GET | `/api/browse` | Verzeichnis-Picker (`?path=…&hidden=1`) für UI-Tree. Pfade werden auf `$HOME` eingeschränkt (403 sonst). |
| WS | `/api/terminal/:name` | WebSocket Terminal-Verbindung. Prüft Session-Existenz vor Attach; schließt mit `4004` wenn Session fehlt, `4001` bei Auth-Fehler. |
| POST | `/api/hooks/:event` | Von Claude-Code-Hooks aufgerufen (`Stop`/`Notification`/`UserPromptSubmit`/`SubagentStop`/`SessionStart`/`SessionEnd`). Auth via Bearer-Token, Session-ID über `X-CC-Hub-Session`-Header (aus `CC_HUB_SESSION`-Env). Triggert instant `session-attention`-Broadcast. |

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
- Frontend ist eine Single-File SPA — CSS und JS inline in index.html, kein Build-Step
- xterm.js, xterm-addon-fit und xterm-addon-web-links werden per CDN geladen; JetBrains Mono + Noto Sans Symbols liegen lokal in `public/fonts/`
- Fehlertexte im UI sind Deutsch, API-Error-Strings Englisch — bewusste Trennung zwischen User- und Dev-Ebene.
- `TMUX_MOUSE` (`.env`, default `on`) schaltet den server-globalen tmux
  Mouse-Mode. Auf `off` für Moshi-lastige Nutzung (native Touch-Selektion);
  dann ist Scroll-Wheel im Hub-Browser-Terminal deaktiviert.
- Adopt (`POST /api/sessions/:name/adopt`) registriert foreign Sessions unter
  ihrem **Originalnamen** (kein Rename auf `cc-`), damit der Name stabil bleibt,
  den Moshi benutzt. Nicht-`cc-`-Namen werden im Hub als vollwertig geführt.

## Entwicklung

Kein Build-Step, kein Linter. Unit-Tests via `node:test`, E2E via Playwright. Änderungen werden durch Neustart des Servers und Browser-Test / E2E-Run verifiziert.

```bash
# Server manuell starten (zum Testen)
npm start                                        # = node server.js
npm run dev                                      # identisch — kein Watcher/Hot-Reload

# Unit-Tests (lib/*.test.js)
node --test lib/*.test.js

# E2E-Tests (Playwright — Chromium + WebKit-Mobile)
npm run test:e2e                                 # beide Projekte
npm run test:e2e -- --project=chromium           # nur Desktop
npm run test:e2e -- --project=webkit-mobile      # nur iOS-Viewport
npm run test:e2e:ui                              # interaktiver Playwright-UI-Mode

# LaunchAgent neustarten (nach Code-Änderungen nötig, sonst läuft alte Version weiter)
launchctl kickstart -k gui/$(id -u)/com.claude-code-hub

# LaunchAgent stoppen (nötig vor manuellem `npm start`, sonst Port-Konflikt)
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.claude-code-hub.plist

# LaunchAgent erstmalig laden (nach Edit der plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.claude-code-hub.plist

# Logs
tail -f logs/stdout.log
tail -f logs/stderr.log
```

Setup auf frischem Mac: `./setup.sh` (installiert tmux/deps, generiert Token, richtet LaunchAgent ein).

## Usage Dashboard (v0.7.0)

### Datenquellen

Zwei Pipelines speisen das Dashboard:

1. **StatusLine-JSON** — Claude Code sendet bei jedem Status-Line-Render ein JSON-Objekt an `~/.claude/statusline-command.sh`. Das Script rendert die Zeile und sendet per curl ein Subset (rate_limits, cost, context_window, model) an `POST /api/hooks/statusline` (throttled: nur bei Wert-Änderung oder alle 60s). Daraus kommen: Live-Limit-Prozente mit Reset-Countdown, Session-Kosten in USD, Lines Added/Removed, API-Dauer.

2. **JSONL-Analyse** — `lib/usage.js` liest `~/.claude/projects/<mangled-cwd>/*.jsonl` und aggregiert: Token-Verbrauch pro Projekt, Tageszeit-Heatmap (7×24), Tool-Nutzung Top-10, Arbeitsweise (autonome Tool-Ketten vs. direkte Antworten), Cache-Hit-Rate, API-Errors, Sessions pro Tag, geschätzte Kosten.

### lib/usage-limits.js

In-Memory-State pro Session (`Map<sessionName, {...}>`), gespeist von `POST /api/hooks/statusline`. Historisches Limit-Log in `~/.claude-code-hub/usage-limits.jsonl` (append-only, 5MB Rotation, 5min Write-Throttle). Frische-Window: 120s — nach Ablauf gibt `getSessionStatusline()` null zurück.

Funktionen:
- `recordStatusline(name, data)` — In-Memory-State + Log
- `getSessionStatusline(name)` — aktueller State oder null
- `getAllSessionCosts()` — aggregiert über alle frischen Sessions
- `getLimitHistory({days})` — JSONL-Datenpunkte + Peak-Counts
- `rename(old, new)` / `forget(name)` — Lifecycle parallel zu attention.js

### Neue Endpoints

| Method | Route | Beschreibung |
|--------|-------|-------------|
| POST | `/api/hooks/statusline` | StatusLine-Daten empfangen. Auth via Bearer, Session via `X-CC-Hub-Session`. Tolerantes JSON-Parsing. |
| GET | `/api/usage/limits?days=7` | Limit-History + Peaks + aktuelle Werte (account-level via moshi-hook). 30s-Cache. |
| GET | `/api/usage/costs` | Aggregierte Kosten aus allen aktiven Sessions. 10s-Cache. |
| GET | `/api/recent-dirs` | Recency-rankte Arbeitsverzeichnisse via `moshi-hook cwd-list` (Quick-Pick im New-Session-Modal). |

`GET /api/usage/history?days=30` liefert jetzt das erweiterte Payload aus `getDailyUsageV2` (zusätzlich: byProject, heatmap, cacheRate, workStyle, toolUsage, dailySessions, errors).

### Wegfall: tmux capture-pane für Usage

`parseUsagePct5h`, `getSessionPreview` und der Preview-Cache sind entfernt. Session-Enrichment liest Limit-Daten aus dem StatusLine In-Memory-State. Session-Response enthält `limits` (pct5h, pct7d, resets5h, resets7d) und `cost` (totalUsd, durationMs, linesAdded, linesRemoved) statt `usagePct5h`.

### StatusLine-Script

`setup.sh` Schritt `[6/7]` installiert idempotent einen Reporting-Block in `~/.claude/statusline-command.sh` zwischen `#CCH-SL-START#` / `#CCH-SL-END#` Sentinel-Kommentaren. Re-Runs ersetzen nur den Hub-Block, User-Rendering bleibt erhalten.

## moshi-hook Daten-Schicht (Interop)

`moshi-hook` (CLI von getmoshi.app, via `brew tap rjyo/moshi`) wird von
`setup.sh` read-only installiert — **kein** Daemon/pair/install. `lib/moshi-hook.js`
kapselt fehlertolerant zwei Subcommands (Fehler/fehlende CLI → null):

- `getUsage()` ← `moshi-hook usage`: account-weite 5h/7d-Rate-Limits mit
  `accountLabel` + `agent` (multi-account). Speist das **account-level**
  Limit-Panel im Usage-Dashboard. Per-Session-Limit-Badges entfielen damit
  (Limits sind account-weit, nicht pro Session). Cost/Lines/Context kommen
  weiter aus dem StatusLine-Hook (`lib/usage-limits.js`, `recordStatusline`).
- `getRecentDirs()` ← `moshi-hook cwd-list --json`: recency-rankte Arbeits-
  verzeichnisse (claude/codex/cursor) → „Zuletzt benutzt"-Quick-Pick im
  New-Session-Modal mit Agent-Source-Badges.

`lib/usage-limits.js` schreibt die Limit-History account-keyed (`acct`-Feld
im jsonl; alte Punkte ohne `acct` → `default`), gespeist on-demand
(`GET /api/usage/limits`) + 5-min-Poll. Routen: `GET /api/usage/limits`
(account-level), `GET /api/recent-dirs`.

## Multi-CLI Spawn (Kern-Drei)

`public/clis.js` ist die einzige Registry der unterstützten Coding-CLIs
(claude/codex/gemini) — `CLIS` (id, label, binary, color, variants) +
`cliFromCommand(cmd)` (leitet die CLI aus dem Command-String ab). Browser
(`import('./clis.js')`) und `node:test` nutzen dieselbe Datei, kein Build-Step.

- **New-Session-Modal:** CLI-Picker (Icon-Buttons je CLI) + ein Varianten-
  `<select>` (id bleibt `new-session-cmd`, daher `createSession` unverändert).
  Varianten decken die Approval-Stufen ab (z.B. codex `--full-auto`/`--yolo`,
  gemini `--approval-mode auto_edit`/`--yolo`). `POST /api/sessions` nimmt den
  gewählten `command` unverändert entgegen.
- **Session-Card:** ein CLI-Badge (`cliFromCommand(s.command)`) auf running
  und dormant Cards. `GET /api/sessions` reicht `command` jetzt auch für
  running Sessions nach (aus known-sessions), damit das Badge dort greift.
- Auth ist out-of-scope: jede CLI nutzt ihren eigenen Login; fehlende CLI →
  Session stirbt mit dem bestehenden „nicht im PATH"-Hinweis. Cursor/opencode/
  kimi/qwen sind (noch) nicht dabei.

## Diff-Viewer (Spec 2)

Native Diff-View pro Session: zeigt die uncommitteten Änderungen der Session-cwd (unstaged/staged/untracked), Einstieg über den klickbaren Git-Badge der Session-Card.

### lib/git-diff.js

- `parseStatusV2(raw)` — reiner Parser für `git status --porcelain=v2 --branch -z` (NUL-getrennt) → `{ branch, ahead, behind, files:[{category:'unstaged'|'staged'|'untracked', path, oldPath?, status}] }` oder `null`. Eine Datei kann gleichzeitig staged + unstaged sein (erscheint dann in beiden Kategorien). Renames (Record-Typ `2`) liefern `oldPath`. `server.js` `getGitStatus` nutzt denselben Parser (DRY — leitet `dirty` aus `files.length > 0` ab).
- `getDiff(cwd, { maxFileBytes = 200_000, maxUntracked = 100 })` — liefert pro Datei `additions/deletions/binary/oversize/diff`. **Gebündelte git-Aufrufe statt pro Datei:** `git diff` + `git diff --cached` (Multi-File-Unified-Diff, client-seitig an `diff --git`-Grenzen gesplittet) + `git diff --numstat -z` + `git diff --cached --numstat -z` (Counts; `-z` damit Renames sauber zugeordnet werden). Untracked Dateien einzeln via `git diff --no-index -- /dev/null <path>` (exit 1 → Diff aus `err.stdout`), gedeckelt durch `maxUntracked`. binary/oversize → `diff:null`. Alle Aufrufe via `execFileSync('git', [argv])`, kein Shell-Interp.

### Route + Live-Refresh

- `GET /api/sessions/:name/diff` — `validSessionName`-Check (400), cwd via `resolveSessionCwd` (live `tmux display-message #{pane_current_path}`, sonst known-sessions `directory`; 404 wenn unauflösbar), dann `getDiff(cwd)`. `isRepo:false` → 200 mit `{isRepo:false}`.
- WS `/api/files/events` zusätzlich zu `{subscribe:<projectId>}` jetzt `{subscribeSession:<name>}` / `{unsubscribeSession:<name>}` (synthetische projectId `'session:'+name`, watcht die Session-cwd). Diff-View re-fetcht debounced (~300ms) bei Watcher-Events.

### Frontend (public/index.html)

- 5. View `data-view="diff"` (`DiffView`-IIFE). Einstieg: klickbarer Git-Badge (`renderGitBadge(git, sessionName)` → `data-diff-session`), delegierter capture-phase-Handler mit `stopPropagation` (öffnet Diff statt Terminal). Badge ist auf running-, dormant- UND foreign-Cards (foreign = z.B. Moshi-gestartete Sessions, deren cwd der Backend per tmux auflöst).
- Diff-Rendering via **diff2html** (lazy CDN-ESM, Dark-Teal-getrimmt; bei Ladefehler `<pre>`-Fallback). Responsive: side-by-side ≥900px, line-by-line <900px. Datei-Liste links gruppiert (UNSTAGED/STAGED/UNTRACKED), Diff rechts.

### Bekannte Grenzen

- **Staging triggert kein Live-Event:** Der File-Watcher ignoriert `.git` (`IGNORE_TOP`), daher aktualisiert `git add`/`git reset` die staged/unstaged-Aufteilung nicht automatisch — nur Arbeitsbaum-Inhaltsänderungen. Der manuelle Refresh-Button im Header deckt das ab.
- **File-Watcher stale-root bei Namens-Wiederverwendung:** Die `session:<name>`-Watcher-State wird nach unsubscribe 30s gecacht und re-pointet `root` nicht. Wird innerhalb dieses Fensters eine gleichnamige Session mit anderer cwd erzeugt, watcht der Live-Refresh kurzzeitig die alte cwd. Real-world-Impact gering; manueller Refresh deckt es ab.

### Tests

- Unit `lib/git-diff.test.js`: `parseStatusV2` (Kategorisierung, Rename-oldPath, null) + `getDiff` (Temp-Repo: Kategorien, Multi-File-Split, binary/oversize, Rename-Counts via numstat -z, Nicht-Repo).
- E2E `tests/diff-viewer.spec.js`: foreign tmux-Session in dirty Temp-Repo → Badge öffnet Diff-View, Datei-Liste, Render (diff2html bzw. `<pre>`-Fallback offline), viewport-abhängiges Format, Live-Refresh.

## Image-Paste & Annotation

Bild in eine Claude-Session geben: per Clipboard-Paste, Picker-Button oder Drag&Drop, optional mit Basis-Markup annotieren, dann landet das PNG in `<cwd>/.cch-images/` und der cwd-relative Pfad wird als `@`-Mention in die Terminal-Input-Zeile injiziert (Claude hängt das Bild an).

### lib/session-images.js

Express-frei, reuse des Path-Guards aus `lib/files.js` (`resolveSafe`) — kein eigener Guard.

- `saveSessionImage(cwd, buffer, { ext = 'png' })` — legt `.cch-images/` an, schreibt `<YYYY-MM-DD-HHMMSS>.png` (kollisionssicher mit `-1/-2/…`-Suffix), stellt einen `.gitignore`-Eintrag `.cch-images/` idempotent sicher (auch im Nicht-Repo harmlos), ruft lazy `cleanupOldImages`. Liefert `{ rel, abs }`.
- `cleanupOldImages(cwd, { maxAgeDays = 7 })` — best-effort, löscht PNGs älter als 7 Tage; fehlender Ordner = No-Op.

### Route

- `POST /api/sessions/:name/image` — `validSessionName` (400), cwd via `resolveSessionCwd` (404), Body = rohes `image/png` (`express.raw`, ≤8 MB → 413), `saveSessionImage` → `{ rel }`. Path-Guard-Escape → 403. Vom globalen `writeLimiter` gedeckt (kein per-Route-Bucket). Registriert vor dem `app.get('*')`-Catch-all.

### Frontend (public/index.html)

- **`ImageAnnotator` IIFE** — Modal im FilePreview-Stil: Bild auf `<canvas>` + Overlay-Canvas. Toolbar Pfeil/Box/Stift/Text/Undo, **eine** Farbe (Rot `#ff3b30`), **eine** Strichbreite. Oversize-Downscale auf ≤2000px Kante. „Senden" flacht beide Layer via `toBlob` zu einem PNG; `open(blob)` → `Promise<Blob|null>` (Cancel/Esc/Backdrop → null).
- **`ImagePaste` Glue** — `annotateAndSend(blob)` öffnet den Annotator und POSTet das Ergebnis an die Route, dann `injectMention(rel)` → `currentWs.send({type:'input', data:'@'+rel+' '})` (Trailing-Space, **kein** Auto-Enter). Quellen: immer sichtbarer Picker-Button (`#image-picker-btn` + verstecktes `accept=image/*`), Clipboard-Paste (Bild in `clipboardData.items` → Annotator statt `term.paste`), Drag&Drop (erstes Bild → Annotator, Nicht-Bilder → bestehender `Uploader`). Fehler-Toasts inkl. 404→noCwd, 413→tooLarge. `window.currentWs`/`window.term` werden dafür exponiert.

### v1-Grenze

Der `@`-Mention-Mechanismus ist Claude-spezifisch. Für codex/gemini hängt `@` das Bild **nicht** an (dokumentierte v1-Limitation) — die Datei liegt trotzdem in `.cch-images/` und der Pfad kann manuell genutzt werden.

### Tests

- Unit `lib/session-images.test.js`: Save+Dateiname-Format, idempotenter `.gitignore`-Ensure (+ Erhalt bestehender), Path-Guard-Escape, `cleanupOldImages`-Age-Filter.
- E2E `tests/image-paste.spec.js` (desktop+mobile): Picker öffnet Annotator, Toolbar, Tool-Auswahl, Senden trifft Endpoint + schließt Modal, 404→noCwd-Toast; ein `fixme` für präzise Canvas-Strich-Pixel.
## Browser-Preview

In-App Live-Vorschau eines lokalen Dev-Servers (mit HMR) als Split-Panel rechts vom Terminal. Da der Remote-Browser `localhost:<port>` des Macs nicht direkt erreicht, **reverse-proxied der Hub** den Dev-Server. **Single-Host-Modell:** ein fixer Host `preview.<PREVIEW_DOMAIN>` (z.B. `preview.code.derremo.xyz`) — bewusst nur **eine** Ebene tief, damit das bestehende Universal-SSL-Wildcard `*.<domain>` ihn deckt (**kein ACM**, **kein Catch-all-Blast-Radius**). Welcher Port dahinter steckt, ist serverseitiger State (`activePreviewPort`), gesetzt per `POST /api/preview/select` → **eine Preview zur Zeit**. Feature aus, wenn `PREVIEW_DOMAIN` (`.env`) leer ist.

> Historie: ursprünglich als Wildcard `<port>.preview.<domain>` entworfen (Spec/Plan), aber die dritte Ebene wird von Universal SSL nicht gedeckt → hätte ACM ($10/Mo) erfordert. Umbau auf das Single-Host-Modell (Idee E) hält es gratis.

### lib/preview-proxy.js

- `isPreviewHost(host, previewHost)` — Exact-Match auf den fixen Host (strippt `:port`, case-insensitive) → bool.
- `proxyHttp(req,res,port)` / `proxyWs(req,socket,head,port)` — Forwarding via `http-proxy` mit `changeOrigin:true` (schreibt den Upstream-Host auf `localhost:<port>` → umgeht Vites `allowedHosts`-Reject; der Browser-HMR-Client bildet seine WS-URL aus `location` = der fixe Host).
- `attachUpgrade(server, {previewHost, getPort})` — **koexistiert mit express-ws**: greift dessen `upgrade`-Listener ab, entfernt sie und installiert einen Dispatcher, der den Preview-Host an `proxyWs(getPort())` gibt (oder den Socket killt wenn kein aktiver Port) und alle anderen Upgrades (Hub-WS) an die ursprünglichen Listener **delegiert** (genau ein Pfad pro Upgrade — blosses `prependListener` würde doppelt handshaken). Muss nach `const server = app.listen()` aufgerufen werden.

### lib/port-scan.js

`parseLsof(raw,{excludePort})` + `listListeningPorts({excludePort})` über `lsof -nP -iTCP -sTCP:LISTEN` (Absolutpfad-Fallback `/usr/sbin/lsof`, da im LaunchAgent-PATH nicht vorhanden). Dedup IPv4/IPv6, Hub-Port + `<1024` raus, fehlertolerant `[]`.

### server.js

- **Host-Dispatch-Middleware** ganz oben (vor Auth/Static/JSON/Catch-all): `isPreviewHost` → `previewPortReady()` (aktiver Port gesetzt UND noch lauschend = SSRF-Guard; sonst 503-Hinweisseite) → `proxyHttp`. CF Access hat am Tunnel-Edge schon authentifiziert.
- **`server.on('upgrade')`** via `attachUpgrade({previewHost, getPort: previewPortReady})` (nur wenn `PREVIEW_ENABLED`).
- Routen `GET /api/preview/config` (`{enabled, host, activePort}`) + `GET /api/preview/ports` (`{ports:[{port,process}]}`) + `POST /api/preview/select` (`{port}` | `{port:null}`, validiert Range + lauschend, setzt `activePreviewPort`).
- Dynamisches CSP `frame-src blob: https://preview.<domain>` wenn aktiviert.

### Frontend (public/index.html)

- **`PreviewPanel` IIFE** — Split-Panel rechts vom Terminal mit FileBrowser-artigem Resizer (`--preview-width`) + Toggle-Button. Header: **Port-Combobox** (ein Feld `#preview-port-input` + Chevron → themengetreue Liste `#preview-port-list` der erkannten Ports aus `/api/preview/ports`; frei tippbar, Tippen filtert, ↑/↓/Enter/Klick wählt), Reload, „In neuem Tab", Schließen. Port-Wahl → `POST /api/preview/select {port}`, dann iframe auf den **fixen** Host `https://preview.<domain>/?__cchub=<port>` (Query nur als Cache-Bust fürs Reload). Zuletzt genutzter Port pro Session in `localStorage`; „nicht konfiguriert"-Overlay wenn `config.enabled:false`. Aktiviert in `connectToSession`.

### Auth / Infra

CF Access auf dem fixen Host `preview.<domain>` (dieselbe Policy wie der Hub → SSO-Cookie geteilt, iframe lädt authentifiziert). Cloudflare-Setup (token-/dashboard-verwalteter Tunnel): **1×** DNS `CNAME preview → <tunnel-id>.cfargotunnel.com` (proxied), **1×** Public Hostname `preview.<domain> → localhost:<PORT>`, Host zur Access-App. Kein Wildcard, kein ACM. `setup.sh`-Schritt `[4/8]` setzt `PREVIEW_DOMAIN` + druckt die Checkliste.

### Bekannte Grenzen

- **Eine Preview gleichzeitig** (ein fixer Host + ein `activePreviewPort`-State).
- **Apps mit hartkodierten absoluten Origin-URLs** können fehlrouten (kein Body-Rewriting).
- **Vite-HMR-Client-Port:** bei Bedarf `server.hmr.clientPort: 443` im Dev-Projekt setzen, falls der Browser-Client die WS-URL falsch berechnet (Proxy/HMR-Serving selbst ist lokal end-to-end bewiesen).
- **HMR-CF-Kette** ist nicht in Playwright nachstellbar → manuell/lokal verifiziert.

### Tests

- Unit `lib/preview-proxy.test.js` (`isPreviewHost`-Fälle, echter HTTP-Round-Trip inkl. `changeOrigin`, WS-Upgrade-Proxy + express-ws-Koexistenz, kein-aktiver-Port-Kill) + `lib/port-scan.test.js` (lsof-Fixture).
- E2E `tests/browser-preview.spec.js` (desktop+mobile): Panel öffnet/toggelt, Port-Dropdown aus gemocktem Endpoint, Port-Wahl POSTet an `/select` + lädt den fixen Host, „nicht konfiguriert"-State; ein `fixme` für echtes Proxy/HMR/CF.

## Voice-Input

Sprache ins Terminal diktieren: Mic-Button in der Terminal-Toolbar (Toggle: Klick an / Klick aus), lokale Transkription via whisper.cpp auf dem Mac, der deutsche Text landet **ohne Enter** in der Eingabezeile (gleiches Inject-Muster wie die `@`-Mention) — der User reviewt und schickt selbst ab.

### lib/voice.js

Express-frei, unit-testbar. Liest Env **in** den Funktionen (nicht modul-top), damit Tests pro Fall frische Werte setzen.

- `resolveBin()` — whisper-cli-Pfad. **`WHISPER_BIN` ist autoritativ** (gesetzt → nur dieser Pfad, kein Fallback); sonst `/opt/homebrew/bin/whisper-cli` → `/usr/local/bin/whisper-cli`; sonst `null`.
- `modelPath()` / `langDefault()` — `WHISPER_MODEL` (default `~/.claude-code-hub/models/ggml-large-v3-turbo-q5_0.bin`) bzw. `VOICE_LANG` (default `de`).
- `isEnabled()` — `false` wenn `VOICE_ENABLED=false`; sonst `true` gdw. bin auflösbar **und** Modell-Datei existiert. Gated den Button (Button versteckt wenn aus) — Muster wie `PREVIEW_DOMAIN`.
- `transcribe(wavBuffer, {lang})` — schreibt Buffer in ein frisches Temp-Verzeichnis (`cch-voice-`), ruft whisper via **async `execFile`** (promisified, argv-array — **NICHT** `execFileSync`: eine 1–2s-Transkription darf den Event-Loop nicht blockieren; Argv erfüllt die No-Shell-Interp-Konvention) mit `-m <model> -l <lang> -nt -otxt -of <base> -f <wav>`, liest `<base>.txt`, liefert `{text}`. **Single-Flight-Guard** (`inFlight`): parallele Aufrufe → `code:'BUSY'`. Temp-Cleanup + `inFlight`-Reset im äußeren `finally` (auch wenn `mkdtempSync` wirft). Timeout 30s.

### Engine / Modell

Homebrew `whisper-cpp` (**Metal**-Build out-of-the-box auf Apple Silicon), Modell **`ggml-large-v3-turbo-q5_0`** (~574 MB / 547 MiB, multilingual, gute Deutsch-Genauigkeit) — auf M-Series ~1–2s/kurzer Clip. **CoreML/ANE** (~3× Encoder-Speedup) ist ein optionaler späterer Tune (Source-Build `-DWHISPER_COREML=1` + CoreML-Modell), bewusst **nicht** in v1. `setup.sh`-Schritt `[8/9]` installiert Binary + lädt das Modell idempotent + schreibt `.env`-Vars.

### Routen

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/voice/config` | `{enabled}` — Feature-Gate fürs Frontend |
| POST | `/api/voice/transcribe` | Roher `audio/wav`-Body (`express.raw`, ≤10 MB → 413). Bearer-Auth, session-agnostisch. Liefert `{text}`. `BUSY`→429, bin/Modell fehlt→503, Fehler→500. |

### Frontend (`VoiceInput` IIFE, public/index.html)

- Mic-Button `#voice-btn` neben `#image-picker-btn`, nur sichtbar wenn `/api/voice/config` `{enabled:true}` (Fetch in `connectToSession` → `refreshConfig()`).
- **Audio-Capture client-seitig:** `getUserMedia` → `AudioContext` + `ScriptProcessorNode` (iOS-Safari-kompatibel), Float32-PCM gesammelt, beim Stop auf **16 kHz Mono downsamplet + 16-bit-PCM-WAV** encodet (vanilla JS, **kein ffmpeg**). POST an `/api/voice/transcribe`.
- States: idle / `voice-recording` (pulsierend rot + Sekunden-Timer, Auto-Stop bei 60s) / `voice-busy` (Spinner). **Re-Entrancy-Guard** (`busy`-Flag) verhindert Doppel-Start während des `getUserMedia`-await; AudioContext-Setup in eigenem try/catch → `teardown()` räumt einen schon geholten Mic-Stream wieder auf.
- Inject: `currentWs.send({type:'input', data: text+' '})` (Trailing-Space, **kein** `\r`). Fehler-Toasts (DE-UI / EN-API): Permission/NoDevice/Empty/Busy/TooLong/Disabled/Failed.

### v1-Grenzen

Eine Transkription gleichzeitig (Single-Flight). Batch-Transkription (kein Live-Streaming). `@`-Mention-Inject ist Claude-spezifisch — für codex/gemini hängt es nichts an (wie bei Image-Paste), der Text landet aber trotzdem in der Eingabezeile. CoreML/ANE nicht in v1.

### Tests

- Unit `lib/voice.test.js`: `isEnabled`-Gating (bin/Modell/`VOICE_ENABLED`), `transcribe` gegen Fake-whisper-Stub-Script (Argv, Trim, `lang`-Passthrough), Single-Flight-`BUSY` + Reset, Temp-Cleanup bei whisper-Fehler.
- E2E `tests/voice-input.spec.js`: Config-Gating (Button sichtbar/versteckt), Permission-Denied-Toast, Toggle-`recording`-State. Mic-abhängige Tests werden auf **WebKit** geskippt (`navigator.mediaDevices` im http-Kontext undefined, Fake-Media nicht unterstützt) → nur Chromium; ein `fixme` für die echte Audio-Pipeline (Playwright emittiert keine echten Audio-Frames).

## Bekannte Einschränkungen

- tmux-Socket wird beim ersten `tmux new-session` automatisch erstellt
- node-pty erfordert Xcode Command Line Tools zum Kompilieren
- `claude` CLI muss im PATH sein. `server.js` ergänzt `~/.local/bin`, `/opt/homebrew/bin` und `/usr/local/bin` zur Laufzeit; der LaunchAgent-PATH selbst bleibt minimal.
- LaunchAgent-plist **muss** Mode `644` haben — launchd verweigert world-writable Dateien stillschweigend mit `Bootstrap failed: 5: Input/output error`. `setup.sh` setzt das automatisch; bei manuellem Edit der plist daran denken.
- tmux muss beim Attach mit `-u` aufgerufen werden, damit es im UTF-8-Mode läuft; außerdem setzt `server.js` `LANG`/`LC_CTYPE` im PTY-Env. Ohne beides ersetzt tmux Multi-Byte-Zeichen (Umlaute, ⏺ ⎿ ✻) durch `_`.
- tmux mouse mode wird beim Server-Start mit `set-option -g mouse on` aktiviert. Ohne das funktioniert Scroll-Wheel im xterm-Terminal nicht, weil tmux keine Wheel-Events an den Client forwarded.
