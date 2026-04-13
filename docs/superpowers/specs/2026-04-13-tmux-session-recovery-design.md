# tmux Session Recovery & Adoption — Design

**Stand:** 2026-04-13
**Status:** Approved (Brainstorming), bereit für Implementation-Plan

## Ziel

Ein Weg im Claude Code Hub, verlorene tmux-Sessions wiederherzustellen und fremde tmux-Sessions zu adoptieren. Deckt drei Szenarien ab:

1. **Reboot-Recovery** — nach Mac-Neustart ist der tmux-Server leer. Der Hub kennt die zuletzt bekannten Sessions und bietet sie manuell zur Wiederherstellung an.
2. **Kill-Recovery** — versehentlich beendete Sessions bleiben in der „bekannten"-Liste und lassen sich genauso wiederherstellen wie Reboot-Verluste.
3. **Adoption** — tmux-Sessions ohne `cc-`-Prefix (manuell im Terminal angelegt) sind im Hub sichtbar und können mit einem Klick übernommen werden.

## Nicht-Ziele

- Kein Auto-Restore nach Reboot — bewusst manuell (User will entscheiden, was wirklich noch gebraucht wird).
- Keine Unterscheidung „gekillt vs. Reboot-verloren" in der UI — der Zustand ist `dormant` (bekannt, nicht laufend), der Grund ist egal.
- Kein tmux-resurrect / Plugin-Setup — eigene JSON-Persistenz reicht.
- Kein Kill-Undo mit Timer — Kill ist und bleibt destruktiv, Recovery läuft über die normale Dormant-Section.

## Architektur

### Datenmodell

Persistenz in `~/.claude-code-hub/sessions.json`:

```json
{
  "knownSessions": [
    {
      "name": "cc-website",
      "directory": "/Users/rocky/Projects/website",
      "command": "claude",
      "createdAt": "2026-04-13T10:00:00Z",
      "lastSeenAt": "2026-04-13T18:30:00Z"
    }
  ]
}
```

**Felder:**
- `name` — inklusive `cc-`-Prefix, identisch zum tmux-Session-Namen
- `directory` — absoluter Pfad, wie bei Create übergeben
- `command` — der Start-Command (default `claude`)
- `createdAt` — ISO-Timestamp, gesetzt beim ersten Create
- `lastSeenAt` — ISO-Timestamp, geupdatet solange die Session läuft

**Schreibzeitpunkte:**
- **Create** (`POST /api/sessions`) — neuer Eintrag, `createdAt = lastSeenAt = now`
- **Rename** (`PATCH /api/sessions/:name`) — Name-Feld aktualisiert, Rest bleibt
- **Adopt** (`POST /api/sessions/:name/adopt`) — neuer Eintrag aus fremder Session
- **Vergessen** (`DELETE /api/sessions/:name/known`) — Eintrag entfernt
- **Periodischer Heartbeat** — alle 60s werden `lastSeenAt`-Felder aller aktuell laufenden, bekannten Sessions auf `now` gesetzt und die Datei neu geschrieben (atomarer Write)

**Atomare Writes:** temp-file + `fs.rename`, damit ein Crash mitten im Write die Datei nicht korrumpiert.

**Lesen:** einmalig beim Server-Start, danach im Memory. Alle Mutationen schreiben Memory + Datei.

**Keine Auto-Löschung:** Einträge bleiben für immer, bis der User „Vergessen" klickt. Kein Max-Count, kein Age-Limit.

### Status-Berechnung

Bei jedem `/api/sessions`-Call wird der Status jeder Card aus zwei Quellen gemerged:

- `tmux list-sessions` (wie bisher)
- `knownSessions` aus dem Memory

**Status-Regeln:**

| Status | Bedingung |
|---|---|
| `running` | tmux kennt die Session UND (sie steht in `knownSessions` ODER hat `cc-`-Prefix) |
| `dormant` | steht in `knownSessions`, tmux kennt sie nicht |
| `foreign` | tmux kennt sie, KEIN `cc-`-Prefix, nicht in `knownSessions` |

`cc-`-prefixed Sessions, die im tmux existieren aber nicht in `knownSessions` stehen (z.B. von einer älteren Hub-Version übrig), gelten als `running` und werden beim nächsten Heartbeat automatisch in `knownSessions` nachgetragen („best-effort Adoption").

### Server-Endpoints

Bestehende Endpoints bleiben im Kern unverändert, `GET /api/sessions` wird um ein `status`-Feld pro Card erweitert.

Neu:

| Method | Route | Beschreibung |
|---|---|---|
| POST | `/api/sessions/:name/restore` | Erstellt eine `dormant` Session neu (selber Name, cwd, Command). **Fehler:** 404 wenn nicht in `knownSessions`; 409 wenn Name bereits läuft. |
| POST | `/api/sessions/:name/adopt` | Benennt eine `foreign` Session auf `cc-<newName>` um und schreibt sie in `knownSessions`. Body: `{ newName }` (Whitelist `^[\w\-. ]{1,64}$`). **Fehler:** 404 wenn Quell-Session nicht existiert; 409 bei Namenskonflikt; 400 bei Whitelist-Verletzung. |
| DELETE | `/api/sessions/:name/known` | Entfernt einen Eintrag aus `knownSessions` (tmux unberührt). Nur für `dormant` sinnvoll. **Fehler:** 404 wenn nicht vorhanden. |

**Bestehende Endpoints mit Verhaltensänderung:**

- `DELETE /api/sessions/:name` — killt nur die tmux-Session, `knownSessions`-Eintrag bleibt stehen (damit Restore möglich ist). „Komplett weg" bedeutet: erst `DELETE /api/sessions/:name`, dann `DELETE /api/sessions/:name/known`.
- `PATCH /api/sessions/:name` (Rename) — muss zusätzlich den Namen in `knownSessions` nachziehen.
- `POST /api/sessions` (Create) — schreibt zusätzlich den neuen Eintrag.

**Auth:** alle neuen Endpoints Bearer-auth wie der Rest.

**Implementierung:** neues Modul `lib/known-sessions.js` mit:
- `load()` / `save()` (atomarer Write)
- `add(entry)` / `remove(name)` / `rename(oldName, newName)` / `touch(name)` (lastSeenAt)
- `list()` — Copy der In-Memory-Liste
- Einmal beim Start aus `~/.claude-code-hub/sessions.json` laden, Verzeichnis bei Bedarf anlegen.

## UI

Sessions-Tab bekommt drei Sections mit kleinen Headern. Jede Section wird nur gerendert, wenn sie nicht-leer ist. Card-Grid bleibt grundsätzlich wie heute, Section-Header sind kleine uppercase-Labels in Monospace, mit dünner Trenn-Linie.

### Section „AKTIV"

Bestehende Session-Cards, Verhalten unverändert. Preview, Attach-Click, Rename, Kill.

### Section „RUHEND"

Cards mit identischer Geometrie, aber:
- Body-Content auf ca. 50% Opacity
- Statt Live-Preview: Stub mit `cwd`, `command`, `„Zuletzt gesehen vor 3h"` (relative time aus `lastSeenAt`)
- **Primary-CTA:** `▶ Wiederherstellen` (Teal-Button) → `POST /api/sessions/:name/restore`
- **Secondary-Icon:** `🗑 Vergessen` → `DELETE /api/sessions/:name/known`, mit Toast-Confirmation
- Kein Attach-Click auf die Card selbst (Card ist kein Link)
- Kein Rename, kein Kill (gibt's ja nichts zu killen)

### Section „FREMD"

Cards mit Preview wie aktive (Preview kommt aus `tmux capture-pane` wie heute), aber:
- **Teal-Dashed-Border** statt Solid als visuelles Signal
- Kleines `tmux`-Label oben rechts (statt Hub-Logo-Slot)
- **Primary-CTA:** `+ Adoptieren` öffnet ein kleines Modal mit vorbelegtem Namensfeld (Original-Name ohne `cc-`-Prefix). User kann den Namen ändern, Submit → `POST /api/sessions/:name/adopt`.
- Attach weiterhin möglich — praktisch für Read-only-Blick, bevor man adoptiert.
- Kein Rename-Button, kein Kill-Button (bewusste Einschränkung — fremde Sessions fasst der Hub nur über den Adopt-Pfad an).

### Empty-State

- Wenn alle drei Sections leer sind: bestehender globaler Empty-State („Noch keine Sessions").
- Wenn nur „Aktiv" leer ist, aber Ruhend/Fremd etwas enthalten: kein globaler Empty-State, die vorhandenen Section-Header werden normal gerendert.

### Polling

Keine Änderung am 2s-Polling-Intervall. Alle drei Kategorien kommen aus demselben `/api/sessions`-Call, die Section-Zuordnung passiert client-seitig anhand des neuen `status`-Feldes.

### Visual Polish

Die detaillierte visuelle Ausarbeitung (exakte Farben, Spacing, Section-Header-Typo, Hover-States, Animation der Opacity/Border, Modal-Polish) wird in der Implementation-Phase mit der `frontend-design`-Skill gemacht — dieser Spec legt nur Struktur und Verhalten fest.

## Error-Handling & Edge Cases

- **`sessions.json` korrupt** → beim Start parsen, bei Fehler umbenennen zu `sessions.json.corrupt-<timestamp>`, leer weitermachen, Warnung im stderr.
- **Verzeichnis `~/.claude-code-hub/` fehlt** → beim ersten Write anlegen.
- **Restore-Konflikt** (Name existiert schon als foreign oder running) → 409, UI zeigt Toast „Name schon in Benutzung".
- **Restore eines Commands, der nicht mehr existiert** (z.B. CLI deinstalliert) → tmux-Session wird angelegt, stirbt sofort, wird beim nächsten Refresh wieder als `dormant` gelistet. Kein Spezial-Handling im Hub.
- **Adopt-Konflikt** (cc-Name existiert schon) → 409, Modal zeigt Fehler inline.
- **Heartbeat-Write schlägt fehl** → Fehler loggen, nicht crashen. Nächster Heartbeat versucht's wieder.
- **File-Lock / paralleler Hub-Prozess** → aktuell nicht abgesichert; Hub läuft als single LaunchAgent, Race unwahrscheinlich. Atomare Writes reichen für das Hobby-Setup.

## Testing

Kein Test-Framework im Repo. Manuelle Verifikation + Playwright-Ad-hoc-Script (wie bei Mobile-Support) für die UI-Flows:

**Backend-Smoke-Tests (manuell via curl):**
1. Create Session → Eintrag in `sessions.json`
2. Kill Session → Eintrag bleibt, Status `dormant` in `/api/sessions`
3. Restore → neue tmux-Session mit gleichem cwd/Command, Status zurück auf `running`
4. Manuell `tmux new-session -s test-foreign` → erscheint als `foreign`
5. Adopt mit Namen „imported" → wird zu `cc-imported`, Eintrag in `sessions.json`
6. Vergessen → Eintrag weg, Session bleibt (sie lief ja)

**Frontend-Smoke-Tests (Playwright, ad-hoc):**
1. Drei Sections rendern nur wenn nicht-leer
2. Dormant-Card zeigt „Wiederherstellen"-Button, Klick ruft Endpoint
3. Foreign-Card hat Dashed-Border und Adopt-Modal
4. Toast bei 409-Fehlern

## Migration

Beim ersten Start nach Deployment:
- `~/.claude-code-hub/sessions.json` existiert nicht → leere Struktur initialisieren
- Alle aktuell laufenden `cc-*`-Sessions werden beim ersten `/api/sessions`-Call als `running` erkannt und automatisch in `knownSessions` nachgetragen (best-effort Adoption, siehe Status-Regeln)
- Keine Datenverluste, keine Downtime

## Roadmap-Eintrag (todo.md)

Nach Implementation wird unter P0 ein neuer Punkt ergänzt (oder P1 wenn andere P0-Items Priorität haben):

> **Session-Recovery & Adoption** — `sessions.json`-Persistenz + drei Status-Kategorien (Aktiv/Ruhend/Fremd) + Restore/Adopt/Vergessen-Endpoints + UI-Sections im Sessions-Tab.
