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
echo -e "${BOLD}[1/6]${RESET} Prüfe Voraussetzungen..."

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
echo -e "${BOLD}[2/6]${RESET} Installiere Abhängigkeiten..."
npm install

# 3. Configure .env
echo ""
echo -e "${BOLD}[3/6]${RESET} Konfiguration..."

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
echo -e "${BOLD}[4/6]${RESET} LaunchAgent einrichten..."

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

# 5. Claude-Code Hook-Installation
echo ""
echo -e "${BOLD}[5/6]${RESET} Claude-Code Hooks installieren..."

SETTINGS_FILE="$HOME/.claude/settings.json"
if ! command -v jq &> /dev/null; then
  echo -e "  ${DIM}⚠ jq nicht gefunden — überspringe Hook-Install.${RESET}"
  echo -e "  ${DIM}  Installiere jq und re-run setup.sh, oder pflege die Hooks manuell.${RESET}"
  echo -e "  ${DIM}  (siehe README.md → Notifications / Hook-Setup)${RESET}"
else
  mkdir -p "$HOME/.claude"
  [ -f "$SETTINGS_FILE" ] || echo "{}" > "$SETTINGS_FILE"

  # Events die der Hub konsumiert. Jeder Event bekommt denselben curl-
  # Payload: POST an /api/hooks/:event mit Auth + Session-Header.
  HOOK_EVENTS=(UserPromptSubmit Stop SubagentStop Notification SessionStart SessionEnd)

  # Sentinel-Marker pro Entry, damit Re-Runs nur Hub-Einträge ersetzen
  # und niemals User-eigene Hooks löschen.
  HOOK_CMD='curl -fsS -m 2 -X POST "$CC_HUB_URL/api/hooks/EVENT_NAME" -H "Authorization: Bearer $CC_HUB_TOKEN" -H "X-CC-Hub-Session: $CC_HUB_SESSION" -H "Content-Type: application/json" --data-binary @- >/dev/null 2>&1 || true'

  TMP=$(mktemp)
  cp "$SETTINGS_FILE" "$TMP"

  for evt in "${HOOK_EVENTS[@]}"; do
    cmd="${HOOK_CMD//EVENT_NAME/$evt}"
    jq --arg evt "$evt" --arg cmd "$cmd" '
      .hooks //= {}
      | .hooks[$evt] //= []
      # Bestehende Hub-Einträge (_owner:"claude-code-hub") entfernen
      | .hooks[$evt] |= map(select(
          (.hooks // [] | map(._owner // "") | any(. == "claude-code-hub")) | not
        ))
      # Neuen Eintrag anhängen
      | .hooks[$evt] += [{
          matcher: "",
          hooks: [{ type: "command", command: $cmd, _owner: "claude-code-hub" }]
        }]
    ' "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
  done

  mv "$TMP" "$SETTINGS_FILE"
  echo "  ✓ Hooks geschrieben nach $SETTINGS_FILE"
  echo -e "  ${DIM}  (${#HOOK_EVENTS[@]} Events: ${HOOK_EVENTS[*]})${RESET}"
fi

# 6. Load and start
echo ""
echo -e "${BOLD}[6/6]${RESET} Starte Claude Code Hub..."

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
