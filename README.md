# Claude Code Hub

Web-Interface zum Verwalten und Fernsteuern von Claude Code Sessions auf deinem Mac mini.

## Features

- **Session-Dashboard** — Alle laufenden Claude Code Sessions auf einen Blick mit Live-Vorschau
- **Terminal im Browser** — Vollständiges xterm.js-Terminal mit Farben, Cursor und Resize
- **Session Management** — Neue Sessions starten, verbinden und beenden
- **Persistent** — Sessions laufen via tmux weiter, auch wenn du den Browser schließt
- **Remote-Zugriff** — Über Cloudflare Tunnel sicher von überall erreichbar
- **Auto-Start** — LaunchAgent startet den Server automatisch nach Reboot

## Quick Start

```bash
cd claude-code-hub
chmod +x setup.sh
./setup.sh
```

Das Setup-Script:
1. Prüft Node.js und installiert tmux falls nötig
2. Installiert npm-Abhängigkeiten (inkl. node-pty)
3. Generiert ein Auth-Token und erstellt `.env`
4. Richtet einen LaunchAgent für Auto-Start ein
5. Startet den Server auf Port 3333

## Cloudflare Tunnel einrichten

Da du bereits einen Cloudflare Tunnel für Home Assistant hast, musst du nur eine weitere Route hinzufügen:

```bash
# Tunnel-Config bearbeiten (typisch: ~/.cloudflared/config.yml)
# Neue Ingress-Rule hinzufügen ÜBER dem catch-all:

ingress:
  - hostname: code.derremo.xyz
    service: http://localhost:3333
  # ... deine bestehenden Rules ...
  - hostname: home.derremo.xyz
    service: http://localhost:8123
  - service: http_status:404
```

Dann in Cloudflare DNS einen CNAME `code` → `<tunnel-id>.cfargotunnel.com` anlegen und den Tunnel neustarten:

```bash
cloudflared tunnel route dns <tunnel-name> code.derremo.xyz
launchctl kickstart -k gui/$(id -u)/com.cloudflare.cloudflared
```

### Auth-Token im Browser

Beim ersten Zugriff über `code.derremo.xyz` musst du das Auth-Token eingeben. Alternativ kannst du den Token als URL-Parameter mitgeben: `code.derremo.xyz?token=DEIN_TOKEN`

> **Tipp:** Zusätzlich kannst du in Cloudflare Zero Trust eine Access Policy einrichten für eine weitere Sicherheitsebene.

## Konfiguration (.env)

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | 3333 | Server-Port |
| `AUTH_TOKEN` | — | Bearer Token für API-Zugriff |
| `SESSION_PREFIX` | `cc-` | Prefix für Session-Namen |
| `DEFAULT_PROJECT_DIR` | `~` | Standard-Verzeichnis für neue Sessions |

## Logs

```bash
tail -f logs/stdout.log
tail -f logs/stderr.log
```

## Stack

- **Backend:** Express.js + node-pty + WebSocket
- **Frontend:** Vanilla JS + xterm.js
- **Sessions:** tmux
- **Remote:** Cloudflare Tunnel
