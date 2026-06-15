# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Penates

Web-Interface zum Verwalten und Fernsteuern von Coding-CLI-Sessions (claude/codex/antigravity) auf macOS (Apple Silicon + Intel). Installierbare PWA, optional remote über einen Cloudflare-Tunnel.

## Projektstruktur

```
penates/
├── server.js            # Express + WebSocket Backend (node-pty, tmux). ES Modules.
├── lib/                 # Backend-Module, je ein Bereich + danebenliegende *.test.js
├── public/
│   ├── index.html       # Single-Page Frontend (Vanilla JS, xterm.js, inline CSS/JS)
│   ├── clis.js          # CLI-Registry (claude/codex/antigravity) — shared Browser + node:test
│   ├── prefs.js         # Client-Prefs (Theme, Sprache, …)
│   ├── usage-format.js  # geteilte Usage-Formatierung
│   ├── sw.js            # Service Worker (PWA + Push)
│   ├── manifest.webmanifest
│   ├── locales/         # i18n-Bundles (en, de)
│   ├── vendor/xterm/    # Vendored xterm 6.0 + Addons (fit, web-links, webgl, unicode-graphemes)
│   ├── fonts/           # Lokale Webfonts (JetBrains Mono, Noto Sans Symbols)
│   └── icons/           # PWA-Icons
├── tests/               # Playwright E2E-Specs
├── scripts/             # Hilfsscripts
├── package.json         # Runtime-Deps: express, express-ws, node-pty, busboy, http-proxy, jose, web-push, dotenv
├── .env / .env.example  # Konfiguration (PORT, AUTH_TOKEN, PREVIEW_DOMAIN, WHISPER_*, TMUX_MOUSE, PENATES_HOME, …)
├── setup.sh             # Installationsscript (deps, .env, LaunchAgent, Hooks, StatusLine)
├── logs/                # stdout.log, stderr.log
├── ROADMAP.md           # Lebendes Roadmap-Dokument (siehe „Roadmap / Planung")
└── CLAUDE.md
```

Jeder Feature-Bereich hat ein `lib/`-Modul (Express-frei + unit-testbar) plus dünne Routen in `server.js` und ein Frontend-IIFE in `index.html`. Wichtige Module: `files.js`/`file-watcher.js` (Filebrowser), `attention.js`/`attach-tracker.js` (Hook-State + Notifications), `usage.js`/`usage-limits.js`/`pace.js` (Usage), `moshi-hook.js`/`antigravity-usage.js` (Interop), `git-diff.js` (Diff-Viewer), `session-images.js` (Image-Paste), `preview-proxy.js`/`port-scan.js` (Browser-Preview), `voice.js` (Voice-Input), `scrollback.js`/`backoff.js` (Connection-Robustness), `projects.js`/`roadmap.js`/`roadmap-writer.js`/`project-watcher.js` (Projekte/Roadmap/Changelog), `board.js` (Idea-Pipeline-Board → `board.json`), `settings.js`/`server-control.js` (Settings), `approvals.js`, `audit-log.js`, `cf-access.js`, `i18n.js`, `push-subscriptions.js`/`vapid.js`, `known-sessions.js`, `rate-limit.js`, `mutations.js`.

## Roadmap / Planung & Board (Idea Pipeline Phase 1)

**Planungs-Dokument pro Projekt ist seit dem Idea-Pipeline-Cutover (2026-06-09) `CHANGELOG.md`** (vorher `ROADMAP.md`). `lib/projects.js`/`project-watcher.js` lesen über `resolveProjectDoc(path)` — **`CHANGELOG.md` bevorzugt, `ROADMAP.md` als Fallback** (un-migrierte Projekte funktionieren weiter). Für das Hub-Repo selbst ist `CHANGELOG.md` **git-getrackt** (die Migration hat die `ROADMAP.md`-Zeile aus `.gitignore` entfernt). Struktur folgt weiter dem `lib/roadmap.js`-Parser:

- **`## Released: vX.Y.Z`** — was aktuell live ist.
- **`## In Entwicklung: vA.B.C`** — woran gerade gearbeitet wird.
- **`## Changelog`** — Narrative pro Release, freies Markdown.

**Der Backlog wohnt jetzt auf dem globalen Board, nicht mehr im Doc.** `## Backlog / Ideen` ist aus den Plan-Dokumenten entfernt; die Detail-View rendert nur noch Released / In-Dev / Changelog. Vor neuer Feature-Arbeit das `CHANGELOG.md` + die Board-Karten des Projekts lesen.

**Board (Kanban):** `lib/board.js` (Express-frei, atomare Persistenz nach `known-sessions.js`-Vorbild → `~/.penates/board.json`) hält die Karten. Eine Karte = eine Idee mit `{projectId, title, priority, stage, origin, theme, order}`. **Stage-Keys (stabil/englisch):** `idea | brainstorming | spec | implement | review | done` (UI-Labels via i18n). Routen `GET/POST/PATCH/DELETE /api/board/cards` (Mutationen unter dem globalen `writeLimiter`); `board.load()` + hub-only `migrateBacklog()` (idempotent, skip bei vorhandener `CHANGELOG.md`) beim Boot. Frontend: neue Top-Level-View „Board" (`data-view="board"`, `BoardView`-IIFE) — 6 Spalten, HTML5-Drag = Stufenwechsel (`PATCH {stage}`), Projekt-Filter, `+ Idee` (POST), rechtes Detail-Panel (Titel/Prio/Stage editierbar, 2-Klick-Delete; Mobile-Stage-Dropdown als Drag-Fallback).

**Cleanup bei Move→Done:** jeder Übergang einer Karte nach `done` (manueller Drag/Dropdown-PATCH **und** `/finish`) läuft durch den geteilten, idempotenten `finalizeCardToDone(card, reqMeta)`-Helper in `server.js`: erst die laufende Session killen (falls `sessionRef` in tmux lebt), dann den Worktree `--force` entfernen, dann den Branch sicher mit `git branch -d` löschen (ungemergt → bleibt erhalten; `lib/worktree.js#branchExists` ermittelt das Ergebnis nach dem `-d`-Versuch). Die PATCH-Response trägt eine `cleanup`-Summary; das Frontend (`applyTransition`) zeigt davor einen Destruktiv-Confirm (nur wenn die Karte `branch`/`worktreePath`/`sessionRef` hat — reine Ideen-Karten ziehen lautlos) und danach einen Ergebnis-Toast. Best-effort: ist das Projekt nicht mehr registriert (`repo` null), bleiben Worktree/Branch — die Boot-Reconciliation räumt den Worktree später. `review→done` läuft weiter über `/finish` (Merge+Push), das jetzt denselben Helper als Safety-Net nutzt.

**Capture-Idea** (Terminal-Toolbar) legt jetzt eine Board-Karte an (`POST /api/board/cards {stage:'idea', origin:'solo'}`) statt eines Backlog-Items. **Overview-Session-Cards** zeigen ein Projekt-Badge (cwd → Registry-Match via `getProjectsSync()`, `project`-Feld in `GET /api/sessions`).

Items in Released/In-Dev werden im Hub-Detail-View getoggelt (`PATCH /api/projects/:id/items`); nach Abschluss Checkbox abhaken + im Changelog vermerken.

**Parser-Regeln beim manuellen Editieren des `CHANGELOG.md`:** nur Top-Level-Checkboxen (keine Indents), keine `{}` im Item-Text (kollidiert mit Meta-Suffix), keine Control-Chars. Änderungen via Hub sind parser-safe validiert. **Board-Karten:** nie `board.json` von Hand editieren (atomarer Store) — über die API/UI.

## Architektur

- **Backend:** Express.js (default Port 3333, via `PORT`). REST für Session-/Projekt-/Usage-CRUD, WebSocket für Terminal-Zugriff via node-pty. ES Modules. Durchgehend `execFileSync`/`execFile` mit Argv-Arrays — **kein** Shell-Interpolation, kein Injection-Risiko.
- **Frontend:** Single HTML-Datei (`public/index.html`) mit inline CSS/JS. Kein Build-Step, keine Frameworks, kein clientseitiges Routing — Express fällt alle nicht-API-Routen auf `index.html` zurück. Geteilter Code (`clis.js`, `prefs.js`, `usage-format.js`, `i18n.js`) liegt als eigene ESM-Datei und wird sowohl im Browser als auch in `node:test` genutzt.
- **Sessions:** tmux-Sessions mit Prefix `cc-`. Jede startet einen Befehl (default: `claude`) in einem Projektverzeichnis. Das Backend hält keinen eigenen Session-State — tmux ist die Source of Truth. `GET /api/sessions` ruft `tmux list-sessions`; Limit/Cost-Daten kommen aus dem StatusLine-In-Memory-State (kein `capture-pane` mehr, siehe „Usage Dashboard").
- **Auth:** Bearer-Token aus `.env`. Das Frontend holt den Token beim ersten Laden per `prompt()` und speichert ihn im `localStorage` (`penates_token`) — er steht **nicht** im HTML. REST: `Authorization: Bearer <token>`; WebSocket: `Sec-WebSocket-Protocol: bearer.<token>` (`?token=` als Migrations-Fallback).
- **Remote-Zugriff:** optional via Cloudflare Tunnel auf eine eigene Domain → `localhost:<PORT>`; CF Access authentifiziert am Edge (`lib/cf-access.js` validiert das JWT via `jose`).
- **Auto-Start:** macOS LaunchAgent (default `com.penates`, via `LAUNCHAGENT_ID`). Template in `setup.sh`.
- **State-Dir:** persistenter Hub-State (`settings.json`/`sessions.json`/`board.json`) liegt unter `~/.penates`, überschreibbar via `PENATES_HOME` (`lib/penates-home.js`, lazy — von den settings/known-sessions/board-Stores genutzt). Primär ein Test-Seam (Unit-Tests + E2E isolieren darüber, damit kein Testlauf echten State anfasst).
- **Graceful Shutdown:** bei `SIGTERM`/`SIGINT` werden alle aktiven PTYs gekillt, bevor der Server schließt.

## API-Endpunkte

| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/sessions` | Liste aller tmux-Sessions (inkl. `command`, `limits`, `cost`; `?preview=0` legacy) |
| POST | `/api/sessions` | Session erstellen (`{ name, directory, command }`). Name-Whitelist `^[\w\-. ]{1,64}$` |
| DELETE | `/api/sessions/:name` | Session beenden |
| PATCH | `/api/sessions/:name` | Umbenennen (`{ newName }`) |
| POST | `/api/sessions/:name/adopt` | Foreign Session unter Originalnamen registrieren (kein `cc-`-Rename) |
| GET | `/api/sessions/:name/diff` | Uncommittete Änderungen der Session-cwd (Diff-Viewer) |
| GET | `/api/sessions/:name/scrollback?lines=N` | tmux-History für Reconnect-Replay |
| POST | `/api/sessions/:name/upload` | Upload in Session-cwd (Busboy multipart) |
| POST | `/api/sessions/:name/image` | Einzelnes PNG (`express.raw image/png`, ≤8 MB) → `.penates-images/`, liefert `{rel}` |
| GET | `/api/browse` | Verzeichnis-Picker (`?path=…&hidden=1`), auf `$HOME` beschränkt (403 sonst) |
| WS | `/api/terminal/:name` | Terminal-WS. Close `4004` Session weg, `4001` Auth-Fehler |
| WS | `/api/files/events` | Live-Updates: `{subscribe/unsubscribe projectId}`, `{subscribeSession/unsubscribeSession name}` |
| POST | `/api/hooks/:event` | Claude-Code-Hooks (`Stop`/`Notification`/`UserPromptSubmit`/`SubagentStop`/`SessionStart`/`SessionEnd`), Session via `X-Penates-Session` |
| POST | `/api/hooks/statusline` | StatusLine-Daten (rate_limits, cost, context, model) |
| GET | `/api/usage/limits?days=7` | Account-Level-Limits + History + Peaks |
| GET | `/api/usage/costs` | Aggregierte Kosten aller frischen Sessions |
| GET | `/api/usage/history?days=30` | Erweitertes JSONL-Aggregat (`getDailyUsageV2`) |
| GET | `/api/recent-dirs` | Recency-rankte Arbeitsverzeichnisse (`moshi-hook cwd-list`) |
| `*` | `/api/projects/*` | Projekt-CRUD + Roadmap-Items (`PATCH …/items`) + Filebrowser (siehe unten) |
| `*` | `/api/board/cards` | Board-Karten (Idea Pipeline): `GET ?projectId`, `POST`, `PATCH :id` (stage/order via `moveCard`, sonst `updateCard`), `DELETE :id` |
| `*` | `/api/preview/*`, `/api/voice/*`, `/api/settings`, `/api/server/*` | Feature-Routen (siehe jeweilige Abschnitte) |
| GET·POST | `/api/mata/status`, `/api/mata/control` | Mata iOS-Simulator: Status (`installed/running/portOpen`) + start/stop/restart (siehe „Mata-Integration") |
| POST | `/api/sessions/:name/mata-capture` | Simulator-Frame → `.penates-images/` → `@`-Mention (reuse `saveSessionImage`) |

## WebSocket-Protokoll

**Client → Server** (Text-Frames, JSON): `{type:"input", data}` (Tastatur), `{type:"resize", cols, rows}`, `{type:"ping"}` (Heartbeat).

**Server → Client:** Binary-Frames = rohe PTY-Bytes (UTF-8; xterm dekodiert chunkboundary-sicher via `term.write(Uint8Array)`). Text-Frames: `{type:"error", message}`, `{type:"pong"}`.

**Auth-Handshake:** `new WebSocket(url, ["bearer." + token])` — Subprotocol `bearer.<token>`; der Server echo't das Protocol zurück (`wsOptions.handleProtocols`).

## Konventionen

- **Sprache im UI:** umschaltbar EN/DE (`lib/i18n.js` + `public/locales/`), Default `en`. API-Error-Strings bleiben Englisch — bewusste Trennung User- vs. Dev-Ebene.
- **Design:** Catppuccin (4 Flavors `latte`/`frappe`/`macchiato`/`mocha`, Default `latte`), Teal-Akzent. Bricolage Grotesque (Display) + Inter (UI) von Google Fonts, JetBrains Mono (Code) lokal in `public/fonts/`.
- **Sessions:** automatischer Prefix `cc-` (auch beim Rename). Adopt registriert foreign Sessions unter ihrem **Originalnamen** (stabil für Moshi). Name-Whitelist `^[\w\-. ]{1,64}$` → 400 bei Verletzung.
- **Kein Shell-Interp:** alle `tmux`/`git`/Tool-Aufrufe via `execFileSync`/`execFile` mit Argv-Array — bei Erweiterungen dasselbe Muster.
- **Frontend** ist eine Single-File SPA (inline CSS/JS), kein Build-Step. xterm 6.0 + Addons sind **vendored** unter `public/vendor/xterm/`.
- `TMUX_MOUSE` (`.env`, default `on`) schaltet den server-globalen tmux Mouse-Mode. `off` für Moshi-lastige Nutzung (native Touch-Selektion); dann ist Scroll-Wheel im Hub-Terminal aus.

## Entwicklung

Kein Build-Step, kein Linter. Unit-Tests via `node:test` (jeweils `*.test.js` neben dem Modul), E2E via Playwright (`tests/`). Verifikation per Server-Neustart + Browser-/E2E-Run.

```bash
npm start                                        # = node server.js (npm run dev identisch, kein Watcher)

node --test lib/*.test.js                         # Backend-Unit-Tests
node --test public/*.test.js                      # geteilte Frontend-Module

npm run test:e2e                                  # Playwright, alle Projekte
npm run test:e2e -- --project=chromium            # nur Desktop
npm run test:e2e -- --project=webkit-mobile       # nur iOS-Viewport
npm run test:e2e:ui                               # interaktiver UI-Mode

# LaunchAgent (nach Code-Änderungen nötig — sonst läuft die alte Version weiter)
launchctl kickstart -k gui/$(id -u)/com.penates                              # neustarten
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.penates.plist      # stoppen (vor manuellem npm start)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.penates.plist    # erstmalig laden

tail -f logs/stdout.log logs/stderr.log
```

Setup auf frischem Mac: `./setup.sh` (installiert tmux/deps, generiert Token, richtet LaunchAgent + Hooks + StatusLine ein).

---

## Filebrowser

`lib/files.js` ist das zentrale File-I/O-Modul. Jede öffentliche Funktion geht zuerst durch den **Path-Guard** `resolveSafe(projectDir, relPath)` (resolved absolut, prüft Unterordner-Zugehörigkeit → 403 bei Escape via `../`). Funktionen: `listDir`, `readFile` (Text ≤2 MB, Image/PDF ≤10 MB base64, mime-Sniffing via `file-type` + Extension-Fallback, Oversize → 413 + Metadaten), `mkdirSafe`, `renameOrMove` (atomic), `copyFile`, `writeStream` (Busboy-Uploads), `deleteToTrash` (ruft `/usr/bin/trash` — nicht `rm`, nicht osascript).

`lib/file-watcher.js`: rekursives `fs.watch` pro Projekt, on-demand (`attachWatcher`/`detachWatcher`), 30 s Idle-Timeout, 80 ms Debounce, Self-Write-Suppression (`noteSelfWrite`, 400 ms TTL) gegen Upload-Echo. Broadcast via `onFileEvent(cb)`.

**Routen:** `GET/POST/PATCH/DELETE /api/projects/:id/files` (Listing / erstellen+mkdir / rename·move·copy / Trash-Delete), `GET …/files/read`. Live-Updates über die `/api/files/events`-WS.

**Frontend** (IIFEs in `index.html`): `FileBrowser` (aufklappbare resizable Sidebar, Lazy-Tree, offene Ordner in `localStorage`), `FilePreview` (Modal; Text-Highlighting lazy via `highlight.js`-ESM, PDF im `<iframe>`-Blob, Oversize-Metadaten), `FileActions` (Rechtsklick-Menü mit Inline-Rename, Copy/Move, 2-Klick-Delete), `Uploader` (Toast-Stack mit XHR-Progress, sequenzielle Queue, 409-Conflict-UI; Quellen: Tree-DnD spring-loaded, Terminal-Drop-Overlay, Mobile-Picker).

**Scope:** nur Projekt-cwd (kein HOME), Trash statt `rm`, kein Cross-Projekt-Copy, Uploads vom globalen `writeLimiter` (60/min) gedeckt.

## Hook-basierte State-Detection (Notifications)

Session-Zustand kommt **ausschließlich** aus Claude Code Hooks (kein Regex-Parser, kein Poll-Loop). `setup.sh` merged idempotent via `jq` einen `hooks`-Block in `~/.claude/settings.json` (Sentinel `"_owner": "penates"` → Re-Runs ersetzen nur Hub-Einträge, fremde Hooks wie `moshi-hook` bleiben). Die Hooks `POST`en an `/api/hooks/:event`. Fremde/Pre-Hook-Sessions zeigen `activity: unknown` → Label „Aktiv".

**Env-Injection:** `server.js` setzt beim `tmux new-session` via `-e` drei Vars, die der Claude-Kindprozess erbt: `PENATES_SESSION` (tmux-Name inkl. Prefix), `PENATES_URL`, `PENATES_TOKEN` (nur bei gesetztem `AUTH_TOKEN`).

**Self-bootstrapping (Moshi-Interop):** der Hook-curl ist quellen-agnostisch — er sourct `~/.penates/hook.env` (von `setup.sh`, `chmod 600`) und leitet den Session-Namen zur Laufzeit aus tmux ab (`tmux display-message -p '#S'`, Fallback `$PENATES_SESSION`). Dadurch melden auch nicht über den Hub gestartete Sessions (z. B. via Moshi/SSH). Das `tmux -e`-Inject bleibt Fallback; der StatusLine-Block nutzt dasselbe Muster.

**Zwei Broadcast-Typen (`lib/attention.js`):**
- `session-activity` — reiner State-Update, feuert bei JEDEM activity-ändernden Event (auch attached/muted). Frontend patcht die Badge inline (`patchActivityBadge()`).
- `session-attention` — Notification-Wert, feuert nur bei `Stop`/`Notification` wenn die Session **unattached + nicht muted** ist und der Cool-Down (`HOOK_COOLDOWN_MS = 10 s`) abgelaufen ist → Beep, Card-Flash, Unread, Toast. **Fremd-Attach-Suppression:** ist die Session von einem Nicht-Hub-Client attached (getrackt in `lib/attach-tracker.js`), unterdrückt der Hub die Push-Notification.

| Hook-Event | activity | session-attention? |
|------------|----------|--------------------|
| `UserPromptSubmit` | working | nein |
| `Stop` / `SubagentStop` | idle | ja (wenn unattached) |
| `Notification` | waiting | ja (wenn unattached) |
| `SessionStart` / `SessionEnd` | — | nein (Init / Purge) |

**Frische:** `getHookActivity(name)` liefert `null`, wenn der letzte Hook älter als `HOOK_FRESH_MS = 60 s` ist → `/api/sessions` fällt auf `unknown` zurück (ehrlicher als ein veralteter Wert).

**Rename:** `PENATES_SESSION` bleibt im Kindprozess auf dem Originalnamen. `server.js` hält einen `hookAlias`-Map (bei `PATCH` via `aliasOnRename()` nachgezogen, inkl. Chain A→B→C), `resolveHookSession()` löst ihn auf, `attention.rename()` verschiebt den State parallel.

**Kaputtes Hook-JSON:** Claude schickt gelegentlich invalides JSON (`{"line":}`). Die Route umgeht `express.json()` und nutzt `express.raw()` + try/catch — Payload wird opportunistisch geparst, bei Fehler `{}` (der Endpoint wertet das Payload eh nicht aus).

## Usage Dashboard

Zwei Pipelines:

1. **StatusLine-JSON** — `~/.claude/statusline-command.sh` (von `setup.sh` zwischen `#CCH-SL-START#`/`#CCH-SL-END#` idempotent installiert) sendet bei jedem Render ein Subset (rate_limits, cost, context_window, model) an `POST /api/hooks/statusline` (throttled). `lib/usage-limits.js` hält In-Memory-State pro Session (Frische-Window 120 s) + append-only History in `~/.penates/usage-limits.jsonl` (account-keyed `acct`-Feld, 5 MB Rotation). Daraus: Live-Limit-Prozente mit Reset-Countdown, Session-Kosten, Lines, API-Dauer. Funktionen: `recordStatusline`, `getSessionStatusline`, `getAllSessionCosts`, `getLimitHistory`, `rename`/`forget`.

2. **JSONL-Analyse** — `lib/usage.js` liest `~/.claude/projects/<mangled-cwd>/*.jsonl` und aggregiert (Token pro Projekt, 7×24-Heatmap, Tool-Top-10, autonome Tool-Ketten vs. direkte Antworten, Cache-Hit-Rate, API-Errors, Sessions/Tag, geschätzte Kosten). `lib/pace.js` berechnet das Verbrauchstempo. Provider-übergreifend (claude/codex), Ausgabe `byProvider`.

Routen: `POST /api/hooks/statusline`, `GET /api/usage/limits` (account-level via moshi-hook, 30 s-Cache), `GET /api/usage/costs` (10 s-Cache), `GET /api/usage/history` (erweitertes `getDailyUsageV2`-Payload), `GET /api/recent-dirs`.

## moshi-hook & Antigravity (Interop)

`moshi-hook` (CLI von getmoshi.app, via `brew tap rjyo/moshi`) wird von `setup.sh` **read-only** installiert (kein Daemon/pair). `lib/moshi-hook.js` kapselt fehlertolerant (fehlende CLI/Fehler → `null`): `getUsage()` (account-weite 5h/7d-Limits mit `accountLabel`+`agent`, multi-account → account-level Limit-Panel) und `getRecentDirs()` (recency-rankte Arbeitsverzeichnisse → „Zuletzt benutzt"-Quick-Pick im New-Session-Modal). Limits sind account-weit, nicht pro Session; Cost/Lines/Context kommen weiter aus dem StatusLine-Hook.

`lib/antigravity-usage.js` (Google `agy`-CLI, Gemini-Free-Tier) läuft **nicht** über moshi-hook. Eine saubere %-Quota ist für ein Always-on-Dashboard nicht verfügbar (das Cloud-Code-Quota-Endpoint liefert für Free-Tier 403). Einziges persistentes Signal ist der 429-Log-Eintrag (`~/.gemini/antigravity-cli/log/cli-*.log`: `RESOURCE_EXHAUSTED … Resets in 129h55m4s`). `getAntigravityUsage()` scrapt die Logs, parst Reset-Dauer + Zeitstempel → absoluter Reset, und liefert **nur wenn aktuell limitiert** ein account-förmiges Objekt (sonst `null`); `server.js` hängt es an `accounts[]` in `/api/usage/limits`. Das Sidebar-Panel rendert limited-Accounts als vollen roten Balken + Reset-Text (kein %).

## Multi-CLI Spawn (claude/codex/antigravity)

`public/clis.js` ist die einzige Registry der unterstützten Coding-CLIs: `CLIS` (id, label, binary, color, variants) + `cliFromCommand(cmd)`. Browser (`import('./clis.js')`) und `node:test` nutzen dieselbe Datei.

- **New-Session-Modal:** CLI-Picker (Icon je CLI) + Varianten-`<select>` (id `new-session-cmd` → `createSession` unverändert). Varianten decken Approval-Stufen ab (z. B. codex `--sandbox workspace-write --ask-for-approval on-request` / `--dangerously-bypass-approvals-and-sandbox` — `--full-auto`/`--yolo` sind ab codex 0.135 entfernt bzw. nur noch verstecktes Alias, antigravity `agy` / `agy --dangerously-skip-permissions`).
- **Session-Card:** CLI-Badge via `cliFromCommand(s.command)` (auf running/dormant/foreign Cards; `GET /api/sessions` reicht `command` mit).
- Auth out-of-scope: jede CLI nutzt ihren eigenen Login; fehlende CLI → Session stirbt mit „nicht im PATH"-Hinweis.

## Diff-Viewer

Native Diff-View pro Session (uncommittete Änderungen der cwd: unstaged/staged/untracked), Einstieg über den klickbaren Git-Badge der Session-Card.

`lib/git-diff.js`: `parseStatusV2(raw)` parst `git status --porcelain=v2 --branch -z` → `{branch, ahead, behind, files:[{category, path, oldPath?, status}]}` (eine Datei kann staged + unstaged zugleich sein; Renames liefern `oldPath`; `server.js getGitStatus` nutzt denselben Parser). `getDiff(cwd, {maxFileBytes=200_000, maxUntracked=100})` liefert pro Datei `additions/deletions/binary/oversize/diff` über **gebündelte** git-Aufrufe (`git diff` + `--cached`, client-seitig an `diff --git`-Grenzen gesplittet, `--numstat -z` für Counts; untracked einzeln via `git diff --no-index`). Alles via `execFileSync('git', […])`.

Route `GET /api/sessions/:name/diff` (cwd via `resolveSessionCwd`; `isRepo:false` → 200). Live-Refresh über `{subscribeSession:<name>}` auf der Files-Events-WS (debounced ~300 ms). Frontend: `DiffView`-IIFE, Rendering via **diff2html** (lazy CDN-ESM, `<pre>`-Fallback), side-by-side ≥900 px sonst line-by-line.

**Grenze:** der File-Watcher ignoriert `.git`, daher triggert `git add`/`reset` kein Live-Event — der manuelle Refresh-Button deckt das ab.

## Image-Paste & Annotation

Bild in eine Claude-Session geben (Clipboard-Paste / Picker / Drag&Drop), optional annotieren → PNG landet in `<cwd>/.penates-images/`, der cwd-relative Pfad wird als `@`-Mention in die Eingabezeile injiziert (Claude hängt das Bild an).

`lib/session-images.js` (reuse `resolveSafe` aus `files.js`): `saveSessionImage(cwd, buffer)` legt `.penates-images/` an, schreibt `<YYYY-MM-DD-HHMMSS>.png` (kollisionssicher), sichert idempotent einen `.gitignore`-Eintrag, ruft lazy `cleanupOldImages` (löscht PNGs > 7 Tage). Route `POST /api/sessions/:name/image` (`express.raw image/png`, ≤8 MB → 413, Path-Guard-Escape → 403).

Frontend: `ImageAnnotator`-IIFE (Canvas + Overlay, Toolbar Pfeil/Box/Stift/Text/Undo, eine Farbe Rot, Oversize-Downscale ≤2000 px; `open(blob)` → `Promise<Blob|null>`) + `ImagePaste`-Glue (`injectMention(rel)` → `currentWs.send({type:'input', data:'@'+rel+' '})`, **kein** Auto-Enter).

**v1-Grenze:** der `@`-Mention-Mechanismus ist Claude-spezifisch — für codex/antigravity hängt `@` nichts an, die Datei liegt aber trotzdem in `.penates-images/`.

## Browser-Preview

In-App Live-Vorschau eines lokalen Dev-Servers (mit HMR) als Split-Panel rechts vom Terminal. Da der Remote-Browser `localhost:<port>` nicht direkt erreicht, **reverse-proxied der Hub** den Dev-Server. **Single-Host-Modell:** ein fixer Host `preview.<PREVIEW_DOMAIN>` (bewusst nur eine Ebene tief, damit das Universal-SSL-Wildcard `*.<domain>` ihn deckt — kein ACM). Welcher Port dahinter steckt, ist serverseitiger State (`activePreviewPort`, gesetzt per `POST /api/preview/select`) → **eine Preview zur Zeit**. Feature aus, wenn `PREVIEW_DOMAIN` leer ist.

`lib/preview-proxy.js`: `isPreviewHost(host, previewHost)` (Exact-Match), `proxyHttp`/`proxyWs` (via `http-proxy`, `changeOrigin:true` → umgeht Vites `allowedHosts`), `attachUpgrade(server, …)` (koexistiert mit express-ws: greift dessen `upgrade`-Listener ab und delegiert Nicht-Preview-Upgrades zurück — genau ein Pfad pro Upgrade). `lib/port-scan.js`: `listListeningPorts()` über `lsof` (Absolutpfad-Fallback `/usr/sbin/lsof`), Hub-Port + `<1024` raus, fehlertolerant `[]`.

`server.js`: Host-Dispatch-Middleware ganz oben (`isPreviewHost` → `previewPortReady()` SSRF-Guard → `proxyHttp`; sonst 503-Hinweis), `server.on('upgrade')` via `attachUpgrade`, Routen `GET /api/preview/config|ports` + `POST /api/preview/select`, dynamisches CSP `frame-src`. Frontend `PreviewPanel`-IIFE: Split-Panel mit Port-Combobox (aus `/api/preview/ports`), Port-Wahl → `/select` → iframe auf den fixen Host.

**Grenzen:** eine Preview gleichzeitig; Apps mit hartkodierten Origin-URLs können fehlrouten (kein Body-Rewriting); ggf. `server.hmr.clientPort: 443` im Dev-Projekt setzen. CF-Setup: 1× DNS-CNAME `preview` + 1× Public Hostname + Host zur Access-App (`setup.sh` druckt die Checkliste).

## Mata-Integration (iOS-Simulator im Hub)

[Mata](https://getmata.app/) (Moshi-Team) ist ein Remote-iOS-Simulator-Viewer. Die Host-App fährt on-demand einen WebSocket-Video-Viewer auf **`localhost:3070`** hoch (Pfad `/session`, Capture unter `/session/capture`). Der Hub embeddet + steuert nur den **lokalen** Host (keine Mata-Cloud-Auth). **Strukturell dieselbe Form wie Browser-Preview** → Reuse der gesamten Proxy-Infra.

`lib/mata.js` (Express-frei, fehlertolerant — Vorbild `moshi-hook.js`/`voice.js`, alle Aufrufe via `execFile`/`execFileSync` mit Argv-Array): `resolveBin()` (`MATA_BIN` autoritativ → sonst `/Applications/Mata.app/Contents/MacOS/mata`), `isInstalled()`, `parseStatus(raw)` (rein; tolerant gegen JSON / `key: value` / bare „Mata is running." — zieht sauberen Semver aus „Mata 1.1.10 (18)"), `getStatus()` (`{running, pid, version, startedAt}` / `null` bei fehlender App), `isViewerPortOpen()` (TCP-Probe `127.0.0.1:3070`), `captureFrame()` (GET `/session/capture` → `{buffer, contentType}` / `null` bei Non-Image/Port-zu), `start`/`stop`/`restart` (async), `previewPortForSource('mata')→3070`, const `MATA_PORT=3070`. **Kein Mata-State im Hub** (tmux = Sessions, Mata-App = Simulator-State).

**Routen:** `GET /api/mata/status` (`{installed, running, pid, version, portOpen}`, 5 s In-Memory-Cache; bei `installed:false` trotzdem 200 → Frontend versteckt das Feature), `POST /api/mata/control {action:start|stop|restart}` (Whitelist → 400, global `writeLimiter`), `POST /api/preview/select {source:'mata'}` → mappt auf `activePreviewPort=3070` (gleicher SSRF-/Listening-Guard → 409 wenn kein aktiver Simulator), `POST /api/sessions/:name/mata-capture` → `mata.captureFrame()` → `saveSessionImage(cwd, buf)` → `{rel}`.

**Frontend:** `PreviewPanel` bekommt einen **Source-Switcher** (`Dev | Simulator`, nur bei `installed:true` sichtbar) — Mata-Wahl lädt das iframe auf `https://preview.<domain>/session` (reuse `proxyHttp`/`proxyWs`/`attachUpgrade`); Zustände: nicht-laufend → Start-Button, laufend+Port-zu → „Simulator booten", laufend+Port-offen → Viewer. Terminal-Toolbar: `📱 mata-capture-btn` (`MataCapture`-IIFE) → `mata-capture` → `ImagePaste.injectMention` (`@<rel>`, kein Auto-Enter, Claude-spezifisch wie Image-Paste/Voice).

**Grenzen (v1):** eine Preview gleichzeitig (Web-Preview ⊻ Simulator); **remote nur WS-Video-Pfad** (SRT/ENet/UDP queren den CF-Tunnel nicht → höhere Latenz); on-demand-Port 3070 (zu, solange kein Simulator streamt); Mata-Installation **nicht** über `setup.sh` (User-GUI-App, nur Runtime-Detection). **Phase-0-Real-App-Abnahme** (echter Stream durch den Proxy, Cross-Origin-Auth, Touch/Keyboard-Forwarding, Capture-Format) ist nur mit gebootetem Simulator am Gerät verifizierbar — `lib/mata.js` + `/api/mata/status` sind live gegen echtes Mata v1.1.10 verifiziert (Port 3070 war erwartungsgemäß zu).

## Voice-Input

Sprache ins Terminal diktieren: Mic-Button (Toggle) in der Terminal-Toolbar, lokale Transkription via whisper.cpp, der Text landet **ohne Enter** in der Eingabezeile (gleiches Inject-Muster wie `@`-Mention).

`lib/voice.js` (Express-frei, liest Env in den Funktionen): `resolveBin()` (`WHISPER_BIN` autoritativ, sonst `/opt/homebrew/bin/whisper-cli` → `/usr/local/bin/…`), `modelPath()`/`langDefault()` (`WHISPER_MODEL`, `VOICE_LANG` default `de`), `isEnabled()` (gated den Button; false bei `VOICE_ENABLED=false` oder fehlendem bin/Modell), `transcribe(wavBuffer, {lang})` (async `execFile` — **nicht** `execFileSync`, blockiert sonst den Event-Loop; **Single-Flight-Guard** → parallele Aufrufe `code:'BUSY'`; Temp-Cleanup im `finally`, Timeout 30 s).

Engine: Homebrew `whisper-cpp` (Metal-Build), Modell `ggml-large-v3-turbo-q5_0` (~574 MB, ~1–2 s/Clip). `setup.sh` installiert Binary + Modell idempotent. Routen: `GET /api/voice/config` (`{enabled}`), `POST /api/voice/transcribe` (`express.raw audio/wav`, ≤10 MB; `BUSY`→429, bin/Modell fehlt→503). Frontend `VoiceInput`-IIFE: Client-Capture via `getUserMedia` + `ScriptProcessorNode` (iOS-kompatibel), Downsample auf 16 kHz Mono 16-bit-WAV in vanilla JS (kein ffmpeg), States idle/recording/busy mit Re-Entrancy-Guard.

**v1-Grenzen:** eine Transkription gleichzeitig, kein Live-Streaming, CoreML/ANE nicht in v1. `@`-Inject Claude-spezifisch (wie Image-Paste).

## Connection-Robustness

Mosh-grade Härtung des Terminal-Pfads (Browser ↔ Hub über den CF-Tunnel ist der fragile Hop). Zwei Teile:

- **Reconnect (Frontend, `openTerminalWebSocket`):** unbegrenzter Reconnect mit Exponential Backoff (`lib/backoff.js` `nextBackoffMs`: Base 1 s, ×2, **Cap 20 s**, ±20 % Jitter; ins Frontend gespiegelt). Abbruch nur bei `4001`/`4004`. Resume-Trigger (`visibilitychange`→visible / `online` / `pageshow`) → sofortiger Reconnect (Backoff-Reset, Guard gegen Parallel-Storm). Client-Heartbeat alle 15 s `{type:'ping'}`; kein `{type:'pong'}` ≤10 s → `ws.close()`.
- **Server-Heartbeat:** `terminalSockets`-Set (nur Terminal-WS), `ws.ping()` + `isAlive`-Interval (30 s) terminiert tote Sockets → der `tmux attach`-PTY wird frei. `{type:'ping'}`→`{type:'pong'}`-Reply.
- **Scrollback-Replay (`lib/scrollback.js`):** `captureScrollback` via `tmux capture-pane -p -e -S -<lines> -E -1` (History oberhalb des Panes, `-e` behält Farben). Route `GET /api/sessions/:name/scrollback`. Frontend seedet **nur bei frischem Connect** (fetch → `term.write` → dann WS öffnen); der Reconnect-Pfad seedet nicht (xterm lebt weiter). Seed-`.finally` gegen Weg-Navigation geguarded.

**Grenze:** Predictive Echo (Mosh-Signature) ist bewusst nicht drin; echte Mobile-Sleep/Wake-Matrix nur am Gerät verifizierbar.

## Session-Auto-Restore (tmux-continuum nativ)

Nach einem tmux-Tod (Mac-Reboot / `tmux kill-server` / Server-Crash) fährt der Hub beim Boot die zuletzt laufenden `cc-`-Sessions automatisch wieder hoch — je im Originalverzeichnis, mit fortgesetzter CLI-Konversation. **Nativ, kein tmux-resurrect/continuum-Plugin** (das würde `hubEnvArgs()` umgehen, fremde Sessions anfassen und mit dem Hub-Restore um dieselben Sessions konkurrieren). Basis ist die bestehende `known-sessions.json` + der `/restore`-Pfad, nur mit Auto-Trigger.

- **`planAutoRestore({known, liveNames, continueEnabled})`** (`lib/session-restore.js`, **rein**): filtert dormant (`!liveNames.includes(name)`) + nicht `manuallyStopped` Einträge und resolved pro Eintrag das Spawn-Command. Bei lebendem tmux (normaler Hub-Neustart) sind alle known live → leerer Plan → **No-Op** (kein Duplikat-Risiko im Dev-Alltag).
- **`continueCommand(command)`** (`public/clis.js`, CLI-Registry = SoT): fügt die „letzte Konversation fortsetzen"-Sequenz ein — `claude --continue …` / `agy --continue …` (Flag nach dem Binary), `codex resume --last …` (erstes Token). **Idempotent** (re-applizierbar, weil der Auto-Restore die Continue-Form persistiert), Pfad-Binaries via Basename, unbekannte CLI → `null` (Caller fällt auf den Plain-Command zurück).
- **`spawnDormantSession(name, {directory, command})`** (`server.js`): geteilter Spawn (tmux `new-session` + `hubEnvArgs` + Liveness-Poll + `knownSessions.add`), genutzt von `POST /api/sessions/:name/restore` **und** dem Boot-Block. Wirft nie → `{ok, session|error}`.
- **Boot-Orchestrierung** (`app.listen`-Callback, nach known-Load + Best-effort-Adoption): iteriert den Plan sequenziell; **Continue-Fallback** — exitet ein `--continue`-Spawn sofort (keine Konversation im cwd), wird einmal frisch mit dem Plain-Command nachgesetzt. Jeder Fehler nur geloggt, killt den Boot nie. Log: `▸ auto-restore: N/M session(s) restored (continue=on|off)`.
- **Opt-out via `manuallyStopped`** (`lib/known-sessions.js`): ein bewusstes Kill (`DELETE /api/sessions/:name` **und** Phase-5-Finish, via shared `destroySession`) markiert die Session → vom Auto-Restore ausgeschlossen (bleibt aber dormant fürs **manuelle** Restore). `add()` (Neustart/Restore/Adopt) löscht das Flag wieder.
- **Settings** (`lib/settings.js`, beide default `true`): `autoRestore` (Master-Switch) + `autoRestoreContinue` (`--continue` vs. Frischstart). `GET/PATCH /api/settings`; Sektion „Session-Wiederherstellung" in der Settings-View (zwei Toggles, Continue als Unter-Option). Wirkt **erst beim nächsten Boot** (kein Live-Reload — Auto-Restore läuft nur beim Start).

**Grenze:** Reboot-only by design; nur die CLI-Konversation kommt zurück, kein abgebrochener Task, kein sichtbarer tmux-Scrollback (lebte im RAM des toten Servers). Spec: `docs/superpowers/specs/2026-06-13-tmux-continuum-design.md`.

## Bekannte Einschränkungen

- tmux-Socket wird beim ersten `tmux new-session` automatisch erstellt; node-pty erfordert Xcode Command Line Tools zum Kompilieren.
- `claude`/`codex`/`agy` (Antigravity) müssen im PATH sein. `server.js` ergänzt `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` zur Laufzeit; der LaunchAgent-PATH selbst bleibt minimal.
- LaunchAgent-plist **muss** Mode `644` haben — launchd verweigert world-writable Dateien stillschweigend (`Bootstrap failed: 5`). `setup.sh` setzt das; bei manuellem Edit dran denken.
- tmux muss beim Attach mit `-u` laufen + `server.js` setzt `LANG`/`LC_CTYPE` im PTY-Env, sonst werden Multi-Byte-Zeichen (Umlaute, ⏺ ⎿ ✻) durch `_` ersetzt.
- tmux Mouse-Mode wird beim Server-Start aktiviert (`set-option -g mouse on`), sonst forwardet tmux keine Wheel-Events ans xterm.
