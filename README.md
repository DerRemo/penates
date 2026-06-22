# Penates

Web-Interface zum Verwalten und Fernsteuern von Coding-CLI-Sessions (Claude Code, Codex, Antigravity, opencode) auf deinem Mac oder Linux-Rechner,
erreichbar per Browser, auch vom iPhone aus.

![Penates Screenshot](screenshot.png)

---

## Was macht das?

Penates ist ein kleiner Server, der auf deinem Mac mini läuft. Er zeigt dir alle laufenden Coding-CLI-Sessions in einem Dashboard und lässt dich per Browser ins Terminal einsteigen, von deinem Mac, iPad oder iPhone aus, auch über das Internet. Über einen CLI-Picker startest du Sessions mit **Claude Code** (Anthropic), **Codex** (OpenAI), **Antigravity** (Google `agy`) oder **opencode**, jeweils mit gestuften Approval-/Sandbox-Varianten. Claude Code ist die am tiefsten integrierte CLI (Hook-basierte Notifications, Usage-Tracking, Image-Paste); die anderen laufen als vollwertige Terminal-Sessions, jede mit ihrem eigenen Login.

**Features:**
- Dashboard mit allen Sessions und Live-Status (Aktivität, Context-Tokens, 5h-Limit)
- Terminal im Browser (vollständig, mit Farben, Shift/Alt+Drag zum Kopieren)
- Sessions starten, verbinden, beenden, umbenennen
- **Multi-CLI**: Claude Code, Codex, Antigravity und opencode per CLI-Picker (mit Approval-/Sandbox-Varianten), CLI-Badge auf jeder Session-Card
- **Bulk-Aktion**: alle idle/unattached Sessions auf einen Klick beenden
- **Pinning** für wichtige Sessions (sortiert oben auf dem Dashboard)
- **Git-Status** pro Session-Card (Branch, dirty-Dot, ↑n/↓n Ahead/Behind)
- Projekt-Verwaltung mit Roadmap-Ansicht und Version-abschließen-Flow
- Usage-Tracking (Kosten, Token, 5h-Limit)
- Notifications über Sound, Visual, Web-Push und Per-Session-Mute
- PWA: als App auf dem iPhone-Homescreen installierbar, nativer iOS-Feel (eine native iOS-Begleit-App ist in Arbeit, *coming soon*)
- **Session-Auto-Restore**: nach einem Reboot fährt der Hub die zuletzt laufenden Sessions automatisch wieder hoch (native tmux-Continuum, fortgesetzte CLI-Konversation)
- Auto-Start nach Reboot via macOS LaunchAgent (Linux: systemd `--user`-Unit)
- **Security**: Bearer-Token-Auth, optional Cloudflare Access (Zero Trust) davor, Rate-Limiting auf REST-Endpoints, Append-only Audit-Log (`~/.penates/audit.log`)

---

## Voraussetzungen

Du brauchst diese Programme auf deinem Mac mini, bevor du anfängst.

> **Linux?** Penates läuft auch nativ auf Linux (Debian/Ubuntu, Fedora/RHEL, Arch; Windows nur via WSL2). Nutze dafür den [Ein-Zeilen-Installer](#schnellstart-ein-befehl) unten (er erkennt den Paketmanager) und die [Plattform-Hinweise](https://penates.dev/docs/install/platforms/) in der Doku. Die folgenden Schritte beschreiben den macOS-Weg.

### 1. Xcode Command Line Tools

Öffne das Terminal (Programme → Dienstprogramme → Terminal) und tippe:

```bash
xcode-select --install
```

Ein Fenster öffnet sich. Auf „Installieren" klicken und warten (ca. 5 Minuten).

### 2. Homebrew

Homebrew ist ein Paketmanager für macOS. Installiere ihn mit:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Nach der Installation erscheint am Ende eine Meldung wie:

```
==> Next steps:
    Run these commands in your terminal:
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
```

Diese zwei Zeilen genau so ausführen (copy-paste).

Prüfe ob es funktioniert hat:

```bash
brew --version
# sollte ausgeben: Homebrew 4.x.x
```

### 3. Node.js

```bash
brew install node
node --version
# sollte ausgeben: v20.x.x oder neuer
```

### 4. Coding-CLIs (mindestens Claude Code)

Das ist die eigentliche Kommandozeile, die der Hub verwaltet. Claude Code ist die am tiefsten integrierte und das einzige Pflicht-CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Falls `claude` nach der Installation nicht gefunden wird:

```bash
export PATH="$HOME/.local/bin:$PATH"
# Diese Zeile auch in ~/.zprofile eintragen damit sie nach Neustart bleibt:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
```

Dann einmalig `claude` starten und den Anweisungen folgen (Anthropic-Account verbinden).

**Optional: Codex, Antigravity und opencode.** Der Hub spawnt auch OpenAI Codex, Google Antigravity (`agy`) und opencode. Installiere nur die, die du nutzen willst. Jede CLI hat ihren eigenen Login, und eine fehlende CLI lässt nur die jeweilige Session mit „nicht im PATH"-Hinweis sterben, ohne die anderen zu stören:

```bash
npm install -g @openai/codex   # OpenAI Codex → Binary `codex`
npm install -g opencode-ai     # opencode → Binary `opencode`
```

Antigravity (`agy`) installierst du nach [Googles offizieller Anleitung](https://antigravity.google/). Alle müssen wie `claude` im PATH liegen (siehe Fehlerbehebung unten).

---

## Installation

### Schnellstart (ein Befehl)

```bash
curl -fsSL --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/DerRemo/penates/main/install.sh | bash
```

Der Installer führt dich durch alles: prüft was schon da ist, installiert Fehlendes
(Homebrew, Node, tmux, jq, die drei CLIs claude/codex/agy, moshi-hook), richtet den
Hub als Dienst ein und bietet Remote-Zugriff an (Tailscale empfohlen). Manuelle
Schritte (CLI-Logins, Tailscale-Anmeldung) werden inline erklärt; offene Punkte
landen am Ende als Checkliste. Nur prüfen, nichts ändern: `./install.sh --check`.

### Manuell

Schon ein Checkout oder lieber Schritt für Schritt:

```bash
cd ~
git clone https://github.com/DerRemo/penates.git
cd penates
```

### Setup ausführen

```bash
chmod +x setup.sh
./setup.sh
```

Das Script macht alles automatisch:

1. Prüft ob Node.js und tmux vorhanden sind (installiert tmux falls nötig)
2. Installiert die npm-Abhängigkeiten
3. Erstellt eine `.env`-Datei mit einem zufälligen Auth-Token
4. Richtet einen LaunchAgent ein (Server startet automatisch nach Reboot)
5. Startet den Server

Am Ende siehst du so etwas:

```
  ✓ Penates läuft!

  Lokal:   http://localhost:3333
```

> **Wichtig:** Das Setup zeigt dir einmalig dein Auth-Token. Notiere es, du brauchst es für den Browser-Zugriff. Du kannst es jederzeit wieder nachschauen mit:
> ```bash
> grep AUTH_TOKEN penates/.env
> ```

---

## Erster Zugriff

Öffne im Browser auf demselben Mac:

```
http://localhost:3333
```

Beim ersten Besuch fragt der Browser nach dem Token. Das ist der Wert aus `AUTH_TOKEN` in deiner `.env`. Nach einmaliger Eingabe wird er im Browser gespeichert.

---

## Remote-Zugriff

Damit du den Hub auch von außerhalb deines Heimnetzwerks erreichst (iPhone unterwegs,
anderer Rechner): zwei Wege, der Installer bietet beide an (`./scripts/remote-setup.sh`).

### Tailscale (empfohlen, keine Domain, echtes HTTPS)

```bash
./scripts/remote-setup.sh tailscale
```

Installiert Tailscale, meldet dich an und macht den Hub via `tailscale serve` unter
`https://<rechner>.<tailnet>.ts.net` erreichbar. Echtes Let's-Encrypt-Cert (nötig für
PWA-Install und Web-Push), nur für deine eigenen Geräte, keine Domain, kein Cloudflare-Account.
Einmalig im [Tailscale-Admin](https://login.tailscale.com/admin/dns) HTTPS-Certs aktivieren.

### Cloudflare Tunnel (öffentlich / eigene Domain)

```bash
./scripts/remote-setup.sh cloudflare
```

Für öffentlichen Zugriff unter deiner Domain (kostenlos). Die manuellen Schritte im Detail:

### Cloudflare-Account und Domain

Du brauchst einen kostenlosen Account auf [cloudflare.com](https://cloudflare.com) und eine Domain, die du dort verwaltest. Eine `.xyz`-Domain kostet ca. 1 €/Jahr.

### cloudflared installieren

```bash
brew install cloudflared
```

### Tunnel erstellen

```bash
cloudflared tunnel login
cloudflared tunnel create claude-hub
```

Der zweite Befehl gibt eine Tunnel-ID aus (sieht so aus: `abc123de-...`). Notiere sie.

### DNS-Eintrag anlegen

```bash
cloudflared tunnel route dns claude-hub code.DEINE-DOMAIN.xyz
```

### Tunnel-Konfiguration

Erstelle die Datei `~/.cloudflared/config.yml`:

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

Inhalt (ersetze `TUNNEL-ID` und `DEINE-DOMAIN.xyz`):

```yaml
tunnel: TUNNEL-ID
credentials-file: /Users/DEIN-USERNAME/.cloudflared/TUNNEL-ID.json

ingress:
  - hostname: code.DEINE-DOMAIN.xyz
    service: http://localhost:3333
  - service: http_status:404
```

Speichern mit `Ctrl+O`, `Enter`, `Ctrl+X`.

### Tunnel als LaunchAgent einrichten

```bash
cloudflared service install
launchctl start com.cloudflare.cloudflared
```

Ab jetzt ist der Hub unter `https://code.DEINE-DOMAIN.xyz` erreichbar.

---

## Remote-Zugriff zusätzlich mit Cloudflare Access härten (empfohlen)

Der Cloudflare Tunnel macht deinen Hub öffentlich erreichbar. Die einzige Auth-Schicht ist in diesem Zustand der statische Bearer-Token in `.env`. Wenn du dein Setup enger schrauben willst, schalte **Cloudflare Access (Zero Trust)** davor. Dann muss sich jeder Browser-Besucher vor dem Hub erst bei Cloudflare via GitHub, Google, Email-PIN oder einer anderen Identity-Lösung anmelden. Cloudflare signiert die Identität als JWT, der Hub verifiziert die Signatur, und **nur** Requests mit gültigem JWT **und** gültigem Bearer kommen durch. Localhost-Traffic (z.B. Claude-Code-Hooks auf dem Mac mini selbst) ist davon nicht betroffen, denn der läuft weiter nur über Bearer, weil er den Tunnel nicht passiert.

### Voraussetzungen

- Cloudflare Tunnel läuft schon (siehe oben)
- Zero Trust ist im Cloudflare-Account aktiviert (kostenlos für Privat-Nutzung, [Setup hier](https://one.dash.cloudflare.com/))

### Access-Application anlegen

1. **Zero Trust Dashboard** öffnen → **Access → Applications → Add an application → Self-hosted**.
2. **Application name:** `Penates` (frei wählbar).
3. **Session Duration:** `24 hours` (oder länger, je nach Geschmack).
4. **Application domain:** deine Tunnel-Domain (z.B. `code.DEINE-DOMAIN.xyz`).
5. Als **Identity Provider** mindestens einen aktivieren (in den Team-Settings vorher einrichten):
   - **GitHub OAuth** (ein Klick, wenn du eh GitHub nutzt)
   - **One-Time-PIN per Email** (keine OAuth-App nötig, Code wird an deine Email gesendet)
6. **Policy anlegen:** `Action = Allow`, Include = eine oder beide Regeln:
   - `Emails` → deine Email-Adresse (für den PIN-Pfad)
   - `GitHub` → dein GitHub-Username (für den GitHub-OAuth-Pfad)
7. Application speichern.
8. In der Application-Overview den **Application Audience (AUD) Tag** kopieren, einen 64-Zeichen Hex-String.

### Hub konfigurieren

`penates/.env` editieren und beide Variablen setzen:

```bash
CF_ACCESS_TEAM_DOMAIN=deinteam.cloudflareaccess.com
CF_ACCESS_AUD=3c994b6913e0ee914f118337173aabdaa7a54a7c82f98e6f2b93b57fa7078db5
```

Die `TEAM_DOMAIN` findest du im Zero-Trust-Dashboard oben links (ohne `https://`). Der `AUD` ist der Tag aus Schritt 8.

Dann Hub neu starten:

```bash
launchctl kickstart -k gui/$(id -u)/com.penates
```

### Testen

1. Im Browser auf `https://code.DEINE-DOMAIN.xyz` → du wirst auf eine Cloudflare-Login-Seite umgeleitet, wählst GitHub oder Email-PIN, authentifizierst dich, und landest dann im Hub-Dashboard.
2. Prüfe das Audit-Log:
   ```bash
   tail -1 ~/.penates/audit.log
   ```
   Du solltest einen `auth.login`-Eintrag mit deiner Email-Adresse sehen.

### Rollback falls was schief geht

Einfach `.env` wieder leeren (`CF_ACCESS_TEAM_DOMAIN=` und `CF_ACCESS_AUD=`) und Hub neu starten. Dann läuft der Server wieder im Bearer-only-Modus. Kein Code-Rollback nötig, das Feature ist komplett Env-gated.

---

## Konfiguration

Alle Einstellungen stehen in `penates/.env`:

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `3333` | Port des Servers |
| `AUTH_TOKEN` | (keiner) | Pflichtfeld, wird von setup.sh generiert |
| `SESSION_PREFIX` | `cc-` | Prefix für neue Session-Namen |
| `DEFAULT_PROJECT_DIR` | `~` | Standard-Verzeichnis für neue Sessions |
| `TMUX_PATH` | auto-detected | Pfad zum tmux-Binary (wird automatisch via `which tmux` gefunden) |
| `PROJECT_ROOTS` | `~/Projects` | Verzeichnisse für die Projekt-Erkennung (kommagetrennt) |
| `BROWSE_ROOTS` | `$HOME` | Allow-List für den Verzeichnis-Picker im UI. `:`-getrennt, `~` erlaubt. Beispiel: `~/Projects:/Volumes/SSD/code` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | auto | Web-Push-Keys, werden beim ersten Start erzeugt |
| `VAPID_SUBJECT` | (keiner) | Pflicht für Apple Web Push, echte HTTPS-Domain (kein localhost) |
| `CF_ACCESS_TEAM_DOMAIN` | (keiner) | Optional. Cloudflare-Zero-Trust-Team-Domain (z.B. `deinteam.cloudflareaccess.com`). Leer = Cloudflare-Access-JWT-Validation disabled |
| `CF_ACCESS_AUD` | (keiner) | Optional. Application-Audience-Tag aus dem Cloudflare-Dashboard. Beide `CF_ACCESS_*` Variablen müssen gesetzt sein damit JWT-Validation aktiv wird |

Nach Änderungen an `.env` muss der Server neu gestartet werden:

```bash
launchctl kickstart -k gui/$(id -u)/com.penates
```

---

## Server verwalten

```bash
# Status prüfen
launchctl list | grep penates

# Server neu starten (z.B. nach Code-Änderungen)
launchctl kickstart -k gui/$(id -u)/com.penates

# Server stoppen
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.penates.plist

# Logs live verfolgen
tail -f penates/logs/stdout.log
tail -f penates/logs/stderr.log

# Audit-Log (Auth-Events, Session-Lifecycle, Rate-Limits)
tail -f ~/.penates/audit.log | jq -c
```

---

## Updates

```bash
cd penates
git pull
npm install
launchctl kickstart -k gui/$(id -u)/com.penates
```

---

## Fehlerbehebung

### „Port 3333 bereits belegt"

Ein anderer Prozess nutzt den Port. Prüfen und beenden:

```bash
lsof -i :3333
kill -9 <PID aus der Ausgabe>
```

### Hub startet nicht nach Reboot

LaunchAgent neu laden:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.penates.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.penates.plist
```

### `claude`-Befehl nicht gefunden im Terminal

```bash
echo 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

### Token vergessen

```bash
grep AUTH_TOKEN penates/.env
```

### 401 seit Cloudflare Access aktiviert ist

Im Audit-Log schauen welcher Grund:

```bash
tail -20 ~/.penates/audit.log | grep auth.fail | jq -c
```

- `reason: "bad-jwt:no-jwt"` → Browser ist nicht durch Cloudflare Access gegangen. Lösche die Cookies für `code.DEINE-DOMAIN.xyz` und lade neu, dann solltest du wieder den GitHub/PIN-Flow sehen.
- `reason: "bad-jwt:bad-aud"` → `CF_ACCESS_AUD` in `.env` stimmt nicht mit dem Audience-Tag der Access-Application überein. Nochmal im Cloudflare-Dashboard nachschauen.
- `reason: "bad-jwt:bad-iss"` → `CF_ACCESS_TEAM_DOMAIN` stimmt nicht. Muss exakt die Team-URL ohne `https://` sein.
- `reason: "bad-jwt:expired"` → JWT ist abgelaufen. Session-Duration im Access-Application-Setup hochdrehen.
- `reason: "bad-bearer"` → Bearer-Token im Browser stimmt nicht mit `AUTH_TOKEN` in `.env` überein. Alten Token vergessen lassen (`localStorage.removeItem('penates_token')` in der DevTools-Console), dann lädt der Browser beim nächsten Request das Login-Prompt neu.

### Tmux-Socket fehlt

Einmalig eine tmux-Session starten damit der Socket angelegt wird:

```bash
tmux new-session -d -s init
```

---

## Stack

- **Backend:** Node.js + Express + express-ws + node-pty
- **Frontend:** Vanilla JS + xterm.js (kein Build-Step)
- **CLIs:** Claude Code (`claude`) / Codex (`codex`) / Antigravity (`agy`) / opencode (`opencode`), je eigener Login
- **Sessions:** tmux
- **Remote:** Tailscale (empfohlen) oder Cloudflare Tunnel, optional Cloudflare Access (Zero Trust) davor
- **Security:** Bearer-Token + optional JWT-Validation (via `jose`) + Fixed-Window Rate-Limiting + JSONL Audit-Log
