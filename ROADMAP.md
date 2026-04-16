# Claude Code Hub — Roadmap

Stand: 2026-04-13. Lebendes Dokument, gepflegt über die Projekt-Verwaltung
im Hub selbst. Struktur folgt dem `lib/roadmap.js`-Parser:
H2-Sections Released / In Entwicklung / Backlog / Changelog,
Top-Level-Checkboxen mit optionalem `{key: value}`-Meta-Suffix.

## Released: v0.6.0

Filebrowser-Theme: Tree-View pro Projekt mit Preview, CRUD-Operationen
(lesen, löschen, kopieren, verschieben, umbenennen), Live-Refresh via
fs.watch, und Datei-Upload per Drag und Drop — sowohl in den Tree-View
(Drop auf Ordner) als auch in die Terminal-View (Drop irgendwo im
Terminal landet im Projekt-cwd). Dazu E2E-Tests und Portability-Fixes.

- [x] Filebrowser pro Projekt — Tree-View plus Preview lesen/löschen/kopieren/verschieben/umbenennen {priority: p0, theme: productivity}
- [x] Offene Frage Filebrowser — Scope (Projekt-cwd oder ganzes HOME), Preview-Formate und Größen-Limit, Löschen via Trash oder rm, Cross-Projekt-Copy, Live-Refresh via fs.watch {type: decision}
- [x] Datei-Upload per Drag und Drop — im Filebrowser-Tree und in der Terminal-View (Ziel: Projekt-cwd bzw Session-cwd) {priority: p1, theme: productivity}
- [x] E2E-Tests als Dauer-Setup mit Playwright {priority: p2, theme: dev-x}
- [x] Kompletter Playwright E2E-Test — 62 Tests x 5 Viewports, alle Buttons und Flows {priority: p2, theme: dev-x}
- [x] tmux-Pfad Auto-Detection via which statt hardcoded /opt/homebrew/bin/tmux {priority: p2, theme: dev-x}

## In Entwicklung: v0.7.0

Usage-Dashboard-Theme: Erweiterte Statistiken, Live-Limit-Tracking und
Kosten-Übersicht. StatusLine-JSON als neue Datenquelle ersetzt das
tmux-capture-pane-Parsing.

- [ ] Usage-Dashboard: Summary-Cards (Kosten, Sessions, Cache-Rate, Autonom) {priority: p0, theme: observability}
- [ ] Usage-Dashboard: Limit-Status mit Live-Countdown und Sparklines {priority: p0, theme: observability}
- [ ] Usage-Dashboard: Tageszeit-Heatmap (7x24) {priority: p1, theme: observability}
- [ ] Usage-Dashboard: Top-Projekte nach Token-Verbrauch {priority: p1, theme: observability}
- [ ] Usage-Dashboard: Tool-Nutzung Top-10 und Arbeitsweise {priority: p1, theme: observability}
- [ ] Usage-Dashboard: Produktivität (Lines Added/Removed, API-Zeit) {priority: p1, theme: observability}
- [ ] StatusLine-Hook: Limit- und Kostendaten aus Claude Code Status-Line-JSON {priority: p0, theme: observability}
- [ ] Session-Cards: 5h + 7d Limit mit Reset-Countdown statt capture-pane-Parsing {priority: p0, theme: observability}

## Archiv: v0.3.0

Historische Items die mit v0.3.0 oder davor geshipped sind. Der Parser
ignoriert diese Section (Release-Flow wirkt nur auf Released/Dev);
die Items sind hier reine Markdown-Dokumentation.

- [x] Notifications: Badge-Count im Browser-Tab-Titel
- [x] /healthz-Endpoint für Cloudflare Tunnel-Monitoring
- [x] CSP-Header gegen XSS-Folgeschäden
- [x] Subresource-Integrity für xterm.js-CDN-Scripts
- [x] Terminal Kontrast in Lightmode nicht gut (weißer Text auf weißem Hintergrund)
- [x] Ideenfeld leert sich nicht nach senden
- [x] Session-Übersicht flasht beim Aktualisieren
- [x] Offene Frage: welche CLIs neben claude reinsollen — gemini/codex/aider/cursor
- [x] Offene Frage: Hub single-user oder multi-user
- [x] Offene Frage: Token-Auth — Bearer bleiben oder Passkey/WebAuthn

## Backlog / Ideen

Pakete bündeln thematisch zusammengehörige Items. Jedes Paket kann als
geschlossenes Release (vX.Y.0) oder als Teil eines Mixed-Release umgesetzt werden.

### Paket A: Multi-CLI
Hub wird zum universellen AI-Code-Terminal — nicht nur Claude, sondern
auch Gemini CLI, Codex, Aider, Cursor etc.

- [ ] Multi-CLI: CLI-Typ als Session-Metadatum plus Icon im UI {priority: p0, theme: multi-cli, paket: a}
- [ ] Multi-CLI: Preset-Profile im New-Session-Modal {priority: p0, theme: multi-cli, paket: a}
- [ ] Multi-CLI: Per-CLI-Auth via .env.cli.name oder profiles-Ordner {priority: p0, theme: multi-cli, paket: a}

### Paket B: Community-Readiness
Repo contributor-freundlich und plattformunabhängig machen.

- [ ] Docker-Image für Linux/NAS weg von Mac-only {priority: p2, theme: dev-x, paket: b}
- [ ] GitHub Actions CI mit Lint und Tests auf Push {priority: p2, theme: dev-x, paket: b}
- [ ] ESLint und Prettier auf server.js und inline-JS {priority: p2, theme: dev-x, paket: b}
- [ ] Request-Validation via zod oder joi auf POST/PATCH-Bodies {priority: p2, theme: dev-x, paket: b}

### Paket C: Power-User
Produktivität und Workflows für den täglichen Einsatz.

- [ ] Session-Templates / Favoriten mit vorausgefülltem cwd und Command {priority: p1, theme: sessions, paket: c}
- [ ] Split-View mit zwei Terminals nebeneinander für große Screens {priority: p1, theme: sessions, paket: c}
- [ ] Prompt-Snippet-Library mit Klick-to-paste {priority: p1, theme: productivity, paket: c}
- [ ] Item-Auto-Prompt — Klick aufs Roadmap-Item spawnt Session im Projekt-cwd und sendet den Item-Text als ersten Prompt an Claude {theme: session-link, paket: c}

### Paket D: Sharing & Recording
Sessions teilen und aufzeichnen.

- [ ] Read-only-Share-Link mit kurzlebigem Token für Live-Debugging {priority: p1, theme: sessions, paket: d}
- [ ] asciinema-Style Recording plus Replay als cast-Export {priority: p1, theme: sessions, paket: d}

### Paket E: Observability & Security
Logging, Metrics und Auth-Härtung.

- [ ] Structured Logging via pino statt console.log {priority: p1, theme: observability, paket: e}
- [ ] Basic Metrics: aktive Sessions, Uptime, Reconnect-Count {priority: p1, theme: observability, paket: e}
- [ ] CSRF-Token auf mutierende Endpoints falls Cookie-Auth kommt {priority: p2, theme: security, paket: e}
- [ ] Token-Rotation per Schedule monatlich {priority: p2, theme: security, paket: e}

### Ungruppiert

- [ ] Notifications: Telegram-DM wenn Claude auf Input wartet {priority: p0, theme: notifications}
- [ ] iOS App

## Changelog

### v0.6.0 — 2026-04-15

**Filebrowser-Kern (lib/files.js + REST).** Neues Modul `lib/files.js` als einziger Einstiegspunkt für alle Datei-Operationen. Jede Funktion geht zuerst durch `resolveSafe(projectDir, relPath)` — der Path-Guard resolved den Pfad absolut und prüft dass er unter dem Projektverzeichnis liegt; kein Escape via `../`, keine Symlink-Umgehung. `listDir` liefert Typ, Größe und mtime. `readFile` snifft MIME via `file-type`-Library plus Extension-Fallback und gibt Text (≤2MB), Base64-Image (≤10MB) oder Base64-PDF (≤10MB) zurück; Oversize-Dateien bekommen 413 mit Metadaten statt Inhalt, Markdown wird als raw Text geliefert. `mkdirSafe`, `renameOrMove`, `copyFile` und `writeStream` sind allesamt path-gated auf beide Seiten. `deleteToTrash` ruft `/usr/bin/trash` auf — `osascript`-Finder-Ansatz war wegen macOS-Automation-Permission geblockt. Fünf REST-Routen unter `GET|POST|PATCH|DELETE /api/projects/:id/files*` plus `POST /api/sessions/:name/upload` via `busboy` (neue Dependency) für Multipart-Uploads in den Session-cwd.

**Live-Sync (lib/file-watcher.js + WS).** `lib/file-watcher.js` hält einen rekursiven `fs.watch`-Handle pro Projektverzeichnis mit on-demand Attach/Detach: `attachWatcher` / `detachWatcher`, 30s Idle-Timeout wenn kein Subscriber mehr die Events konsumiert. 80ms Debounce pro Projekt coalesct Event-Bursts (insbesondere bei Bulk-Uploads). Self-Write-Suppression: `noteSelfWrite(path)` setzt eine 400ms-TTL; Events die innerhalb des Fensters nach einem eigenen `writeStream`-Aufruf eintreffen werden gedroppt — der Upload-Caller sieht kein doppeltes Reload. Neuer WS-Endpunkt `/api/files/events` fan-outet Events an alle verbundenen Clients (bearer-Subprotocol wie Terminal-WS). Clients senden `{ type: subscribe/unsubscribe, projectId }`; Seq-Dedupe auf dem Client verhindert Doppel-Rerender bei schnellen Bursts.

**Frontend-Sidebar (FileBrowser IIFE).** Aufklappbare Sidebar in der Terminal-View, seitlich resizable via Drag-Handle. Offene Ordner werden in `localStorage` persistiert (Key pro Session), damit der State nach Navigation-Roundtrip erhalten bleibt. Tree lädt lazy: erst beim Aufklappen eines Ordners fetcht `FileBrowser` `/api/projects/:id/files?path=rel`. Live-Updates vom WS-Events-Channel patchen den Tree inkrementell ohne Full-Reload. Mobile: Sidebar ist per Swipe-Geste erreichbar, Overlay schließt per Tap außerhalb.

**Preview-Modal (FilePreview).** Öffnet via Doppelklick oder Context-Menu-Eintrag. Text-Highlighting via `highlight.js` — geladen lazy per `import()` vom ESM-CDN beim ersten Preview-Open, danach gecacht. PDF via `<iframe>` mit Blob-URL aus dem Base64-Response. Images inline als `<img>`. Oversize-Antwort (413) rendert Datei-Metadaten plus einen Hinweis dass die Datei zu groß für den In-Browser-Preview ist.

**Context-Menu und Inline-Rename (FileActions).** Rechtsklick auf jeden Tree-Node öffnet ein positioniertes Context-Menu: Öffnen, Umbenennen (wechselt in Inline-Edit-Mode direkt im Tree-Node, Enter/Blur bestätigt, Esc verwirft), Kopieren, Verschieben (Ziel-Auswahl via Tree-Picker-Modal), Löschen (2-Klick-Confirm-Pattern: × → ✓? wie im Roadmap-Detail-View), Pfad in Zwischenablage kopieren.

**Upload-Queue (Uploader).** Toast-Stack rechts unten zeigt XHR-Fortschrittsbalken pro Datei. Sequenzielle Queue — kein paralleles Flood das den Server überlastet. Conflict-UI bei 409 (Datei existiert bereits): Überschreiben / Überspringen / Alle überschreiben. Drei Upload-Quellen: Tree-DnD (Drop auf Ordner, spring-loaded Folder-Dwell 600ms damit der Baum beim Drag aufklappt), Terminal-Drop-Overlay (capture-phase Listener vor xterm damit der Browser-Standard-Drop nicht greift), und Mobile File-Picker-Fallback (Input[type=file] auf Geräten ohne Drag-Support).

**tmux Auto-Detection.** `TMUX`-Konstante wird nicht mehr auf `/opt/homebrew/bin/tmux` hardcoded. Stattdessen sucht der Server beim Start via `which tmux` den richtigen Pfad — funktioniert damit out-of-the-box auf Intel-Macs (`/usr/local/bin`), Linux und anderen Installationen. `TMUX_PATH` in `.env` überschreibt weiterhin als expliziter Override; `.env.example` dokumentiert das als optionalen Wert statt Pflichtfeld.

**Testing.** Komplette Playwright-E2E-Suite neu geschrieben: 8 Spec-Files (`auth`, `dashboard`, `terminal`, `filebrowser`, `file-preview`, `projects`, `settings`, `mobile`) mit 62 Tests, die über 5 Viewport-Projekte laufen (Desktop 1280×800, Laptop 1024×768, Tablet 768×1024, Mobile 390×844, Mobile-Small 320×568) — insgesamt 254 Test-Runs in ~7 Minuten, davon 51 Skips (Touch-inkompatible Context-Menu-Tests auf Tablet/Mobile, Idea-Capture ohne Projekt-Kontext). Shared Fixtures (`fixtures.js`) kapseln Session-Lifecycle (`hubSession` erstellt/killt tmux-Session per API), Temp-Projekt-Isolation (`tempProject` in `/tmp`), Viewport-Detection (`isMobile`, `isTouch`) und Auth-State (`authedPage`). Shared Helpers (`helpers.js`) abstrahieren Navigation, Terminal-Wait, Sidebar-Handling und API-Calls. Global-Teardown killt verwaiste `cc-test-*`-Sessions als Safety-Net. Jeder Button, jedes Modal, jeder User-Flow wird aus Enduser-Perspektive getestet: Login, Session-CRUD (Create/Rename/Kill/Pin/Mute), Layout-Toggle, Suche, Terminal-Attach/Input/Resize/Disconnect, Filebrowser-CRUD (Mkdir/Rename/Delete/Copy-Path), File-Preview (Text+Highlighting/Image/Escape-Close), Projekt-Navigation (Tab/Detail/Roadmap/Back), Theme-Persist, Keyboard-Shortcuts, Touch-Bar (Sticky-Ctrl/Arrow-Keys/Esc/Tab). Dabei entdeckt und gefixt: Dblclick-Race-Condition im File-Preview (Modal öffnete und schloss sich sofort durch Backdrop-Click), Sidebar-Overlay blockierte Cards auf Mobile, Projekt-Navigation brauchte Hamburger-Menü auf schmalen Viewports. Backend-Unit-Tests (`lib/*.test.js`) decken weiterhin path-guard 403, preview 200/413 und Upload/Cleanup ab.

### v0.5.0 — 2026-04-15

**Cloudflare Access (Zero Trust).** Neue optionale Auth-Schicht vor dem Tunnel. Wenn `CF_ACCESS_TEAM_DOMAIN` und `CF_ACCESS_AUD` in der `.env` gesetzt sind, fordert der aufgebohrte `secureMiddleware` für Tunnel-Requests zusätzlich ein gültiges `Cf-Access-Jwt-Assertion`-Header. JWT-Validation läuft via `jose` gegen Cloudflare's JWKS mit 1h-Cache — Signatur, Audience, Issuer und Expiry werden geprüft, die User-Email aus dem JWT wird als Identity extrahiert. Tunnel-vs-Localhost-Unterscheidung über das `Cf-Ray`-Header: cloudflared strippt eingehende `Cf-*`-Header am Ingress und setzt eigene, damit ist der Marker nicht spoofbar. Claude-Code-Hooks auf localhost bleiben unbetroffen — sie passieren nie den Tunnel, brauchen weiterhin nur den Bearer. Beide Env-Variablen leer = Dev-Mode, alter Bearer-only-Flow läuft unverändert, Zero-Regression für lokale Entwicklung. Der erste JWT einer neuen Access-Session wird einmal als `auth.login` geloggt (per in-memory `lastSeenIat`-Map).

**Rate-Limiting plus Audit-Log.** Zwei weitere Schichten im selben Request-Einstiegsbereich. **Rate-Limiting**: in-memory Fixed-Window-Counter pro IP mit zwei Buckets — 300 Read-Requests und 60 Write-Requests pro 60 Sekunden. Dispatcher routed nach HTTP-Methode, `/api/hooks/*` ist exempt (Claude-Code-Hooks haben hohe Event-Raten). 429 mit `Retry-After`-Header bei Überschreitung. Hand-rolled in ~40 Zeilen statt `express-rate-limit`, konsistent mit dem minimal-Dependencies-Ansatz des Projekts. **Audit-Log**: append-only JSONL unter `~/.claude-code-hub/audit.log`, size-basierte Rotation (10 MB × 3 Archive), write-serialisiert via `saveQueue`-Promise-Chain, crash-safe durch atomare `fs.appendFile`. Acht Event-Typen: `auth.login`/`auth.fail` (mit machine-readable `reason`-Codes wie `bad-jwt:no-jwt`, `bad-aud`, `bad-iss`, `expired`, `bad-bearer`), `session.create`/`delete`/`rename`/`attach`/`detach` an den Lifecycle-Sites, `rate-limit.exceeded` aus dem Limiter. Security-Events werden awaited (Crash-Safety), Lifecycle-Events fire-and-forget. `session.detach` wird über ein dedupliziertes Dual-Trigger-Pattern (`pty.onExit` plus `ws.on('close')`) genau einmal pro Session geschrieben, mit `durationMs`.

**Housekeeping Quick Wins.** Fünf kleine, eigenständig nützliche Features aus dem Backlog nebenbei gezogen. **Bulk-Actions**: neuer „Bulk beenden"-Button in der Dashboard-Toolbar killt alle Sessions die weder attached noch working/waiting sind, mit Confirm-Modal und parallelen DELETEs. **Session-Pinning**: `pinned`-Flag in `known-sessions.json` (mirror des `muted`-Musters), Pin-Button auf jeder Running/Dormant-Card, Sort-Comparator zieht gepinnte Sessions innerhalb ihrer Partition nach oben. **`/api/browse` Allow-List**: neue `BROWSE_ROOTS`-Env-Variable als `:`-getrennte Liste absoluter Pfade mit `~`-Expand — der Tree-Picker kann jetzt explizit freigegebene externe Volumes öffnen, default bleibt `$HOME`. **Web-Client Auto-Reload**: Server setzt `X-CCH-Boot`-Header auf jeder Response (Millisekunden-Boot-Zeit), Client vergleicht in `refreshSessions()` gegen den zuletzt gesehenen Wert und reloaded per `location.reload()` bei Mismatch — 3s-Cooldown schützt vor Reload-Schleifen. **Git-Status-Widget**: Backend liest pro Session-cwd ein `git status --porcelain=v2 --branch -z` mit 2s-TTL-Cache und 1.5s-Timeout, parsed Branch plus dirty-Flag plus ahead/behind. Frontend rendert einen Branch-Namen plus dirty-Dot plus ↑n/↓n als neues session-meta-item; Sessions ohne git-Repo bekommen kein Widget.

**Fixes.** Zwei Nebengeleise-Corrections während der Implementierung: **Pin-Button Overlap** — der neue Pin-Icon überlappte in manchen Card-Varianten mit der Status-Pill; die Session-Card-Header reserviert jetzt 76px rechts auf Running/Dormant-Cards, Foreign-Cards bleiben unbetroffen. **`dotenv` Hoisting** — `cf-access.js` las `process.env.CF_ACCESS_*` beim Module-Load, aber `dotenv.config()` lief erst nach den Imports (ES-Module-Hoisting), dadurch blieb `isEnabled()` dauerhaft false und der JWT-Check war in der Staging-Phase inaktiv. Fix via `import 'dotenv/config'` als Side-Effect-Import ganz oben in `server.js`.


### v0.4.0 — 2026-04-15

**Notifications-Theme.** Zentrales v0.4.0-Feature: der Hub meldet jetzt zuverlässig wenn eine Session Aufmerksamkeit braucht. Attention-Detection läuft rein über Claude-Code-Hooks — `Stop`, `Notification`, `UserPromptSubmit`, `SubagentStop`, `SessionStart`, `SessionEnd` feuern per curl an `POST /api/hooks/:event`, der Hub hält Session-Activity-State in `lib/attention.js` mit 60s-Frische-Window und 10s-Cool-Down zum Entrauschen. Die vorherige Regex-basierte `tmux capture-pane`-Parser-Variante war als Fallback dabei und wurde im Lauf von v0.4.0 komplett entfernt (Hook-only). `setup.sh` installiert den Hook-Block idempotent in `~/.claude/settings.json` per `jq`-Merge mit `_owner`-Sentinel, damit Re-Runs User-Hooks nicht überschreiben. Env-Injection via `tmux new-session -e` vererbt `CC_HUB_SESSION`, `CC_HUB_URL`, `CC_HUB_TOKEN` an den Claude-Kindprozess; ein Rename-Alias-Map im Server sorgt dafür dass Hook-Posts auch nach `tmux rename-session` noch zur richtigen Session finden.

**Notification-Kanäle.** Notifications werden auf mehreren Kanälen ausgegeben: **Sound-Alert** in der Terminal-View (Web-Audio-Beep, togglebar), **visuelle Card-Flash plus Unread-Badge** im Dashboard, **Per-Session-Stummschalten** über eine Mute-Toggle auf der Session-Card, und **Web-Push API** als zweiter persistenter Kanal neben den In-App-Signalen (Service-Worker + VAPID, Subscription-Registry unter `~/.claude-code-hub/push-subscriptions.json`). Eine separate Zuverlässigkeits-Welle hat iOS-APNs-Quirks gefixt (Subject-Format, BadJwtToken), den Attention-Gate von tmux-attached auf echte **Per-Device-Presence** umgestellt (Frontend meldet via WS welche Sessions es gerade sieht), und doppelte VAPID-Loader-Loads gehärtet. In-App-Notifications werden supprimiert wenn die Session im Foreground ist, damit keine Lärm-Duplikate durch parallele Kanäle entstehen.

**Terminal Desktop Copy/Paste.** `Shift+Drag` und `Alt+Drag` markieren im Terminal und kopieren das Ergebnis sofort in die Zwischenablage — cross-browser cross-platform. Der Selection-Handler fängt Shift/Alt+Drag direkt am `terminal-container` ab und `stopPropagation()` verhindert dass xterms `CoreMouseService` (der wegen tmux-Mouse-Mode vorher dran ist) die Events sieht. Ein eigenes Teal-Overlay rendert die Markierung, Pixel-zu-Zellen-Math berechnet die tatsächlichen Grid-Koordinaten. Paste funktioniert via `Cmd/Ctrl+V` auf Desktop und Rechtsklick-sofort-einfügen außerhalb Firefox (Firefox zeigt sonst Doppel-UI durch die Permission-Bubble, deshalb Handler-Skip).

**iOS Native-Feel Polish.** Sechs chirurgische Fixes für die Mobile-Terminal-UX. Terminal-Scroll nutzt jetzt die echte xterm-Cell-Height (nicht mehr hardcoded 24px), damit Finger und Content proportional laufen — eine versuchte Sub-Pixel-Smoothness-Variante per `translate3d` hatte Timing-Probleme mit dem tmux-WebSocket-Roundtrip und wurde verworfen. Die `.xterm-helper-textarea` bekommt `autocorrect/autocapitalize/autocomplete=off` und `spellcheck=false`, was das iOS-Composition-Layer-Zeichenverschlucken eliminiert und gleichzeitig die QuickType-Predictive-Bar versteckt (~40-45px vertikaler Platz zurück). Die Touch-Bar über der Tastatur wird rAF-throttled positioniert damit sie sauber mit der Keyboard-Animation mitgleitet. Die vier Pfeiltasten repeaten jetzt bei gedrücktem Finger (400ms Delay → 50ms Interval) via `data-repeat`-Attribut + `pointerdown`-Loop. Ctrl-Sticky wurde gehärtet: ein shared `applyPendingCtrl`-Helper wird von `term.onData` (iOS-Keyboard-Input) und `sendRawInput` (Touch-Bar-Keys) aufgerufen — vorher ignorierten die Touch-Bar-Pfade das Ctrl-Flag, jetzt funktioniert `Ctrl+|` auch via Touch-Bar. 4s-Auto-Release und ein pulsierender teal-Glow machen stale Sticky-States sichtbar. Der globale App-Header wird in Mobile-Terminal-View versteckt (`@media (pointer: coarse)`), weil Back-Nav und Session-Name schon in der `terminal-toolbar` stehen und Settings-Toggles während Terminal-Arbeit nicht gebraucht werden — ~108px vertikaler Platz zurückgewonnen auf iPhones mit Notch, die Terminal-Toolbar übernimmt dafür die `safe-area-inset-top`-Reservierung.


### v0.3.0 — 2026-04-14

**Projekt-Verwaltung Phase 1 Step 3 — Release-Flow, Search, Idea-Capture.**
Der „Version abschließen"-Flow ist drin: neue Writer-Funktion
`finalizeRelease(content, {releaseVersion, newDevVersion, narrative})`
verschiebt alle „In Entwicklung"-Items in die „Released"-Section,
bumpt beide Versions-Header und prependet einen
`### vX.Y.Z — Datum`-Block in die Changelog-Section. Byte-safe:
findet Section-Boundaries per Regex, operiert bottom-up auf einem
`lines`-Array damit obere Indices während der Mutation stabil
bleiben. Narrative wird gegen eingebettete H2-Header validiert
(würde sonst neue Sections in die Roadmap zaubern). Backend-Wrapper
`releaseProject(id, body)` routet das durch `mutateRoadmap`, neues
Endpoint `POST /api/projects/:id/release`. Frontend-Button
„Version abschließen" in der Detail-Toolbar (nur sichtbar wenn
Dev-Items + Versionen vorhanden) öffnet ein Modal mit Prefill
(Release-Version = aktuelle Dev, neue Dev = `+patch`), Textarea für
die Narrative, und 8 neue Unit-Tests für `finalizeRelease` decken
Happy-Path, fehlende Sections, falsche Reihenfolge, H2-Injection und
ungültige Versions ab.

Dashboard-Suche durchsucht jetzt auch Roadmap-Items. Neues Endpoint
`GET /api/projects/search?q=<query>` liest parallel über `mapLimit`
alle registrierten ROADMAP.md-Dateien, parst sie und filtert
case-insensitive über den Item-Text. Ergebnisse werden nach Section
sortiert (dev → backlog → released) damit frische Ideen zuerst auftauchen.
Frontend: das existierende Such-Input bekommt `data-tab-scope="sessions projects"`
(neue Multi-Tab-CSS-Regel), auf dem Projekte-Tab wird die Query
debounced (200ms) an den Server geschickt und die Treffer erscheinen
als „Roadmap-Treffer"-Block unter der Projekt-Liste. Jeder Treffer
zeigt Section-Pill, markierten Text (`<mark>` auf Query-Substring,
XSS-safe via escape-before-highlight) und Projektname, Klick springt
in die Detail-View.

Terminal-Quick-Action „Idee notieren": neuer Toolbar-Button im
Terminal-View, sichtbar wenn der Session-cwd zu einem registrierten
Projekt gehört (Match über den bestehenden `projectsCache`). Klick
blendet einen Inline-Prompt zwischen Toolbar und xterm ein, Enter
schreibt einen neuen Backlog-Item für das gematchte Projekt via
bestehendem `PATCH /api/projects/:id/items`-Endpoint. Der Button
wird nachgezogen wenn der Projekte-Cache erst während der aktiven
Terminal-Session warm wird.

**Projekt-Verwaltung Phase 1 Step 3 — Session-Linking.**
Session-Cards auf dem Dashboard zeigen jetzt ein Projekt-Badge (das
Phase-0-HTML-Stub wurde aktiviert), wenn der pane-cwd unter dem Pfad
eines registrierten Projekts liegt. Match-Logik: längster passender
Projektpfad gewinnt, Pfad-Grenze korrekt (kein String-Prefix auf
Namensebene), damit verschachtelte Projekte sauber aufgelöst werden.
Klick aufs Badge navigiert in die Projekt-Detail-View. Die Projekt-
Liste wird frontend-seitig gecacht und nur bei WS-`project-changed`-
Events invalidiert, damit das 5s-Session-Polling nicht jedes Mal
`/api/projects` mittrifft.

Im Projekt-Detail-View steht oben ein „Offene Sessions"-Panel, das
alle running/dormant Sessions listet deren cwd unter dem Projektpfad
liegt. Running-Dot ist teal glow, dormant grau; Klick auf eine Zeile
verbindet zum Terminal bzw. restauriert die Session. Die Toolbar
rechts hat einen neuen Button „Session hier starten", der das New-
Session-Modal mit dem Projektpfad vor-ausgewählt öffnet — der Tree-
Picker bekommt dafür einen `setSelected`-Setter, damit Prefill
funktioniert, bevor der initiale Browse-Request zurückkommt.

**Projekt-Verwaltung Phase 1 Step 2b — Creation + Live-Sync.**
Foundation-Refactor, Project-Creation und fs.watch-basierte Live-
Synchronisation. `mutateRoadmap` parst die neue Datei jetzt inside-lock
und gibt die frische Roadmap direkt zurück; `patchProject` braucht
dadurch keinen zweiten Registry- und File-Read mehr und die alte Race
zwischen Write und Re-Read ist weg. Die Registry ist ein Long-Lived-
Singleton mit einem neuen `mutateRegistry`-Helper: Clone+Swap im
`withFileLock` sorgt dafür, dass parallele Reader (`listProjects`,
`getProject`) nie halbgare Mutationen sehen, ein JSON-Compare skippt
No-Op-Writes, damit Discovery-Runs keine überflüssigen fs.watch-Events
auslösen. `listProjects` liest File-Inhalte über einen `mapLimit`-Pool
(8 parallel statt Promise.all-All-at-once), und `GET /api/projects`
triggert opportunistisch `discoverProjects` mit 30s-TTL-Throttle plus
Inflight-Dedupe.

Neuer Endpoint `POST /api/projects` legt ein Projekt an: schreibt eine
Template-ROADMAP.md (mit Parser-Rules-Kommentar im Header als Self-
Documentation für beliebige Claude-Sessions im Projekt), registriert
unter slug-ID mit Kollisions-Suffix, und ist path-gated auf `$HOME`.
Frontend hat dafür ein eigenes New-Project-Modal mit Tree-Picker —
der Tree-Picker wurde zu einer Factory refactored, Session- und
Projekt-Modal haben jetzt unabhängige Instanzen. Nach dem Create wird
direkt in die Detail-View gesprungen; Rückkehr aufs Dashboard lädt die
Projekte-Liste neu, damit das neue Projekt sichtbar wird.

Live-Sync via `lib/project-watcher.js`: ein `fs.watch` pro registrierter
ROADMAP.md mit `syncWatchers(registry)` als idempotentem Attach/Detach-
Hub. macOS-Atomic-Rename (tmp+rename) triggert `rename`-Events die den
Handle stalen; der Watcher schließt und re-öffnet dann mit 50ms-Grace.
Per-Projekt-Debounce (80ms) coalesct Event-Bursts und inkrementiert
eine Sequence-ID, die in jedem Broadcast mitfliegt. `mutateRoadmap`
ruft vor dem Rename `noteSelfWrite(path)` auf — der darauffolgende
Event wird innerhalb 400ms gedroppt, damit ein PATCH-Aufrufer keinen
doppelten Rerender durch seinen eigenen Write erlebt. Neuer WS-Endpoint
`/api/projects/events` fan-outet die Events an alle verbundenen Clients
(Auth via `bearer.<token>`-Subprotocol wie das Terminal). Frontend
öffnet die WS on-demand wenn der Projekte-Tab oder eine Detail-View
sichtbar wird, mit Exponential-Backoff-Reconnect (500ms → 30s cap) und
Seq-Dedupe pro Projekt-ID; bei Match rerendert die Detail-View, sonst
die Liste. Externe ROADMAP.md-Edits (im Terminal, anderem Editor, von
Claude selbst im Projekt-cwd) erscheinen dadurch innerhalb von ~100ms
im Hub, ohne dass der User refreshen muss.

Polish im Detail-View: `section-not-found` ist jetzt 409 (nicht 400) —
konsistent mit `stale`, der Client triggert dadurch einen Refresh
statt einen Error-Toast. Meta-Pills ersetzen den rohen `JSON.stringify`-
Dump: `priority: p0/p1/p2` rot/gelb/grau, `theme` teal, `type: decision`
violett. `showProjectToast` hat jetzt eine `success`-Variante (teal
Border + ✓). Scroll-Position und Focus-Target werden vor jedem Re-Render
gemerkt und per `requestAnimationFrame` restauriert — besonders
wichtig mit Live-Sync, wo die View jetzt öfter neu rendert. `prompt()`
beim Add-Item ist durch einen Inline-Text-Input ersetzt (Enter = save,
Esc/Blur-leer = cancel), Live-Sync-Events werden während des Tippens
gedroppt damit der Input nicht geklobbert wird. `confirm()` beim
Delete ist durch ein 2-Klick-Confirm-Pending-Pattern ersetzt (× → ✓?,
Auto-Revert nach 3s).

**Security Headers + SRI.** CSP-Header als Express-Middleware mit
strikter Whitelist für externe Quellen (`cdn.jsdelivr.net`,
`fonts.googleapis.com`, `fonts.gstatic.com`). `script-src`/`style-src`
behalten `'unsafe-inline'` wegen der Single-File-SPA ohne Build-Step,
aber externe Script-Injection ist gedeckelt. Zusätzlich
`X-Content-Type-Options: nosniff` und `Referrer-Policy: no-referrer`.
Alle vier xterm-CDN-Tags haben jetzt `integrity=sha384-…` plus
`crossorigin="anonymous"` — Tampering am CDN würde den Browser das
Laden verweigern lassen.

**Healthcheck.** Neuer `/healthz`-Endpoint (unauthenticated, außerhalb
`/api`) liefert `{status, uptimeSeconds, sessions, activePtys, version}`
als JSON für Cloudflare-Tunnel-Monitoring. `Cache-Control: no-store`,
und der Request-Logger filtert `/healthz` raus, damit Poll-Traffic die
Logs nicht flutet. Dient gleichzeitig als Startpunkt für das spätere
Metrics-Feature.

**Tab-Titel-Badge.** Wenn eine Session `activity === 'waiting'` meldet
(Konfirm-Dialog oder Menü-Prompt in Claude Code), prefixt der Browser-
Tab-Titel mit `(N) Claude Code Hub`. Wird bei jedem Session-Polling
neu berechnet aus dem Activity-Signal, das schon für die Session-Cards
genutzt wird. Kein zusätzlicher Backend-Call.

**Projekt-Verwaltung Polish (Step 2b, Start).** `section-not-found`
liefert jetzt `409` statt `400` — konsistent mit dem Konflikt-Szenario
bei `stale`, der Client triggert dadurch automatisch einen Refresh
statt einen Error-Toast. Meta-Pills im Detail-View ersetzen den rohen
`JSON.stringify(it.meta)`-Dump: `priority: p0/p1/p2` wird rot/gelb/grau,
`theme` teal, `type: decision` violett, alles andere neutral. Und
`showProjectToast()` nimmt eine zweite Variante `success`, die die
Toast-Border teal einfärbt und einen ✓-Prefix bekommt — aktuell nur
beim Item-Hinzufügen im Einsatz.

### v0.2.0 — 2026-04-13

**Projekt-Verwaltung (Phase 0 + Phase 1 Step 1 + Step 2a).**
Ein neuer Dashboard-Tab "Projekte" mit Liste + Detail-View. Im Detail-View
sind Roadmap-Items jetzt klickbar — toggle, add, delete via `PATCH
/api/projects/:id/items`. Write-Back ist atomar (temp-file + rename)
und serialisiert pro ROADMAP.md via `lib/mutations.js` (Per-File-Mutex).
Der Parser `lib/roadmap.js` und der Writer `lib/roadmap-writer.js` haben
zusammen 61 `node:test`-Cases (byte-for-byte Preservation beim Toggle,
stale-Detection bei Line-Mismatch, Control-Char- und Brace-Validation
auf Text/Meta). Registry + Auto-Discovery liegt unter
`~/.claude-code-hub/projects.json`, Scan-Roots per `PROJECT_ROOTS`-Env
überschreibbar. Frontend nutzt Optimistic-UI mit Revert bei Fehler,
Conflict-Toast bei 409, `.disabled`-Gate gegen Doppel-Klick-Races.

**Mobile-Support.**
PWA-Manifest, Apple-Meta, SVG + PNG-Icons, Home-Screen-fähig mit
standalone-Mode. Touch-Toolbar über der iOS-Tastatur mit Esc/Tab/Ctrl
(sticky), Pfeilen und den üblichen Sondertasten — positioniert sich
via `visualViewport`. Safe-Area-Handling via `env(safe-area-inset-*)`
auf allen relevanten Containern, `viewport-fit=cover` im Meta-Tag.
100dvh ersetzt 100vh überall, zusätzlich `--kb-inset` CSS-Variable für
die iOS-Tastaturhöhe. History-State-basierte Zurück-Navigation (native
iOS-Edge-Swipe und Desktop-Browser-Back funktionieren gleichermaßen).
Touch-Scroll im Terminal wird zu SGR-Mouse-Wheel-Escape-Sequenzen
übersetzt und durch tmux Copy-Mode geroutet. Playwright-Regression mit
29 Mobile-Cases.

**Session-Recovery & Adoption.**
`~/.claude-code-hub/sessions.json` persistiert jede jemals erstellte
oder adoptierte Session (Name, cwd, Command, Timestamps). Atomare
Writes via saveQueue, 60-Sekunden-Heartbeat aktualisiert `lastSeenAt`.
Drei Session-States: `running` (live tmux + cc-Prefix oder known),
`dormant` (known aber tmux-los), `foreign` (tmux ohne cc-Prefix und
nicht known). Drei neue Endpoints: `POST /restore`, `POST /adopt`,
`DELETE /known`. UI rendert drei Sections mit eigenen Card-Varianten:
Ruhende Cards haben Diagonal-Stripe-Overlay und Glow-Restore-Button,
fremde Cards haben Corner-Bracket-Marker und Adopt-Modal mit
Name-Input. Alles über Design-Tokens, Light-Theme funktioniert mit.

**Usage / Token-Tracking.**
Parser `lib/usage.js` liest `~/.claude/projects/<mangled-cwd>/*.jsonl`
direkt (kein Admin-API-Key nötig) mit mtime-basiertem LRU-Cache.
Neuer Dashboard-Tab "Usage" zeigt Monats-Summe als Teal-Header,
Model-Breakdown und 30-Tage-Tabelle. Session-Card zeigt jetzt aktuellen
Context ("143k ctx") statt Window-Count. Endpoint
`GET /api/usage/history?days=N` mit 60-Sekunden-Cache. Polling pausiert
im Usage-Tab, andere Tab-Controls werden per `data-tab-scope` blendgated.

### v0.1.0 — Initial Hub

Grundgerüst des Hubs. Express + express-ws Backend auf Port 3333.
tmux-Sessions mit `cc-`-Prefix als Source of Truth, node-pty als
Terminal-Bridge zum Browser. Vanilla-JS Single-File-Frontend mit
xterm.js, Dashboard mit Session-Cards plus Terminal-View. Bearer-Token-
Auth via `.env`, Remote-Zugriff über Cloudflare Tunnel auf
`code.derremo.xyz`. macOS LaunchAgent für Auto-Start beim Login.
Graceful Shutdown beim SIGTERM killt alle PTYs sauber.
