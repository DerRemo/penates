# Usage v2 — Erweiterte Statistiken & Limit-Tracking

## Zusammenfassung

Die bestehende Usage-View (Monatssumme + 30-Tage-Tabelle) wird zu einem
vollwertigen Usage-Dashboard ausgebaut. Neue Datenquellen: Claude Code
Status-Line-JSON (Kosten, Limits, Lines of Code) und erweiterte
JSONL-Analyse (Projekte, Heatmap, Tools, Arbeitsweise). Session-Cards
bekommen strukturierte Limit-Daten statt tmux-capture-pane-Parsing.

## Datenquellen

### Status-Line-JSON (neu)

Claude Code sendet bei jedem Status-Line-Render ein JSON-Objekt an das
konfigurierte Status-Line-Script (`~/.claude/statusline-command.sh`).
Felder die wir nutzen:

```json
{
  "session_id": "09cdb237-...",
  "cwd": "/Users/rocky/Projects/claude-code-hub",
  "model": { "id": "claude-opus-4-6[1m]", "display_name": "Opus 4.6 (1M context)" },
  "version": "2.1.110",
  "cost": {
    "total_cost_usd": 9.14,
    "total_duration_ms": 3225543,
    "total_api_duration_ms": 1467389,
    "total_lines_added": 195,
    "total_lines_removed": 115
  },
  "context_window": {
    "used_percentage": 9,
    "context_window_size": 1000000
  },
  "rate_limits": {
    "five_hour":  { "used_percentage": 71, "resets_at": 1776330000 },
    "seven_day":  { "used_percentage": 51, "resets_at": 1776578400 }
  }
}
```

### JSONL-Dateien (bestehend, erweitert)

`~/.claude/projects/<mangled-cwd>/*.jsonl` — bestehende Datenquelle,
wird um zusätzliche Felder pro Event erweitert:

- `stop_reason` (tool_use / end_turn) — Arbeitsweise
- `content[].type === "tool_use"` + `.name` — Tool-Nutzung
- `sessionId` — Sessions pro Tag
- `cache_read_input_tokens` / `cache_creation_input_tokens` — Cache-Effizienz
- `timestamp` (Wochentag + Stunde) — Heatmap
- `system.subtype === "api_error"` + `.error.status` — API-Errors
- `cwd` — Usage pro Projekt

---

## Architektur

### 1. Status-Line-Script → Hub-Reporting

Das bestehende `~/.claude/statusline-command.sh` wird erweitert: neben
dem Rendern der Zeile sendet es die strukturierten Daten per curl an
den Hub. Throttle: nur bei Wert-Änderung oder alle 60 Sekunden.

```
Claude Code ──stdin JSON──> statusline-command.sh
                                    │
                            ┌───────┴────────┐
                            ▼                ▼
                    render Zeile      curl POST /api/hooks/statusline
                    (stdout)          (throttled, fire-and-forget)
```

**Throttle-Logik im Script:** Das Script schreibt den letzten
gesendeten State + Timestamp in `/tmp/cc-hub-sl-$SESSION_ID.state`.
Beim nächsten Aufruf vergleicht es die relevanten Werte (5h%, 7d%,
cost_usd). Nur wenn sich ein Wert geändert hat oder >60s vergangen
sind, wird gesendet. So vermeiden wir HTTP-Spam bei jedem Keystroke.

**Neuer Hook-Endpoint:** `POST /api/hooks/statusline`
- Auth: Bearer-Token (wie andere Hooks)
- Session-ID: `X-CC-Hub-Session` Header
- Body: das relevante Subset des Status-Line-JSON

### 2. Hub-seitige Verarbeitung

**In-Memory State (pro Session):**
`statuslineState: Map<sessionName, {pct5h, pct7d, resets5h, resets7d, costUsd, durationMs, apiDurationMs, linesAdded, linesRemoved, model, contextPct, contextSize, updatedAt}>`

Wird bei jedem Hook-POST aktualisiert. Session-Enrichment in
`GET /api/sessions` liest aus dieser Map statt aus capture-pane.
Frische-Window: 120s (Status-Line feuert häufiger als Hooks).

**Historisches Limit-Log:**
`~/.claude-code-hub/usage-limits.jsonl` — append-only.

Format pro Zeile:
```json
{"t":"2026-04-16T09:30:00Z","5h":71,"7d":51,"r5h":1776330000,"r7d":1776578400}
```

Schreiblogik: nur bei Wert-Änderung oder alle 5 Minuten. Rotation bei >5MB
(älteste Hälfte trimmen). Bei 1 Write/5min = ~15KB/Tag = ~1.4MB/90 Tage.

### 3. Neues Modul: `lib/usage-limits.js`

```
recordStatusline(sessionName, data)
  → schreibt In-Memory-State
  → appended Limit-Log (throttled)

getSessionStatusline(sessionName)
  → liefert aktuellen State oder null

getLimitHistory({days})
  → liest usage-limits.jsonl
  → gibt Datenpunkte + Peaks + aktuelle Werte zurück

getAllSessionCosts()
  → aggregiert cost_usd über alle Sessions
  → liefert Gesamtkosten + Breakdown pro Session
```

### 4. `lib/usage.js` erweitern

`parseFileFull` extrahiert zusätzliche Felder pro Event. Neue Funktion
`getDailyUsageV2({days})` gibt zurück:

```js
{
  // Bestehend (unverändert)
  days: [{ date, input, output, byModel }],
  monthTotal: Number,
  monthByModel: {},

  // Neu
  byProject: [{ project, path, tokens }],        // Top-Projekte diesen Monat
  heatmap: [{ dow, hour, tokens }],               // 7x24 Matrix (dow 0=Mo)
  cacheRate: { read, total, pct },                 // Cache-Hit-Rate Monat
  workStyle: { toolUse, endTurn, total },           // Stop-Reason-Verteilung
  toolUsage: [{ name, count }],                    // Top-10 Tools Monat
  dailySessions: { [date]: count },                // Sessions pro Tag
  monthSessions: Number,                           // Sessions Monat
  errors: { total, byDate: [{ date, count }] },   // API-Errors pro Tag
}
```

### 5. Neue Endpoints

| Method | Route | Beschreibung |
|--------|-------|---|
| POST | `/api/hooks/statusline` | Status-Line-Daten empfangen. Auth via Bearer, Session via `X-CC-Hub-Session`. Body: Subset des SL-JSON. |
| GET | `/api/usage/limits?days=7` | Limit-History + aktuelle Werte + Peaks. 30s-Cache. |
| GET | `/api/usage/costs` | Aggregierte Kosten aus allen aktiven Session-States. 10s-Cache. |

`GET /api/usage/history?days=30` — bestehendes Endpoint, liefert jetzt
das erweiterte Payload aus `getDailyUsageV2`.

### 6. Wegfall: `tmux capture-pane` für Usage

`parseUsagePct5h` wird entfernt. `usagePct5h` in der Session-Response
wird ersetzt durch:

```js
{
  limits: {
    pct5h: 71,
    pct7d: 51,
    resets5h: 1776330000,   // Unix timestamp
    resets7d: 1776578400,
    updatedAt: "..."
  },
  cost: {
    totalUsd: 9.14,
    durationMs: 3225543,
    linesAdded: 195,
    linesRemoved: 115
  }
}
```

Der `?preview=1`-Parameter und die capture-pane-Logik in der
Session-Liste werden entfernt. Session-Previews sind nicht mehr nötig.

---

## Frontend: Usage-View Redesign

### Layout (Dashboard-Grid)

Desktop (>768px): Zwei-Spalten-Grid wo sinnvoll.
Mobile (<768px): alles vertikal gestackt.

```
┌──────────────────────────────────────────────────────────┐
│                    SUMMARY CARDS (4er Row)                │
│ ┌────────────┬────────────┬────────────┬────────────┐    │
│ │  $47.20    │ 142        │ 78%        │ 64%        │    │
│ │  Kosten    │ Sessions   │ Cache-Rate │ Autonom    │    │
│ │  Monat     │ Monat      │ Monat      │ Tool-Ketten│    │
│ └────────────┴────────────┴────────────┴────────────┘    │
├──────────────────────────────────────────────────────────┤
│                    LIMIT-STATUS                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 5h  ████████████████░░░░  71%    Reset in 1h 23m  │   │
│ │ 7d  ██████████░░░░░░░░░░  51%    Reset in 3d 4h   │   │
│ │                                                    │   │
│ │ Letzte 7 Tage: 3x >90% (5h) · 0x >90% (7d)       │   │
│ │ [Sparkline 5h]  [Sparkline 7d]                     │   │
│ └────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│          HEATMAP              │     TOP PROJEKTE         │
│ ┌──────────────────────────┐ │ ┌──────────────────────┐ │
│ │    0  3  6  9  12 15 18  │ │ │ claude-code-hub      │ │
│ │ Mo ░░░░░▒▒▓██░░░░░▒▒░░  │ │ │ ████████████  $18.40 │ │
│ │ Di ░░░░▒▒▓▓██░░░░▒▒░░░  │ │ │ packliste            │ │
│ │ Mi ░░░░░░▒▒▓█░░░░░▒░░░  │ │ │ ██████       $8.20   │ │
│ │ Do ░░░░░▒▒▓▓██░░░░░░░░  │ │ │ portfolio            │ │
│ │ Fr ░░░░░▒▒▓██░░░░░░░░░  │ │ │ ████         $5.10   │ │
│ │ Sa ░░░░░░░░▒░░░░░░░░░░  │ │ │ ...                  │ │
│ │ So ░░░░░░░░░░░░░░░░░░░  │ │ │                      │ │
│ └──────────────────────────┘ │ └──────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│     30-TAGE-TABELLE           │     TOOL-NUTZUNG         │
│ ┌──────────────────────────┐ │ ┌──────────────────────┐ │
│ │ Datum  In   Out  $ Sess  │ │ │ Edit  ████████  312  │ │
│ │ 04-16  1.2M 340k $3.20 4│ │ │ Read  ██████   248  │ │
│ │ 04-15  2.8M 890k $7.80 8│ │ │ Bash  █████    201  │ │
│ │ 04-14  ...               │ │ │ Grep  ████     178  │ │
│ │                  ⚠3 Err  │ │ │ Write ███      112  │ │
│ └──────────────────────────┘ │ └──────────────────────┘ │
├──────────────────────────────────────────────────────────┤
│                    ARBEITSWEISE                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ ██████████████████████░░░░░░░░░░░░                 │   │
│ │ Tool-Ketten 64%          Direkte Antworten 36%     │   │
│ └────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│                   PRODUKTIVITÄT                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ +4.280 Zeilen  /  -2.140 Zeilen  /  53h API-Zeit  │   │
│ │ diesen Monat      diesen Monat      diesen Monat   │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Summary-Cards (4er Row)

| Card | Wert | Quelle |
|------|------|--------|
| Kosten Monat | `$47.20` | Primär: Summe aller StatusLine `cost.total_cost_usd` (exakt). Fallback: JSONL Token × Modell-Preis (Schätzung). Label zeigt "~" Prefix bei Schätzung. |
| Sessions Monat | `142` | Unique sessionIds aus JSONL |
| Cache-Rate | `78%` | cache_read / (cache_read + input + cache_creation) aus JSONL |
| Autonom | `64%` | stop_reason tool_use / total aus JSONL |

Mobile: 2x2 Grid. Jede Card: Label oben (12px, uppercase, muted),
Wert groß (32px, JetBrains Mono, Teal), kein Sub-Text.

### Limit-Status

Prominente Card direkt unter den Summary-Cards. Enthält:

**Fortschrittsbalken (5h + 7d):**
- Div mit `width: N%` und Hintergrundfarbe:
  - `--teal` bei <60%
  - `--amber` bei 60-85%
  - `--red` bei >85%
- Rechts daneben: **Live-Countdown** bis Reset ("Reset in 1h 23m")
  - Berechnet aus `resets_at` Unix-Timestamp minus `Date.now()`
  - Aktualisiert per `setInterval` jede Minute
  - Gleiche Farb-Codierung wie Balken
  - Bei >90%: Countdown wird `font-size: 16px` statt 13px (prominenter)

**Peak-Summary:** "Letzte 7 Tage: 3x >90% (5h) · 0x >90% (7d)"
Gelesen aus `GET /api/usage/limits?days=7`.

**Sparklines:** Zwei CSS-only Sparklines (168 schmale divs = 24/Tag × 7 Tage)
zeigen den 5h/7d-Verlauf der letzten Woche. Höhe proportional zum
Prozentwert, Farb-Codierung wie bei den Balken.

**Daten-Herkunft:** Aktuelle Werte aus dem Session-State (via
`/api/sessions`-Enrichment). History aus `/api/usage/limits`.

**Kein-Daten-State:** Wenn keine StatusLine-Daten vorhanden sind
(Sessions ohne Hub-Reporting), zeigt die Card "Keine Limit-Daten —
Status-Line-Reporting nicht aktiv" mit Link zur Einrichtung.

### Heatmap (7x24)

CSS Grid, 7 Zeilen (Mo-So) × 24 Spalten (Stunden 0-23).

- Zellen: 16×16px Quadrate mit `border-radius: 2px`
- Farb-Skala: 5 Stufen von `transparent` (0) über
  `rgba(45,212,191,0.15/0.35/0.6/0.85)` bis `var(--teal)` (Max)
- Schwellwerte: relativ zum Maximum im Zeitraum (0 / 25% / 50% / 75% / 100%)
- Achsen-Labels: Mo-So links (13px, muted), 0/3/6/9/12/15/18/21 oben
- Hover-Tooltip: "Dienstag 14:00 — 234k Tokens"
- Mobile (<768px): horizontal scrollbar mit sticky Labels-Spalte

Datenquelle: `heatmap`-Array aus `getDailyUsageV2`.

### Top-Projekte

Ranking-Liste, max 8 Einträge. Sortiert nach Token-Verbrauch diesen Monat.

- Projektname links (abgeleitet aus cwd: letztes Pfad-Segment)
- Horizontaler Balken (width relativ zum Top-Projekt) + Kosten rechts
- Kosten: Token-basierte Schätzung (Input-Tokens × Modell-Preis +
  Output-Tokens × Modell-Preis) oder aggregiert aus StatusLine-cost
  falls vorhanden
- Hover: voller Pfad als Tooltip

Datenquelle: `byProject`-Array aus `getDailyUsageV2`.

### 30-Tage-Tabelle (erweitert)

Bestehende Tabelle plus neue Spalten:

| Datum | Input | Output | Kosten | Sessions | Errors |
|-------|-------|--------|--------|----------|--------|

- **Kosten:** Token-basierte Schätzung pro Tag
- **Sessions:** Unique sessionIds pro Tag
- **Errors:** Rotes Warn-Icon mit Count als Tooltip (nur wenn >0)
- Tage mit >0 Errors bekommen einen subtilen roten linken Border

Datenquelle: `days` + `dailySessions` + `errors.byDate` aus `getDailyUsageV2`.

### Tool-Nutzung (Top 10)

Horizontale Balken. Tool-Name links (13px, monospace), Balken + Count rechts.

- Balkenbreite relativ zum meistgenutzten Tool
- Farbe: `var(--teal)` für alle Balken
- Sortiert nach Count absteigend

Datenquelle: `toolUsage` aus `getDailyUsageV2`.

### Arbeitsweise

Ein gestackter horizontaler Balken (volle Breite):

- Links: Teal-Segment "Tool-Ketten N%" (stop_reason: tool_use)
- Rechts: Grau-Segment "Direkte Antworten N%" (stop_reason: end_turn)
- Legende unter dem Balken

Datenquelle: `workStyle` aus `getDailyUsageV2`.

### Produktivität

Drei Werte in einer Row (wie Summary-Cards aber kleiner):

- **+N Zeilen** (Lines Added, grün)
- **-N Zeilen** (Lines Removed, rot)
- **Xh API-Zeit** (total_api_duration_ms, muted)

Aggregiert aus StatusLine-cost über alle Sessions diesen Monat.
Wenn keine StatusLine-Daten: Section wird ausgeblendet.

Datenquelle: `GET /api/usage/costs`.

---

## Session-Cards: Neue Limit-Anzeige

### Bisherig

```
5h 77%    (geparst aus tmux capture-pane via parseUsagePct5h)
```

### Neu

```
5h 71% · 7d 51%    (aus StatusLine-Hook)
```

- Beide Werte mit Farb-Codierung (grün/amber/rot)
- Hover-Tooltip: "5h Reset in 1h 23m · 7d Reset in 3d 4h"
- Fallback wenn keine StatusLine-Daten: "—" (kein Badge)

### Wegfall

- `parseUsagePct5h()` wird entfernt
- `?preview=1` capture-pane-Logik wird entfernt
- `usagePct5h` Feld wird ersetzt durch `limits` + `cost` Objekte

---

## Status-Line-Script: Erweiterung

`~/.claude/statusline-command.sh` wird erweitert um den Hub-Report.
Throttle via State-File `/tmp/cc-hub-sl-<session-id>.state`.

Pseudo-Logik:

```sh
# Nach dem bestehenden Rendering...
if [ -n "$CC_HUB_URL" ] && [ -n "$CC_HUB_TOKEN" ]; then
  state_file="/tmp/cc-hub-sl-${session_id}.state"
  current="${five_hour}:${seven_day}:${cost_usd}"
  last=$(cat "$state_file" 2>/dev/null | cut -d: -f1-3)
  last_ts=$(cat "$state_file" 2>/dev/null | cut -d: -f4)
  now=$(date +%s)
  elapsed=$(( now - ${last_ts:-0} ))

  if [ "$current" != "$last" ] || [ "$elapsed" -ge 60 ]; then
    # Sende relevantes Subset als JSON
    curl -fsS -m 2 -X POST "$CC_HUB_URL/api/hooks/statusline" \
      -H "Authorization: Bearer $CC_HUB_TOKEN" \
      -H "X-CC-Hub-Session: $CC_HUB_SESSION" \
      -H "Content-Type: application/json" \
      -d "$payload" >/dev/null 2>&1 &
    echo "${current}:${now}" > "$state_file"
  fi
fi
```

**Installation:** `setup.sh` aktualisiert das Script idempotent.
Bestehende User-Anpassungen am Rendering-Teil bleiben erhalten
(der Hub-Report wird als Block am Ende angehängt, mit Sentinel-Kommentar).

---

## Token-zu-Kosten-Schätzung

Für die Dollar-Werte in der 30-Tage-Tabelle und Projekt-Ranking nutzen
wir eine Token-basierte Schätzung als Fallback wenn keine StatusLine-cost
vorhanden ist. Preistabelle in `lib/usage.js`:

```js
const MODEL_PRICING = {  // USD pro 1M Tokens
  'claude-opus-4-6':   { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3,  output: 15 },
  'claude-haiku-4-5':  { input: 0.80, output: 4 },
};
```

Cache-Reads werden mit 90% Rabatt auf den Input-Preis berechnet
(Anthropic Prompt Caching Pricing). Diese Schätzung ist ein Richtwert,
keine exakte Abrechnung.

---

## Technische Entscheidungen

- **Kein Chart-Library:** Heatmap, Balken, Sparklines als reines HTML/CSS
  (div-Grids, width-Prozent). Konsistent mit No-Dependencies-Frontend.
- **Kein Polling-Loop für Limits:** StatusLine-Script pusht aktiv.
  Kein `setInterval` im Backend.
- **Countdown client-seitig:** `resets_at` wird einmal geliefert,
  der Countdown läuft per `setInterval(60000)` im Browser.
- **Fallback ohne StatusLine-Daten:** Sections die StatusLine-Daten
  brauchen (Limits, Produktivität, Kosten-Card) zeigen Fallback-State
  oder werden ausgeblendet. JSONL-basierte Sections funktionieren immer.
- **Cache-Strategie:** `/api/usage/history` 60s-Cache (unverändert),
  `/api/usage/limits` 30s-Cache, `/api/usage/costs` 10s-Cache.

## Scope-Abgrenzung

- Kein Cost-Alerting / Budget-Limits
- Kein Export (CSV/JSON) der Statistiken
- Keine historischen Kosten pro Session (nur aktueller Snapshot)
- Keine Vergleichs-Ansicht (Monat vs. Vormonat)
- Sparklines in der Limit-Card sind optional — können in v1 auch
  als einfache Textzeile ("3x >90%") starten

## Testing

- **Unit (lib/usage-limits.test.js):** recordStatusline Throttle-Logik,
  getLimitHistory Parsing + Rotation, getAllSessionCosts Aggregation
- **Unit (lib/usage.test.js):** getDailyUsageV2 neue Felder
  (byProject, heatmap, cacheRate, workStyle, toolUsage, errors)
- **E2E:** Usage-Tab öffnen, Summary-Cards sichtbar, Limit-Status
  mit Balken + Countdown, Heatmap rendert 7x24 Grid, Tabelle hat
  neue Spalten. Mobile: vertikales Stacking, Heatmap scrollbar.
