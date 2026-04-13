#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
# Claude Code Hub — Setup Script für Mac mini
# ─────────────────────────────────────────────────────────────

BOLD="\033[1m"
TEAL="\033[38;5;43m"
DIM="\033[2m"
RESET="\033[0m"

echo ""
echo -e "${TEAL}${BOLD}  ⚡ Claude Code Hub — Setup${RESET}"
echo -e "${DIM}  ─────────────────────────────────────${RESET}"
echo ""

# 1. Check prerequisites
echo -e "${BOLD}[1/5]${RESET} Prüfe Voraussetzungen..."

if ! command -v node &> /dev/null; then
  echo "  ✕ Node.js nicht gefunden. Installiere mit: brew install node"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

if ! command -v tmux &> /dev/null; then
  echo "  ⚙ tmux wird installiert..."
  brew install tmux
fi
echo "  ✓ tmux $(tmux -V)"

# 2. Install dependencies
echo ""
echo -e "${BOLD}[2/5]${RESET} Installiere Abhängigkeiten..."
npm install

# 3. Configure .env
echo ""
echo -e "${BOLD}[3/5]${RESET} Konfiguration..."

if [ ! -f .env ]; then
  TOKEN=$(openssl rand -hex 32)
  cp .env.example .env
  sed -i '' "s/^AUTH_TOKEN=$/AUTH_TOKEN=${TOKEN}/" .env
  echo -e "  ✓ .env erstellt mit Auth-Token"
  echo ""
  echo -e "  ${TEAL}${BOLD}⚠ WICHTIG: Merke dir dieses Token:${RESET}"
  echo -e "  ${DIM}${TOKEN}${RESET}"
  echo ""
  echo -e "  Du brauchst es für den Zugriff über Cloudflare Tunnel."
else
  echo "  ✓ .env existiert bereits"
fi

# 4. Create LaunchAgent for auto-start
echo ""
echo -e "${BOLD}[4/5]${RESET} LaunchAgent einrichten..."

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.derremo.claude-code-hub.plist"
APP_DIR="$(pwd)"

mkdir -p "$PLIST_DIR"

cat > "$PLIST_FILE" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.derremo.claude-code-hub</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>${APP_DIR}/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${APP_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${APP_DIR}/logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${APP_DIR}/logs/stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!--
      PATH bewusst minimal. server.js ergänzt ~/.local/bin, /opt/homebrew/bin
      und /usr/local/bin zur Laufzeit, damit Kinderprozesse von tmux (z.B.
      \`claude\` in ~/.local/bin) gefunden werden. Wer das plist anpasst:
      dieselbe Ergänzung dort manuell einbauen, sonst greift der Server-
      Fallback nicht mehr.
    -->
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <!-- UTF-8-Locale setzen, sonst läuft der gespawnte Express-Server und
         damit auch alle tmux-Subcommands im C/POSIX-Modus. Für die
         WS-Terminal-Pipeline setzen wir das zusätzlich noch explizit in
         server.js, aber hier ist es die konsistentere Default-Stelle. -->
    <key>LANG</key>
    <string>en_US.UTF-8</string>
    <key>LC_CTYPE</key>
    <string>en_US.UTF-8</string>
  </dict>
</dict>
</plist>
PLIST

chmod 644 "$PLIST_FILE"

mkdir -p "${APP_DIR}/logs"

echo "  ✓ LaunchAgent erstellt: $PLIST_FILE"

# 5. Load and start
echo ""
echo -e "${BOLD}[5/5]${RESET} Starte Claude Code Hub..."

launchctl bootout gui/$(id -u) "$PLIST_FILE" 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST_FILE"

echo ""
echo -e "${TEAL}${BOLD}  ✓ Claude Code Hub läuft!${RESET}"
echo ""
echo -e "  Lokal:   ${BOLD}http://localhost:3333${RESET}"
echo ""
echo -e "${DIM}  Nächster Schritt: Cloudflare Tunnel einrichten${RESET}"
echo -e "${DIM}  für Zugriff über code.derremo.xyz${RESET}"
echo ""
