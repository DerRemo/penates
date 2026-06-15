#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
# Penates — Setup Script für Mac mini
# ─────────────────────────────────────────────────────────────

BOLD="\033[1m"
TEAL="\033[38;5;43m"
DIM="\033[2m"
RESET="\033[0m"

# OS-Branch: macOS = launchd/plist (unverändert), Linux = systemd --user-Unit.
OS_KERNEL="$(uname -s)"   # Darwin | Linux
is_wsl() { grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; }

echo ""
echo -e "${TEAL}${BOLD}  ⚡ Penates — Setup${RESET}"
echo -e "${DIM}  ─────────────────────────────────────${RESET}"
echo ""

# 1. Check prerequisites
echo -e "${BOLD}[1/9]${RESET} Prüfe Voraussetzungen..."

if ! command -v node &> /dev/null; then
  echo "  ✕ Node.js nicht gefunden. Installiere mit: brew install node"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

if ! command -v tmux &> /dev/null; then
  if [ "$OS_KERNEL" = "Darwin" ]; then
    echo "  ⚙ tmux wird installiert..."
    brew install tmux
  else
    echo "  ✕ tmux nicht gefunden. Installiere via install.sh oder deinem Paketmanager (apt/dnf/pacman install tmux)."
    exit 1
  fi
fi
echo "  ✓ tmux $(tmux -V)"

# moshi-hook: read-only Datenquelle für Usage (Rate-Limits) + Recent-Dirs.
# NUR Install — kein `serve`/`pair`/`install` (das würde Moshis eigene
# Agent-Hooks schreiben und mit den Hub-Hooks kollidieren).
# macOS-only (brew tap rjyo/moshi); auf Linux degradieren Usage/Recent-Dirs graceful zu null.
if [ "$OS_KERNEL" = "Darwin" ]; then
  if ! command -v moshi-hook &> /dev/null; then
    echo "  ⚙ moshi-hook wird installiert (Datenquelle für Usage/Recent-Dirs)..."
    brew tap rjyo/moshi && brew install moshi-hook
  else
    echo "  ✓ moshi-hook vorhanden"
  fi
fi

# 2. Install dependencies
echo ""
echo -e "${BOLD}[2/9]${RESET} Installiere Abhängigkeiten..."
npm install

# Vendor xterm.js + addons into public/vendor/xterm/ (served same-origin, no CDN)
echo "[*] Vendore xterm-Assets nach public/vendor/xterm/ ..."
npm run vendor:xterm

# 3. Configure .env
echo ""
echo -e "${BOLD}[3/9]${RESET} Konfiguration..."

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

# 3b. Browser-Preview (optional)
echo ""
echo -e "${BOLD}[4/9]${RESET} Browser-Preview (optional)..."
CURRENT_PREVIEW=$(grep '^PREVIEW_DOMAIN=' .env 2>/dev/null | cut -d= -f2-)
if [ -z "$CURRENT_PREVIEW" ]; then
  echo "  Live-Dev-Server-Reverse-Proxy über EINEN festen Host: preview.<domain>."
  echo "  Eine Ebene flach → vom Universal-SSL *.<domain> gedeckt (kein ACM, kein Wildcard)."
  echo "  Leer lassen = Feature aus (kann später in .env nachgetragen werden)."
  printf "  PREVIEW_DOMAIN (z.B. code.derremo.xyz, leer = aus): "
  read -r PREVIEW_DOMAIN_IN
  if [ -n "$PREVIEW_DOMAIN_IN" ]; then
    if grep -q '^PREVIEW_DOMAIN=' .env; then
      sed -i '' "s#^PREVIEW_DOMAIN=.*#PREVIEW_DOMAIN=${PREVIEW_DOMAIN_IN}#" .env
    else
      printf '\nPREVIEW_DOMAIN=%s\n' "$PREVIEW_DOMAIN_IN" >> .env
    fi
    HUB_PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2-); HUB_PORT=${HUB_PORT:-3333}

    echo ""
    echo "  ── CLOUDFLARE-CHECKLISTE (manuell, EIN fixer Host preview.${PREVIEW_DOMAIN_IN}) ──"
    echo "  1. Tunnel → Public Hostname: preview.${PREVIEW_DOMAIN_IN}  →  HTTP  localhost:${HUB_PORT}"
    echo "  2. DNS: CNAME  preview  →  <tunnel-id>.cfargotunnel.com  (proxied/orange)."
    echo "     (Single-Label-Host → vom bestehenden Universal-SSL *.${PREVIEW_DOMAIN_IN#*.} gedeckt, kein ACM nötig.)"
    echo "  3. CF Access: preview.${PREVIEW_DOMAIN_IN} zur BESTEHENDEN Access-App/Policy des Hubs"
    echo "     hinzufügen (selbe Policy → SSO-Cookie geteilt, iframe lädt bereits authentifiziert)."
    echo "  4. Ohne CF Access ist der Host so offen wie der Hub selbst — gleiche Vertrauensgrenze."
    echo ""
    echo "  Kein Wildcard, kein Catch-all. Eine Preview zur Zeit (Port im Hub-Panel wählbar)."
    echo ""
  else
    echo "  → übersprungen (PREVIEW_DOMAIN bleibt leer, Feature aus)."
  fi
else
  echo "  → PREVIEW_DOMAIN bereits gesetzt (${CURRENT_PREVIEW}) — unverändert."
fi

# 4. Autostart einrichten (macOS: launchd/plist — Linux: systemd --user-Unit)
echo ""
echo -e "${BOLD}[5/9]${RESET} Autostart einrichten..."

LAUNCHAGENT_ID="${LAUNCHAGENT_ID:-com.penates}"
APP_DIR="$(pwd)"
mkdir -p "${APP_DIR}/logs"
AUTOSTART_SKIPPED=0

if [ "$OS_KERNEL" = "Darwin" ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/${LAUNCHAGENT_ID}.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_FILE" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHAGENT_ID}</string>
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
  echo "  ✓ LaunchAgent erstellt: $PLIST_FILE"
elif [ "$OS_KERNEL" = "Linux" ]; then
  if command -v systemctl >/dev/null 2>&1; then
    UNIT_DIR="$HOME/.config/systemd/user"
    UNIT_FILE="$UNIT_DIR/penates.service"
    NODE_BIN="$(command -v node)"
    mkdir -p "$UNIT_DIR"
    # %h = $HOME (systemd-Spezifizierer). Restart=always = launchd-KeepAlive-Äquivalent.
    # PATH spiegelt platform.extraPaths() (Linux), damit tmux-Kinder claude/codex/agy finden.
    cat > "$UNIT_FILE" << UNIT
[Unit]
Description=Penates — coding-agent session hub
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
Restart=always
RestartSec=2
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=LANG=en_US.UTF-8
Environment=LC_CTYPE=en_US.UTF-8
StandardOutput=append:${APP_DIR}/logs/stdout.log
StandardError=append:${APP_DIR}/logs/stderr.log

[Install]
WantedBy=default.target
UNIT
    echo "  ✓ systemd-Unit erstellt: $UNIT_FILE"
  else
    echo "  ⚠ Kein systemd erkannt — Autostart übersprungen."
    echo "    Starte manuell:  node ${APP_DIR}/server.js   (oder in deinen Init eintragen)."
    AUTOSTART_SKIPPED=1
  fi
fi

# 5. Claude-Code Hook-Installation
echo ""
echo -e "${BOLD}[6/9]${RESET} Claude-Code Hooks installieren..."

# jq ist Pflicht für Hook-Install UND das StatusLine-Reporting (runtime).
if ! command -v jq &> /dev/null; then
  if [ "$OS_KERNEL" = "Darwin" ]; then
    echo "  ⚙ jq wird installiert…"
    brew install jq || echo -e "  ${DIM}⚠ jq-Install fehlgeschlagen — Hooks/StatusLine eingeschränkt.${RESET}"
  else
    echo -e "  ${DIM}⚠ jq fehlt — installiere via Paketmanager (apt/dnf/pacman install jq); Hooks/StatusLine sonst eingeschränkt.${RESET}"
  fi
fi

SETTINGS_FILE="$HOME/.claude/settings.json"
if ! command -v jq &> /dev/null; then
  echo -e "  ${DIM}⚠ jq nicht gefunden — überspringe Hook-Install.${RESET}"
  echo -e "  ${DIM}  Installiere jq und re-run setup.sh, oder pflege die Hooks manuell.${RESET}"
  echo -e "  ${DIM}  (siehe README.md → Notifications / Hook-Setup)${RESET}"
else
  mkdir -p "$HOME/.claude"
  [ -f "$SETTINGS_FILE" ] || echo "{}" > "$SETTINGS_FILE"

  # hook.env: URL + Token an einem Ort, den der Hook zur Laufzeit sourcen kann.
  # Damit melden AUCH Sessions an den Hub, die NICHT über den Hub gestartet
  # wurden (z.B. via Moshi) — sie haben das tmux -e-Inject nicht. chmod 600,
  # da der Token drinsteht. Werte robust aus .env lesen (Schritt-Reihenfolge-
  # unabhängig).
  HUB_PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2); HUB_PORT="${HUB_PORT:-3333}"
  HUB_TOKEN=$(grep '^AUTH_TOKEN=' .env 2>/dev/null | cut -d= -f2-)
  # Rebrand-Migration: alten Datendir übernehmen, BEVOR wir den neuen anlegen
  # (sonst verhindert der frische mkdir die Migration und der State verwaist).
  if [ -d "$HOME/.claude-code-hub" ] && [ ! -d "$HOME/.penates" ]; then
    mv "$HOME/.claude-code-hub" "$HOME/.penates"
    echo "  ✓ Datendir migriert (~/.claude-code-hub → ~/.penates)"
  fi
  mkdir -p "$HOME/.penates"
  # umask 077 im Subshell: Datei wird nie group/other-lesbar (Token drinsteht).
  ( umask 077; {
    echo "PENATES_URL=http://127.0.0.1:${HUB_PORT}"
    echo "PENATES_TOKEN=${HUB_TOKEN}"
  } > "$HOME/.penates/hook.env" )
  chmod 600 "$HOME/.penates/hook.env"
  echo "  ✓ hook.env geschrieben (~/.penates/hook.env, chmod 600)"

  # Events die der Hub konsumiert. Jeder Event bekommt denselben curl-
  # Payload: POST an /api/hooks/:event mit Auth + Session-Header.
  HOOK_EVENTS=(UserPromptSubmit Stop SubagentStop Notification SessionStart SessionEnd PostToolUse)

  # Sentinel-Marker pro Entry, damit Re-Runs nur Hub-Einträge ersetzen
  # und niemals User-eigene Hooks löschen.
  HOOK_CMD='{ [ -r "$HOME/.penates/hook.env" ] && . "$HOME/.penates/hook.env"; S="$(tmux display-message -p "#S" 2>/dev/null)"; S="${S:-$PENATES_SESSION}"; curl -fsS -m 2 -X POST "$PENATES_URL/api/hooks/EVENT_NAME" -H "Authorization: Bearer $PENATES_TOKEN" -H "X-Penates-Session: $S" -H "Content-Type: application/json" --data-binary @-; } >/dev/null 2>&1 || true'

  TMP=$(mktemp)
  cp "$SETTINGS_FILE" "$TMP"

  for evt in "${HOOK_EVENTS[@]}"; do
    cmd="${HOOK_CMD//EVENT_NAME/$evt}"
    jq --arg evt "$evt" --arg cmd "$cmd" '
      .hooks //= {}
      | .hooks[$evt] //= []
      # Bestehende Hub-Einträge entfernen: sowohl mit _owner-Sentinel als auch
      # sentinel-lose Legacy-Einträge (Pre-Sentinel-Versionen), erkennbar am
      # curl an "/api/hooks/". So entstehen beim Upgrade keine Duplikate.
      # moshi-hook & User-Hooks (kein /api/hooks/) bleiben unangetastet.
      | .hooks[$evt] |= map(select(
          (.hooks // [] | any(
            (._owner // "") == "penates"
            or ((.command // "") | contains("/api/hooks/"))
          )) | not
        ))
      # Neuen Eintrag anhängen
      | .hooks[$evt] += [{
          matcher: "",
          hooks: [{ type: "command", command: $cmd, _owner: "penates" }]
        }]
    ' "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"
  done

  # PreToolUse — blockierender curl, schreibt den Decision-Body nach stdout
  # (KEIN >/dev/null auf stdout!). Bei Fehler/leer → defer. Matcher auf das
  # impactful-Set, timeout > curl -m.
  PRETOOL_CMD='{ [ -r "$HOME/.penates/hook.env" ] && . "$HOME/.penates/hook.env"; S="$(tmux display-message -p "#S" 2>/dev/null)"; S="${S:-$PENATES_SESSION}"; curl -fsS -m 120 -X POST "$PENATES_URL/api/hooks/pre-tool-use" -H "Authorization: Bearer $PENATES_TOKEN" -H "X-Penates-Session: $S" -H "Content-Type: application/json" --data-binary @- 2>/dev/null; } || true'

  jq --arg cmd "$PRETOOL_CMD" '
    .hooks //= {}
    | .hooks["PreToolUse"] //= []
    | .hooks["PreToolUse"] |= map(select(
        (.hooks // [] | any(
          (._owner // "") == "penates"
          or ((.command // "") | contains("/api/hooks/"))
        )) | not
      ))
    | .hooks["PreToolUse"] += [{
        matcher: "Bash|Edit|Write|WebFetch|WebSearch|Task",
        hooks: [{ type: "command", command: $cmd, timeout: 125, _owner: "penates" }]
      }]
  ' "$TMP" > "$TMP.new" && mv "$TMP.new" "$TMP"

  mv "$TMP" "$SETTINGS_FILE"
  echo "  ✓ Hooks geschrieben nach $SETTINGS_FILE"
  echo -e "  ${DIM}  (${#HOOK_EVENTS[@]} Events: ${HOOK_EVENTS[*]}; PreToolUse: Bash|Edit|Write|WebFetch|WebSearch|Task)${RESET}"
fi

# 6. StatusLine-Script — Hub-Reporting
echo ""
echo -e "${BOLD}[7/9]${RESET} StatusLine-Script einrichten..."

SL_SCRIPT="$HOME/.claude/statusline-command.sh"
SL_SENTINEL_START="#CCH-SL-START#"
SL_SENTINEL_END="#CCH-SL-END#"

SL_BLOCK='
# ── Penates StatusLine Reporting ── #CCH-SL-START#
# Sends rate-limit + cost data to the Hub. Throttled: only on value change or every 60s.
# Self-bootstrapping: sourct hook.env (URL+Token) und leitet den Session-Namen
# live aus tmux ab — meldet daher auch für nicht-Hub-gestartete Sessions (Moshi).
[ -r "$HOME/.penates/hook.env" ] && . "$HOME/.penates/hook.env"
_sl_session="$(tmux display-message -p "#S" 2>/dev/null)"; _sl_session="${_sl_session:-$PENATES_SESSION}"
if [ -n "$PENATES_URL" ] && [ -n "$_sl_session" ]; then
  _sl_session_id=$(echo "$input" | jq -r '"'"'.session_id // empty'"'"')
  _sl_state_file="/tmp/penates-sl-${_sl_session_id:-unknown}.state"
  _sl_cost=$(echo "$input" | jq -r '"'"'.cost.total_cost_usd // empty'"'"')
  _sl_current="${five_hour}:${seven_day}:${_sl_cost}"
  _sl_last=""
  _sl_last_ts=0
  if [ -f "$_sl_state_file" ]; then
    _sl_last=$(head -1 "$_sl_state_file" 2>/dev/null | cut -d'"'"'|'"'"' -f1)
    _sl_last_ts=$(head -1 "$_sl_state_file" 2>/dev/null | cut -d'"'"'|'"'"' -f2)
  fi
  _sl_now=$(date +%s)
  _sl_elapsed=$(( _sl_now - ${_sl_last_ts:-0} ))

  if [ "$_sl_current" != "$_sl_last" ] || [ "$_sl_elapsed" -ge 60 ]; then
    _sl_payload=$(echo "$input" | jq -c '"'"'{rate_limits, cost, context_window, model}'"'"')
    curl -fsS -m 2 -X POST "$PENATES_URL/api/hooks/statusline" \
      -H "Authorization: Bearer $PENATES_TOKEN" \
      -H "X-Penates-Session: $_sl_session" \
      -H "Content-Type: application/json" \
      -d "$_sl_payload" >/dev/null 2>&1 &
    printf '"'"'%s|%s\n'"'"' "$_sl_current" "$_sl_now" > "$_sl_state_file"
  fi
fi
# ── End Penates StatusLine Reporting ── #CCH-SL-END#'

if [ -f "$SL_SCRIPT" ]; then
  if grep -q "$SL_SENTINEL_START" "$SL_SCRIPT"; then
    # Replace existing block between sentinels
    TMP_SL=$(mktemp)
    sed "/$SL_SENTINEL_START/,/$SL_SENTINEL_END/d" "$SL_SCRIPT" > "$TMP_SL"
    echo "$SL_BLOCK" >> "$TMP_SL"
    mv "$TMP_SL" "$SL_SCRIPT"
    chmod +x "$SL_SCRIPT"
    echo "  ✓ StatusLine-Reporting-Block aktualisiert in $SL_SCRIPT"
  else
    # Append block
    echo "$SL_BLOCK" >> "$SL_SCRIPT"
    echo "  ✓ StatusLine-Reporting-Block angehängt an $SL_SCRIPT"
  fi
else
  echo -e "  ${DIM}⚠ $SL_SCRIPT nicht gefunden — überspringe.${RESET}"
  echo -e "  ${DIM}  StatusLine-Reporting erfordert ein konfiguriertes statusline-command.sh.${RESET}"
fi

# 8. Voice-Input: whisper.cpp + Modell
echo ""
echo -e "${BOLD}[8/9]${RESET} Voice-Input: whisper.cpp + Modell …"

MODEL_DIR="$HOME/.penates/models"
MODEL_FILE="$MODEL_DIR/ggml-large-v3-turbo-q5_0.bin"
# Multilinguales Turbo-Modell (quantisiert ~574 MB), idempotent.
download_whisper_model() {
  mkdir -p "$MODEL_DIR"
  if [ ! -f "$MODEL_FILE" ]; then
    echo "  Lade ggml-large-v3-turbo-q5_0.bin (~574 MB, einmalig) …"
    curl -L --fail --progress-bar \
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin" \
      -o "$MODEL_FILE" || { echo "  ⚠︎ Modell-Download fehlgeschlagen."; rm -f "$MODEL_FILE"; }
  fi
}

if [ "$OS_KERNEL" = "Darwin" ]; then
  # Binary via Homebrew (Metal-Build out-of-the-box auf Apple Silicon)
  if ! command -v whisper-cli >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/whisper-cli ]; then
    brew install whisper-cpp || echo "  ⚠︎ brew install whisper-cpp fehlgeschlagen — Voice-Input bleibt aus."
  fi
  download_whisper_model
  echo "  Hinweis: CoreML/ANE (~3× Encoder-Speedup) ist ein optionaler späterer Tune"
  echo "  (whisper.cpp Source-Build mit -DWHISPER_COREML=1 + CoreML-Modell). Metal reicht auf M-Series."
else
  # Linux: Best-Effort, blockiert nie. whisper-cpp baut auf Linux (CPU, kein Metal),
  # ist aber kein Standard-Distro-Paket → nur Modell ziehen, wenn das Binary schon da ist.
  if command -v whisper-cli >/dev/null 2>&1; then
    download_whisper_model
  else
    echo "  ⚠ whisper-cli nicht gefunden — Voice-Input bleibt aus (Best-Effort, optional)."
    echo "    Build: https://github.com/ggerganov/whisper.cpp (CPU; kein GPU/CUDA in v1)."
  fi
fi

# .env-Vars setzen (nur wenn nicht vorhanden — User-Werte nicht überschreiben)
grep -q '^WHISPER_MODEL=' .env 2>/dev/null || echo "WHISPER_MODEL=$MODEL_FILE" >> .env
grep -q '^VOICE_LANG=' .env 2>/dev/null || echo "VOICE_LANG=de" >> .env

# 9. Load and start
echo ""
echo -e "${BOLD}[9/9]${RESET} Starte Penates..."

if [ "$OS_KERNEL" = "Darwin" ]; then
  # Rebrand-Migration: vor-Penates-Labels entladen + alte Plists entfernen,
  # sonst liefe nach dem Rename ein zweiter Hub unter dem alten Label weiter.
  for _old_label in com.claude-code-hub com.derremo.claude-code-hub; do
    if [ "$_old_label" != "$LAUNCHAGENT_ID" ]; then
      launchctl bootout "gui/$(id -u)/${_old_label}" 2>/dev/null || true
      rm -f "$PLIST_DIR/${_old_label}.plist"
    fi
  done

  # Vorherige Version entladen (idempotenter Re-Run)
  launchctl bootout gui/$(id -u) "$PLIST_FILE" 2>/dev/null || true
  # Falls das Label zuvor disabled wurde, wieder freigeben — sonst scheitert bootstrap mit EIO.
  launchctl enable "gui/$(id -u)/${LAUNCHAGENT_ID}" 2>/dev/null || true
  launchctl bootstrap gui/$(id -u) "$PLIST_FILE"
elif [ "$OS_KERNEL" = "Linux" ]; then
  if [ "${AUTOSTART_SKIPPED:-0}" = 0 ] && command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload || true
    systemctl --user enable --now penates.service \
      || echo "  ⚠ systemctl --user enable --now penates.service fehlgeschlagen (läuft evtl. keine User-Session?)."
    # enable-linger: Service startet auch ohne aktiven Login (Headless-VPS) + überlebt Logout.
    loginctl enable-linger "$USER" 2>/dev/null || true
    echo "  ✓ systemd-Service aktiviert (penates.service); enable-linger gesetzt."
  else
    echo "  → Kein Autostart aktiv: starte manuell mit  node ${APP_DIR}/server.js"
  fi
fi

echo ""
echo -e "${TEAL}${BOLD}  ✓ Penates läuft!${RESET}"
echo ""
PORT="${PORT:-$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)}"
PORT="${PORT:-3333}"
echo -e "  Lokal:   ${BOLD}http://localhost:${PORT}${RESET}"
if [ "$OS_KERNEL" = "Linux" ] && is_wsl; then
  echo -e "  ${DIM}WSL2 erkannt — aktuelle Windows-Builds forwarden localhost automatisch zu Windows."
  echo -e "  Ältere Builds: nutze die WSL-IP (ip addr | grep eth0) statt localhost.${RESET}"
fi
echo ""
# Remote-Zugriff: nur anbieten, wenn setup.sh DIREKT (nicht aus install.sh) läuft.
# install.sh ruft remote-setup.sh selbst auf (Env-Marker PENATES_FROM_INSTALL).
if [ -z "${PENATES_FROM_INSTALL:-}" ] && [ -x "${APP_DIR}/scripts/remote-setup.sh" ]; then
  bash "${APP_DIR}/scripts/remote-setup.sh" || true
else
  echo -e "${DIM}  Remote-Zugriff: ./scripts/remote-setup.sh (Tailscale empfohlen)${RESET}"
fi
echo ""
