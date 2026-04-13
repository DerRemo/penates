# Claude Code Hub — Roadmap

Stand: 2026-04-13. Lebendes Dokument, gepflegt über die Projekt-Verwaltung
im Hub selbst. Struktur folgt dem `lib/roadmap.js`-Parser:
H2-Sections Released / In Entwicklung / Backlog / Changelog,
Top-Level-Checkboxen mit optionalem `{key: value}`-Meta-Suffix.

## Released: v0.2.0

Großes Feature-Release am 2026-04-13 — Mobile, Session-Recovery,
Usage-Tracking und die erste dogfoodbare Version der Projekt-Verwaltung.

- [x] Mobile-Support — PWA, Touch-Toolbar, Safe-Area, History-Back {ship: 2026-04-13}
- [x] Terminal Touch-Scroll über SGR-Mouse-Wheel-Sequenzen {ship: 2026-04-13}
- [x] Session-Recovery & Adoption — known-sessions.json mit running/dormant/foreign {ship: 2026-04-13}
- [x] Session-Adopt-Modal für fremde tmux-Sessions {ship: 2026-04-13}
- [x] Usage-Tab mit Monats-Summe, Model-Breakdown und 30-Tage-Tabelle {ship: 2026-04-13}
- [x] Session-Card zeigt Context-Tokens statt Window-Count {ship: 2026-04-13}
- [x] Projekt-Verwaltung Phase 0 — View-Manager-Refactor und Tab-Shell {ship: 2026-04-13}
- [x] Projekt-Verwaltung Phase 1 Step 1 — read-only Liste und Detail-View {ship: 2026-04-13}
- [x] Projekt-Verwaltung Phase 1 Step 2a — Write-Back mit atomarem Mutex {ship: 2026-04-13}

## In Entwicklung: v0.3.0

Projekt-Verwaltung Step 2b (Project-Creation + Live-Sync) und Step 3
(Session-Linking + Release-Flow). Reihenfolge: Prereqs zuerst, dann
Creation, dann Watcher, dann Session-Verknüpfung.

- [ ] Re-Read inside mutateRoadmap lock — Prereq fürs Watcher-Race {priority: high, step: 2b}
- [ ] mutateRoadmap liefert fresh Roadmap inside-lock zurück {step: 2b}
- [ ] Registry als Long-Lived-Singleton refactoren {step: 2b}
- [ ] POST /api/projects mit Template-ROADMAP.md {step: 2b}
- [ ] Tree-Picker-Integration im New-Project-Modal {step: 2b}
- [ ] Discovery-on-Read in GET /api/projects {step: 2b}
- [ ] listProjects mit Concurrency-Cap für große Setups {step: 2b}
- [ ] fs.watch pro registrierter ROADMAP.md {step: 2b}
- [ ] Watcher-Debounce 50-100ms plus Sequenz-IDs {step: 2b}
- [ ] WebSocket-Broadcast an offene Detail-Views {step: 2b}
- [ ] Registry-Write-Mutex via withFileLock {step: 2b}
- [ ] section-not-found sollte 409 statt 400 sein {step: 2b}
- [ ] Scroll- und Focus-Preservation beim Re-Render {step: 2b}
- [ ] Meta-Pills statt JSON.stringify im Frontend {step: 2b}
- [ ] Inline-Input statt prompt und confirm für Add/Delete {step: 2b}
- [ ] Themed Success-Variante für project-toast {step: 2b}
- [ ] Session-Badge via cwd-Prefix-Match auf Session-Cards {step: 3}
- [ ] Projekt-Detail listet offene Sessions im cwd {step: 3}
- [ ] Button Session hier starten im Projekt-Detail {step: 3}
- [ ] Version-abschliessen-Flow mit Release-Notes-Generator {step: 3}
- [ ] Terminal-Quick-Action Idee zu Backlog {step: 3}
- [ ] Dashboard-Search matcht auch Roadmap-Items {step: 3}

## Backlog / Ideen

Alles was bis 2026-04-13 in der alten `todo.md` unter P0/P1/P2 stand und
noch nicht shipped ist. Nach ursprünglicher Priorität und Thema gruppiert.

- [ ] Multi-CLI: CLI-Typ als Session-Metadatum plus Icon im UI {priority: p0, theme: multi-cli}
- [ ] Multi-CLI: Preset-Profile im New-Session-Modal {priority: p0, theme: multi-cli}
- [ ] Multi-CLI: Per-CLI-Auth via .env.cli.name oder profiles-Ordner {priority: p0, theme: multi-cli}
- [ ] Remote-Zugriff: Cloudflare Access oder Tailscale vor dem Tunnel {priority: p0, theme: security}
- [ ] Remote-Zugriff: Passkey/WebAuthn-Login statt Bearer-Token {priority: p0, theme: security}
- [ ] Remote-Zugriff: Rate-Limiting auf REST-Endpoints {priority: p0, theme: security}
- [ ] Remote-Zugriff: Audit-Log wer hat wann welche Session attached {priority: p0, theme: security}
- [ ] Notifications: Telegram-DM wenn Claude auf Input wartet {priority: p0, theme: notifications}
- [ ] Notifications: Attention-Detection via tmux capture-pane Parser {priority: p0, theme: notifications}
- [ ] Notifications: Badge-Count im Browser-Tab-Titel {priority: p0, theme: notifications}
- [ ] Notifications: Per-Session Stummschalten {priority: p0, theme: notifications}
- [ ] Notifications: Sound-Alert in der Terminal-View {priority: p0, theme: notifications}
- [ ] Session-Templates / Favoriten mit vorausgefülltem cwd und Command {priority: p1, theme: sessions}
- [ ] Bulk-Actions: alle idle- oder unattached-Sessions beenden {priority: p1, theme: sessions}
- [ ] Session-Pinning für wichtige Sessions oben sortiert {priority: p1, theme: sessions}
- [ ] Split-View mit zwei Terminals nebeneinander für große Screens {priority: p1, theme: sessions}
- [ ] asciinema-Style Recording plus Replay als cast-Export {priority: p1, theme: sessions}
- [ ] Read-only-Share-Link mit kurzlebigem Token für Live-Debugging {priority: p1, theme: sessions}
- [ ] Git-Status-Widget pro Session — Branch, Dirty, Ahead/Behind {priority: p1, theme: productivity}
- [ ] Datei-Upload per Drag und Drop ins Terminal {priority: p1, theme: productivity}
- [ ] Prompt-Snippet-Library mit Klick-to-paste {priority: p1, theme: productivity}
- [ ] /healthz-Endpoint für Cloudflare Tunnel-Monitoring {priority: p1, theme: observability}
- [ ] Structured Logging via pino statt console.log {priority: p1, theme: observability}
- [ ] Basic Metrics: aktive Sessions, Uptime, Reconnect-Count {priority: p1, theme: observability}
- [ ] Web-Client Auto-Reload nach Server-Restart {priority: p1, theme: observability}
- [ ] Web-Push API als zweiter Notification-Kanal neben Telegram {priority: p1, theme: notifications}
- [ ] E2E-Tests als Dauer-Setup mit Playwright {priority: p2, theme: dev-x}
- [ ] ESLint und Prettier auf server.js und inline-JS {priority: p2, theme: dev-x}
- [ ] Docker-Image für Linux/NAS weg von Mac-only {priority: p2, theme: dev-x}
- [ ] Request-Validation via zod oder joi auf POST/PATCH-Bodies {priority: p2, theme: dev-x}
- [ ] GitHub Actions CI mit Lint und Tests auf Push {priority: p2, theme: dev-x}
- [ ] CSP-Header gegen XSS-Folgeschäden {priority: p2, theme: security}
- [ ] Subresource-Integrity für xterm.js-CDN-Scripts {priority: p2, theme: security}
- [ ] CSRF-Token auf mutierende Endpoints falls Cookie-Auth kommt {priority: p2, theme: security}
- [ ] Token-Rotation per Schedule monatlich {priority: p2, theme: security}
- [ ] /api/browse Allow-List via ENV statt nur HOME {priority: p2, theme: security}
- [ ] Offene Frage: welche CLIs neben claude reinsollen — gemini/codex/aider/cursor {type: decision}
- [ ] Offene Frage: Hub single-user oder multi-user {type: decision}
- [ ] Offene Frage: Notifications-Kanal — Telegram allein oder mit Web-Push/macOS {type: decision}
- [ ] Offene Frage: Remote-Access-Weg — Cloudflare Access ODER Tailscale {type: decision}
- [ ] Offene Frage: Token-Auth — Bearer bleiben oder Passkey/WebAuthn {type: decision}
- [ ] Item-Auto-Prompt — Klick aufs Roadmap-Item spawnt Session im Projekt-cwd und sendet den Item-Text als ersten Prompt an Claude {theme: session-link}

## Changelog

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
