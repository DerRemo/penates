# Claude Code Hub — Roadmap

Stand: 2026-04-13. Lebendes Dokument, gepflegt über die Projekt-Verwaltung
im Hub selbst. Struktur folgt dem `lib/roadmap.js`-Parser:
H2-Sections Released / In Development / Backlog / Changelog,
Top-Level-Checkboxen mit optionalem `{key: value}`-Meta-Suffix.

## Released: v0.7.1

Housekeeping release. i18n foundation with EN/DE toggle, dedicated
Settings-Page in the sidebar (replaces 4 header-right toggle buttons),
update-check against GitHub Releases with inline changelog, and File-
Download in the Filebrowser.

- [x] i18n: Strings extrahieren in Plain-JS-Modul plus DE-Bundle plus Toggle EN/Deutsch {priority: p1, theme: i18n}
- [x] Settings-Page als eigener Sidebar-Tab ganz unten mit Appearance Language Notifications Help About — ersetzt alle 4 Header-Buttons Push Sound Theme Kbd-Help {priority: p1, theme: ux}
- [x] Update-Check GitHub Releases API beim Boot plus 12h Intervall plus Teal-Dot am Settings-Sidebar-Eintrag plus Changelog-Rendering inline in About-Sektion {priority: p1, theme: dev-x}
- [x] File-Download im Filebrowser — Streaming-Route ohne Size-Limit plus Download-Eintrag im Context-Menu plus Download-Button auf Oversize-Preview {priority: p1, theme: filebrowser}

## In Development: v0.7.2

- [x] Codex-Spawn: codex und codex --yolo im New-Session-Dropdown (minimale Multi-CLI-Scheibe; Hooks/Usage in Paket A) {priority: p0, theme: multi-cli}
- [x] Multi-CLI Spawn Kern-Drei — CLI-Picker mit Varianten plus CLI-Icon auf Session-Cards {priority: p0, theme: multi-cli}
- [x] Sidebar-Session-Filter: Toggle Aktiv/Alle versteckt dormant-Sessions, localStorage-persistiert, Default Aktiv plus Attached-Exception {priority: p1, theme: ux}
- [x] moshi-hook Daten-Schicht — account-level Limits plus Recent-Dirs-Picker plus setup.sh-Install {priority: p1, theme: interop}
- [x] Diff-Viewer: native Diff-View pro Session — unstaged/staged/untracked, Einstieg über Git-Badge, diff2html, Live-Refresh über File-Watcher
- [x] Diff-Viewer als rechtes Panel plus Toggle statt Vollbild-Ansicht — Badge verbindet zur Session und öffnet das Panel {priority: p1, theme: diff}
- [x] Files-Picker für jede Session — auch ohne registriertes Projekt via session-Quelle aus der live aufgelösten cwd {priority: p1, theme: filebrowser}
- [x] Drag and Drop aus dem FileBrowser ins Terminal als @-Mention — Datei oder Ordner ziehen fügt den Pfad in die Eingabe ein {priority: p1, theme: filebrowser}
- [x] Files-Preview-Diff als rechte Split-Panels — gegenseitig exklusiv, per-Session-Open-State, Files rechts angedockt statt links {priority: p1, theme: ux}
- [x] Terminal-Stack-Migration: xterm 5.3.0 (CDN, deprecated) auf @xterm/xterm 6.0 lokal vendored plus webgl-Renderer plus unicode-graphemes; Custom-Clipboard/Selection auf 6.0-Baseline gestrippt plus minimaler Cmd+C {priority: p1, theme: terminal}
- [x] Terminal-View-Redesign: Calm-Card-Terminal plus Icon-only-Toolbar mit gruppierten Toggles und Hairline-Divider, themed CSS-Tooltips, Active-State fuer offene Panels, Git-Dirty-Dot am Diff-Toggle, Connecting-Overlay, Fokus-Ring, CLI-Logo plus cwd-Tooltip am Namen, Doppelklick-Inline-Rename; Kill-Button entfernt, Back-Button mobile-only, Conn-Status nur bei Problem {priority: p1, theme: terminal}
- [x] Repo-Panel / Git-Browser: Files plus Diff zu einem getabbten Repo-Panel zusammengelegt (Files plus Changes plus History plus Branches), ein konsolidierter Repo-Toggle mit Git-Dot, List-Diff-Toggle in Changes plus Commit-Quelle, lineare Commit-Timeline mit Typ-Farben und Ref-Badges, Branches local/remote read-only; neues lib/git-history.js (getLog/getBranches/showCommit) plus drei git-Routen. Files-v2 Browse ist der editierbare Files-Tab (kein separates Browse). {priority: p1, theme: git}

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
- [x] Board-Spawn-Priming auf argv umgestellt: Prompt als initiales CLI-Argument via CCH_PRIME_PROMPT-Env-Var statt send-keys-Tippmaschinerie — primeSession durch schlanken Trust-Gate-Watchdog ersetzt {priority: p1, theme: board}
- [x] Board-Spawn vereinheitlicht: Bewegen-in-Spalte startet die Session (Drag + Stage-Dropdown via geteilter applyTransition), Implement-Route advanced brainstorming→implement selbst, Detail-Buttons auf attach-only-when-alive reduziert {priority: p1, theme: board}
## Changelog

### v0.7.2 — 2026-06-08

**Preview-Panel-Redesign (Browser-Chrome + Calm-Card).** Das letzte rechte Split-Panel im Alt-Chrome — die Browser-Preview — in die Catppuccin-Calm-Card-Sprache von Repo-Panel und Terminal-View überführt. Reiner Frontend-Reskin+Restruktur, **kein** Backend-Eingriff (`preview-proxy.js`/`port-scan.js`, Single-Host-Modell, `/select`-Flow, iframe-URL-Schema, Combobox-Logik, Resizer/Per-Session-Memory alle 1:1; alle Element-IDs erhalten → bestehende E2E grün). Die flache, hartkodierte Toolbar (`6px`/`8px`-Pixel, literale Fallback-Hex `#2dd4bf`/`#16181d`, rohe Glyph-Buttons `⟳ ↗ ×`) wurde zu einer **einzeiligen Browser-Chrome**: `[reload] · Adressleiste · [open-tab] · [close]`. Die **Adressleiste** ist eine getokte Pille (`--bg-elevated`, `--radius-md`, `focus-within`→Akzent-Rand) mit visuellem `:`-Prefix-Adornment (rein CSS via `:has(:placeholder-shown)` — Feldwert bleibt reine Ziffern, Tests greifen unverändert), dem editierbaren Port-Feld (mono), einem **Prozess-Chip** (zeigt `vite`/`next`/… nur wenn der aktive Port in `ports[]` einen Prozess hat, sonst `hidden`), Chevron und der getokten Port-Dropdown (`--shadow-card`, Akzent-Tint via `--accent-soft`). Buttons sind icon-only Ghost-SVGs (Reuse `.btn.btn-ghost.btn-sm`, quadratisch wie die Terminal-Toolbar) mit den globalen `[data-tooltip]`-CSS-Tooltips (pointer:fine, native `title` als A11y-Fallback). Die Empty-/Error-States (Overlay bleibt der Positionierungs-Container) sind jetzt ruhige `.empty-state`-Karten — Icon + Überschrift + Subtext + optional kontextuelle Aktion: **Kein Port gewählt** → „Port wählen" (fokussiert Combobox + öffnet Liste), **Kein Dev-Server gefunden** → „Ports neu scannen", **Kein Server auf :X** → „Ports neu scannen" + Retry, **Preview nicht konfiguriert** (enthält weiterhin `PREVIEW_DOMAIN`, keine Aktion). Neu nur additiv: `updateProcessChip()` + die State-Render-Helper (`showState`/`clearOverlay`/`stateChoosePort`/`stateNoPorts`/`stateNoServer`/`stateNotConfigured`); restliche PreviewPanel-Logik unverändert. Sechs neue i18n-Keys (en/de, Parität) nur für die Überschriften + Action-Labels; bestehende `preview.empty.*`/`preview.error.*` als Subtext weiterverwendet. Verifikation: token-lint + Frontend-Unit 39/39 grün (keine undefined `var()`), Backend-Unit unverändert (einzige Failure die bekannte pre-existing `usage-limits.test.js`-Datums-Flake, auf main identisch), `browser-preview.spec.js` 7/7 auf desktop **und** mobile/webkit (2 neue TDD-Specs: Prozess-Chip show/hide, Empty-State-Aktion), Regressions-Specs `terminal-view-redesign`/`repo-panel` 13/13 grün, echte tmux-Session-Screenshots aller vier States in Latte + Mocha auf 1280×800 und 390×844 (hallmark-Audit: 0 critical/major/minor — ships clean). Voller iframe-Proxy-Round-Trip nur auf der echten Deployment `preview.derremo.xyz` verifizierbar (manueller Schritt, Playwright kann CF-Tunnel/DNS nicht reproduzieren).

**Repo-Panel / Git-Browser (Files + Diff zusammengelegt, History + Branches neu).** Die zwei getrennten rechten Panels (Files-Sidebar + Diff-Panel) zu einem getabbten „Repo"-Panel vereint — Tab-Leiste Files · Changes · History · Branches in der Catppuccin-Calm-Card-Sprache, mutual-exclusive mit der Browser-Preview (die separat bleibt). Die früheren Files- und Diff-Toggles wurden zu EINEM `#btn-toggle-repo` konsolidiert (Branch-Icon, Preview-Toggle bleibt), der Git-Dirty-Dot vom Diff- auf den Repo-Toggle umgehängt (TerminalGitDot/PanelToggleSync wiederverwendet, nicht neu gebaut). **Files-Tab** hostet den bestehenden FileBrowser-v2-Tree intakt (re-parented in `#repo-pane-files`, inkl. inline Catppuccin-SVG-Icons, Multi-Select, Suche, Filter, Git-Marker, themed Dialogen) — RepoPanel besitzt nur noch die Panel-Sichtbarkeit, FileBrowser bleibt Logik-Owner. **Changes-Tab** hostet DiffView mit neuem List⇄Diff-Toggle (List: Datei-Zeilen mit Status-Dot + Icon + numstat; Diff: diff2html) und einer Commit-Quelle (Working-Tree default; ein Commit, wenn aus History gewählt, mit „← Working tree"-Zurück). **History-Tab** (neu): lineare Commit-Timeline mit Verbindungslinie + Dot, conventional-commit-typ-farbigen Labels (`commit-type.js`, pure + getestet), Ref-Badges, relativer Zeit, Paginierung („Load more"), Tap-Commit → Changes. **Branches-Tab** (neu): LOCAL/REMOTE read-only mit current-Marker, upstream, ahead/behind. Backend: neues `lib/git-history.js` (`getLog`/`getBranches`/`showCommit`, alle `execFileSync`-argv, fehlertolerant, sha-validiert, teilt git/splitUnifiedDiff/parseNumstat mit `git-diff.js`) hinter drei Routen `GET /api/sessions/:name/git/{log,branches,commit/:sha}` (Muster wie `/diff`). Verifikation: Backend-Unit +9 (`git-history.test.js` gegen Temp-Repo-Fixture inkl. Root-Commit/oversize/sha-Validierung), Frontend-Unit +3 (`commit-type.test.js`), token-lint grün (`--repo-width` registriert), gezielte E2E `repo-panel`/`diff-viewer`/`filebrowser`/`terminal-view-redesign` auf desktop+mobile grün, echte tmux-Session-Screenshots (Files-Icons nicht regressiert, History/Branches rendern) auf 1280×800 + 390×844 in Latte und Mocha. Einzige verbleibende Unit-Failure ist die bekannte pre-existing `usage-limits.test.js`-Datums-Flake (unverändert von main).

**Terminal-View-Redesign (Entschlackung + Calm-Card).** Die Terminal-View-Chrome komplett in die Catppuccin-Calm-Card-Sprache überführt — bei byte-für-byte unveränderter Terminal-Funktion (WS/PTY, Hooks, tmux, Suche, Clipboard, Touch-Bar, Keyboard, Reconnect). Der Terminal-Pane ist jetzt eine abgerundete, beschattete Card mit Außenabstand (auf Touch near-full-bleed, radius 0). Die Toolbar ist icon-only: quadratische Ghost-Icon-Buttons, gruppiert Panel-Toggles (Files/Preview/Diff) | Hairline-Divider | Eingabe-Aktionen (Bild/Voice/Suche/Idea), mit themed CSS-Tooltips (`[data-tooltip]`, nur pointer:fine, reduce-motion-aware) statt nativem title (title bleibt als A11y-Fallback). Der offene-Panel-Toggle trägt einen Akzent-Tint (`.is-active`), getrieben von einem entkoppelten MutationObserver auf den drei Panel-`.open`-Markern (kein Eingriff in FileBrowser/PreviewPanel/DiffView). Ein oranger Git-Dirty-Dot am Diff-Toggle zeigt uncommittete Änderungen der Session-cwd — initial aus dem `git.dirty`-Feld der Session-Liste, live über eine eigene `/api/files/events`-Subscription mit Connect-Lebenszyklus plus autoritativem `/diff`-Initial-Refetch. Ein ruhiges Connecting-Overlay (Spinner über der dunklen Card) erscheint solange nicht connected; ein dezenter Akzent-Fokus-Ring liegt an, wenn das Terminal Tastatur-Fokus hat (xterm-Helper-Textarea focus/blur). Links neben dem Namen steht das CLI-Brand-Logo (via `cardCliLogo`, Fallback-Glyph), der volle cwd-Pfad ist als Tooltip an der Namen-Gruppe (nicht am Namen-Span — dessen overflow:hidden würde das Tooltip klippen). Doppelklick auf den Namen öffnet ein Inline-Rename (PATCH /api/sessions/:name {newName}); nach Erfolg wird `currentSessionName` auf den server-zurückgegebenen prefixed Namen gezogen, damit der WS-Reconnect-Loop weiter greift. Der Conn-Status ist im Normalbetrieb (connected) per CSS unsichtbar und erscheint nur bei connecting/disconnected/Reconnect (setConnStatus-Logik unverändert). Der Kill-Button wurde aus der Toolbar entfernt (Kill läuft über die Dashboard-Card → dormant); der Back-Button ist desktop-hidden (Sidebar bietet Dashboard) und nur auf Touch sichtbar, wo der globale Header versteckt ist. Aufgeräumt: tote `.terminal-header*`-CSS gelöscht. Verifikation: 12 neue E2E-Tests in `terminal-view-redesign.spec.js` (desktop + mobile), Kill-/Back-Specs auf den Card-Pfad umgestellt, Frontend-Unit 25/25, Backend-Unit 269/270 (eine pre-existing date-relative usage-limits-Flake, unrelated), Terminal-/Search-/Diff-/Conn-Robustness-Specs grün, echte tmux-Session-Screenshots auf 1280×800 und 390×844. Bekannte pre-existing Mobile-Flake: zwei diff-viewer-Tests klicken die Session-Card direkt ohne den Mobile-Drawer zu schließen (fail auch auf main).

### v0.7.2 — 2026-06-03

**Settings-Redesign (4 Phasen).** Die Settings-Seite — bis dato die einzige verbliebene View im Alt-Chrome — komplett neu gebaut in der Catppuccin-Calm-Card-Sprache von Übersicht/Projekte/Usage: `app-topbar`-Header, `seclabel`-Sektionen, Token-only-Farben, sticky Anker-Chip-Reihe mit IntersectionObserver-Scrollspy (springt zu Sektionen, leuchtet beim Scrollen mit, mobil horizontal scrollbar, gated auf Reduce-Motion). Sieben Sektionen: Darstellung, Terminal, Benachrichtigungen, Verhalten, Server & Features, Konto & Daten, Hilfe & Über. Alle bestehenden Controls 1:1 migriert mit stabilen IDs — null Funktionsverlust, das bestehende Init-Wiring (Sound/Push/Remote-Approval/About/Update-Check) läuft unverändert weiter.

**Client-Prefs (public/prefs.js).** Neues pures, unit-getestetes Modul `public/prefs.js` (DEFAULTS exakt gleich dem bisherigen Verhalten plus Coercer/Clamps, importierbar von Browser und node:test wie clis.js/usage-format.js) plus ein `window.Prefs`-Glue in index.html (localStorage `cchub_pref_*`, typisierte Getter, `applyGlobal` setzt `data-reduce-motion`/`data-density` auf `<html>`). Neue Einstellungen: **Terminal** (Schriftgröße live aufs offene xterm via `window._fitAddon`, Scrollback, Cursor-Stil, Copy-on-Select, Bell-Flash), **Darstellung** (Animationen als Reduce-Motion-Toggle, Dichte als `--space-*`-Token-Overrides), **Lautstärke** (skaliert die Attention-Beep-Gain), **Verhalten** (Start-Ansicht über `initialNavView`, Default-CLI plus Modus als Vorwahl im New-Session-Modal über `renderCliPicker`, Vor-dem-Beenden-bestätigen gated `killSession`), **Konto & Daten** (Abmelden, Lokale Einstellungen zurücksetzen mit 2-Klick-Confirm). Defaults sind so gewählt dass eine unangetastete Installation sich identisch wie vorher verhält. Gefangener Bug: die Pref-Initializer liefen beim Boot vor dem async `Prefs.load()` und gaben Fallback-Werte statt gespeicherter zurück — gefixt per `await Prefs.load()` in jedem Initializer plus inline-validiertem `landingView`-Getter für den Cold-Boot.

**Server-Persistenz (lib/settings.js + /api/settings).** Neue atomare Persistenz-Schicht `lib/settings.js` (Vorbild `known-sessions.js`: tmp+rename, Save-Queue, Corrupt-Backup) unter `~/.claude-code-hub/settings.json` — speichert nur explizite Overrides, `get()` merged sie über die beim `load()` übergebenen env-Defaults. `GET /api/settings` liefert konsolidiert die effektiven Settings plus Live-Status (Version, Uptime, aktive Sessions, aktive PTYs) plus Feature-Flags (Voice, Preview, Cloudflare Access, Web-Push, Projekt-/Browse-Roots); `PATCH /api/settings` validiert per Whitelist, persistiert und re-applied live (tmux `set-option`). tmux-Maus und Remote-Approval sind damit persistent — Remote-Approval war vorher reiner In-Memory-State der bei jedem Neustart auf den env-Default zurückfiel. Die neue „Server & Features"-Sektion rendert Status plus Feature-Flags read-only plus den live persistenten tmux-Maus-Toggle.

**Server-Control (lib/server-control.js).** Drei Macht-Aktionen in der Server-Sektion. `POST /api/server/restart` startet den Hub via `launchctl kickstart -k gui/<uid>/<label>` neu — launchd-geguarded (409 wenn nicht launchd-verwaltet, damit ein manueller `npm start` nicht ohne Relaunch gekillt wird), audit-logged als `server.restart`, Response-zuerst-dann-Kickstart, 2-Klick-Confirm im UI. `GET /api/server/logs` tailt stdout/stderr (Stream-Whitelist, byte-bounded `tailFile`) in ein `<pre>`-Modal mit stdout/stderr-Tabs und Refresh. `POST /api/version/check` forciert den Update-Check und aktualisiert die About-Sektion plus den Sidebar-Dot. Restart real bewiesen: uptime 1297 → 0 nach dem POST plus passender Audit-Eintrag.

**Testing plus gefangene Bugs.** Die neuen Module sind unit-getestet (`public/prefs.js`, `lib/settings.js`, `lib/server-control.js` mit injiziertem exec für den launchd-Check und byte-capped `tailFile`). Die Settings-E2E ist auf 60 Tests gewachsen (7 Anker-Chips, alle Sektionen, Pref-Persistenz über Reload, Logout, Server-Panel-Render, Logs-Modal, Restart-2-Klick — die Server-Control-Routen werden gemockt damit Tests nie den echten Server neu starten). Drei echte Bugs wurden durch die Verifikations-Loops gefangen, nicht erst im finalen Lauf: der async-Pref-Race (oben), ein Server-Panel-Boot-Race (das Panel holte `/api/settings` nur einmal beim Boot und blieb bei einem Race auf „nicht verfügbar" hängen → Fix per Re-Fetch in `setView` bei jedem Settings-Öffnen, was den Status gleich frisch statt als Boot-Snapshot macht), und ein webkit-mobile-E2E-Flake unter Parallel-Last → `/api/settings` in den betroffenen Tests gemockt für deterministisches Panel-Rendering. Unit 294, Settings-E2E 60/60 stabil (zweimal mit `--retries=0` bestätigt).


**Terminal-Stack-Migration (xterm 6.0).** Der Terminal lädt nicht mehr `xterm@5.3.0` (CDN, deprecated) sondern `@xterm/xterm@6.0.0` — lokal vendored unter `public/vendor/xterm/` (npm als Versions-Quelle, `npm run vendor:xterm`-Copy-Schritt plus setup.sh-Hook plus `lib/vendor-version.test.js`-Drift-Guard). Same-origin, daher **SRI entfällt** (0 CDN-Refs für xterm). Der hand-gerollte Custom-Clipboard/Selection-Block (~180 Zeilen Shift/Alt+Drag-Pixel-Math, eigener Cmd+C, Paste-Intercept, Firefox-Rechtsklick) wurde auf die 6.0-**Baseline** gestrippt: `macOptionClickForcesSelection:true` statt eigener Selektion, nur ein minimaler Cmd+C-Handler mit SIGINT-Guard bleibt; der Image-Paste-Zweig ist erhalten. Neu aktiv: `webgl`-Renderer (mit `onContextLoss`→DOM-Fallback) und `unicode-graphemes` (korrekte Wide-Char/Emoji-Breite) — in echter Session bestätigt aktiv (Canvas-Renderer, `activeVersion=15-graphemes`, ⏺⎿✻/Umlaute/CJK rendern sauber). Das `web-fonts`-Addon wurde bewusst **nicht** adoptiert (peer-dependt nur gegen die 6.1-Beta und bräche ein sauberes `npm install`; der bewährte `document.fonts`-Preload bleibt). Verifikation: Unit 270/270 (inkl. Drift-Guard), Terminal-/Clipboard-/Image-Paste-E2E (desktop+webkit) grün, echte tmux-Session-Smoke mit Screenshots. Hintergrund: `xterm@5.3.0` war die letzte Version unter dem deprecateten Paketnamen `xterm` (Rename zu `@xterm/*` ab 5.4). Offen als Backlog: 7 weitere E2E-Specs klicken noch den im Redesign entfernten `#refresh-btn` (nur `terminal.spec.js` wurde hier mitgefixt); `web-fonts` adoptieren sobald stable-gegen-stable.

### v0.7.1 — 2026-04-18

**i18n-Fundament (lib/i18n.js + public/locales/ + inline bootstrap).** Neues Modul `lib/i18n.js` mit `createTranslator(bundles, initialLang)`-Factory: pure, testbar, Fallback-Chain `currentLang → en → key`, `{var}`-Interpolation via Regex, Guard gegen nullish in `setLang`. Dieselbe Funktion inline in `public/index.html` als ~15-Zeilen-Kopie mit bewusst akzeptierter Duplikation (single-file SPA, kein Build-Step). Bundles in `public/locales/en.js` + `de.js` als klassische Scripts die `window.__I18N_BUNDLES.{en,de}` populieren — vor dem Main-Script ins `<head>` geladen, `window.t` garantiert verfügbar wenn der Body parst. `applyI18nToDom(root)` iteriert bei DOMContentLoaded einmal über `[data-i18n]` (textContent) und `[data-i18n-attr]` (Attribute im Format `attr:key;attr:key`). Zusätzlich `data-i18n-html` für Labels mit eingebetteten `<strong>`/`<code>` Kindern (sonst würde textContent die Kinder stripppen). 344 Keys identisch in beiden Bundles gepflegt, Parity via sort-diff verifiziert. DE-Strings aus Git-History vor v0.7.0 zurückgewonnen (Commit `6db1883^` als Quelle); v0.7.1-eigene Strings frisch übersetzt. Die Fehler-Keys `preview.error`, `toast.projectError`, `projects.error`, `projects.detail.itemError` wurden zu `common.errorWithMessage` konsolidiert. `formatAge` / `formatRelativeTime` auf `time.*`-Keys umgezogen (waren vorher hartcodiert Deutsch trotz EN-UI). Sprach-Switch passiert über die neue Settings-Page → Language-Sektion, persistiert in `localStorage.cchub_lang`, synchronisiert `document.documentElement.lang` für Screenreader und nutzt `location.reload()` als Re-Render-Strategie (einfacher als alle dynamischen Views neu zu rendern).

**Settings-Page (neuer Sidebar-Tab).** Neuer Nav-Eintrag am unteren Ende der Sidebar, visuell abgesetzt via `margin-top: auto` + `border-top`. Click öffnet eine Content-Page mit 5 Sektionen: **Appearance** (Theme Light/Dark Segment-Buttons), **Language** (EN/DE Segment-Buttons + Reload-Hinweis), **Notifications** (Sound-Toggle + Push-Toggle mit Permission-State-Anzeige default/granted/denied/unsupported), **Help** (Keyboard-Shortcuts-Link der das bestehende Kbd-Help-Modal öffnet), **About** (aktuelle Version, Uptime aus `/healthz`, letzte Release-Version, Release-Link, inline gerenderter Changelog). Alle 4 Header-Right-Buttons (`#push-toggle`, `#sound-toggle`, `#theme-toggle`, `#kbd-help-trigger`) wurden entfernt — ihre Handler (`setTheme`, `setSoundEnabled`, `enablePush`/`disablePush`, `toggleHelp`) leben weiter und werden von der Settings-Page direkt aufgerufen. Bi-direktionale UI-Sync via `window._settingsAppearanceSync` / `_settingsPushSync` — Theme-Änderung von irgendwo aktualisiert alle Indikator-States. Mobile Touch-Target auf 44px erhöht. Der globale `?`-Shortcut für Keyboard-Help bleibt unverändert erhalten.

**Update-Check + Changelog (lib/update-check.js + lib/markdown-mini.js + /api/version).** `lib/update-check.js` exportiert `semverGt(a,b)` (tolerant gegenüber `v`-Prefix, falsch bei malformed Input) und `createChecker({current, fetch, url, timeoutMs})` als In-Memory-State-Factory. `check()` pollt `api.github.com/repos/DerRemo/claude-code-hub/releases/latest`, parst Tag-Name, vergleicht via Semver, behält bei Fehlern den letzten erfolgreichen State und setzt nur `error` + `checkedAt` (kein State-Loss bei transienten 403/Network-Down). `server.js` feuert `setImmediate(() => updateChecker.check())` beim Boot und `setInterval(…, 12h).unref()` danach. `GET /api/version` returniert den State unter Bearer-Auth. Frontend-Boot fetcht einmalig, cached als `window.__versionInfo`, rendert Teal-Dot am Sidebar-Settings-Entry bei `isNewer: true`, populiert `#settings-latest-version` mit „(new version available)"-Suffix und den Release-Body als HTML via `lib/markdown-mini.js` — ein ~50-Zeilen-Markdown-Subset (`##` h3, `###` h4, `**bold**`, `*italic*`, `_italic_`, `` `code` ``, `[text](url)`, `-`/`*` ul, Paragraphs). XSS-safe: `escapeHtml` auf allen Text-Segmenten inklusive URL-Werten. 13 Unit-Tests decken alle Syntax-Fälle ab. Als separater Fix: `/healthz` liest Version jetzt aus `package.json` statt `process.env.npm_package_version` (unter LaunchAgent leer). Frontend hat dieselbe `renderMarkdownMini`-Kopie inline mit Verweis-Kommentar auf die getestete Quelldatei.

**File-Download (streamFileToResponse + /api/projects/:id/files/download).** Neue `streamFileToResponse(projectRoot, relPath, res)` in `lib/files.js`: Path-Guard via `resolveSafe`, ENOENT in `FileError('not-found')` gewrappt (sonst hätte `handleFileError` fallthrough auf 500 gegeben), `not-a-file` bei Directories, Content-Disposition mit sowohl `filename="<ascii-fallback>"` als auch `filename*=UTF-8''<percent-encoded>` für RFC-5987-Konformität, Stream-Error-Handler um Process-Crashes bei Mid-Transfer-IO-Fehlern zu verhindern. Express-Route `GET /api/projects/:id/files/download` hinter Bearer-Auth, 403/400/404/500-Mapping. Frontend `downloadFile()` nutzt authenticated `fetch` → `blob` → synthetisches `<a download>` mit `URL.createObjectURL` + `.revokeObjectURL`-Cleanup (klassische `<a href>` würden den Bearer-Token nicht senden). Context-Menu-Entry „Download" im File-Tree sichtbar nur für Files (nicht Directories), plus neuer „Download file"-Button im Preview-Modal für Oversize-Dateien (die bisher nur Metadaten zeigten). 5 Unit-Tests (Happy-Path, RFC 5987, Path-Guard, Directory-Throw, Missing-File), Playwright-E2E für den kompletten Right-Click-Download-Flow.

**Testing.** 141 Unit-Tests (13 neue für i18n, 9 für update-check + semver, 13 für markdown-mini, 5 für streamFileToResponse). Playwright-E2E erweitert um Settings-Nav + Language-Toggle + Update-Dot-Mock + File-Download. 7 pre-existing Tests gefixt die auf die entfernten Header-Button-IDs (`#theme-toggle`, `#sound-toggle`, `#push-toggle`, `#kbd-help-trigger`) bzw. hartcodierte deutsche Strings (`Umbenennen`, `In Papierkorb`, `Pfad`) referenzierten. Test-Suite läuft grün: 56 pass, 11 expected skips, 0 failures.


### v0.7.0 — 2026-04-16

**Usage Dashboard (lib/usage.js + lib/usage-limits.js + frontend).** Full usage analytics dashboard with six data views: Summary cards (monthly cost, sessions, cache rate, autonomous tool chains), limit status with live countdown bars and reset timers, time-of-day activity heatmap (7x24 grid), top projects by token usage, tool usage top-10 with work style breakdown (autonomous chains vs direct answers), and productivity metrics (lines added/removed, API duration). Two data pipelines feed the dashboard: StatusLine JSON from Claude Code hooks delivers live limit percentages with reset countdowns, session costs, and context metrics via POST /api/hooks/statusline; JSONL analysis reads ~/.claude/projects/ session logs for historical aggregation. Session cards show 5h + 7d usage limits with color-coded badges and reset countdown tooltips, replacing the old tmux capture-pane parsing.

**English-only UI.** Complete translation of all German user-facing strings to English across the entire frontend — buttons, labels, tooltips, aria-labels, toast notifications, modal dialogs, form placeholders, status badges, keyboard shortcut overlay, usage dashboard labels, project detail view, and file browser. Roadmap section headers renamed from In Entwicklung/Backlog Ideen to In Development/Backlog Ideas, with parser regex, writer output, project template, and all 54 tests updated. Usage percentages on session cards and dashboard rounded to whole numbers.


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
