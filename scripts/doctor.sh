#!/usr/bin/env bash
set -uo pipefail
# Prereq-/Umgebungs-Audit. Reine Detection, KEINE Mutation.
# Usage: doctor.sh [--json]   Exit: 0=alle Required da, 3=fehlt was, 1=unsupported OS.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$HERE/lib.sh"

JSON=0; [ "${1:-}" = "--json" ] && JSON=1

OS="$(os_detect)"
ARCH="$(uname -m)"
MACOS_VER=""; [ "$OS" = macos ] && MACOS_VER="$(sw_vers -productVersion 2>/dev/null || echo '')"

# Required: System/Build
b_xcode=false; xcode-select -p >/dev/null 2>&1 && b_xcode=true
b_brew=false;  have brew && b_brew=true
b_node=false;  have node && b_node=true
node_ver=""; [ "$b_node" = true ] && node_ver="$(node -v 2>/dev/null | tr -d v)"
# Node-Floor (>=20) prüfen
node_ok=false
if [ "$b_node" = true ]; then
  major="${node_ver%%.*}"; [ "${major:-0}" -ge 20 ] 2>/dev/null && node_ok=true
fi
b_tmux=false;  have tmux && b_tmux=true
b_git=false;   have git && b_git=true
b_jq=false;    have jq && b_jq=true
b_trash=false; { have trash || [ -x /usr/bin/trash ]; } && b_trash=true

# CLIs (recommended, nicht hart-required)
c_claude=false; have claude && c_claude=true
c_codex=false;  have codex && c_codex=true
c_agy=false;    have agy && c_agy=true

# Optional features
o_whisper=false;     have whisper-cli && o_whisper=true
o_tailscale=false;   have tailscale && o_tailscale=true
o_cloudflared=false; have cloudflared && o_cloudflared=true
o_moshi=false;       have moshi-hook && o_moshi=true

# Hub läuft? (Port 3333 offen)
hub_port="${PORT:-3333}"
hub_running=false
if have lsof && lsof -nP -iTCP:"$hub_port" -sTCP:LISTEN >/dev/null 2>&1; then hub_running=true; fi

READY=true
for v in "$b_xcode" "$b_brew" "$node_ok" "$b_tmux" "$b_git" "$b_jq" "$b_trash"; do
  [ "$v" = true ] || READY=false
done
[ "$OS" = macos ] || READY=false

if [ "$JSON" = 1 ]; then
  printf '{"os":"%s","arch":"%s","macos":"%s",' "$OS" "$ARCH" "$MACOS_VER"
  printf '"required":{"xcode_clt":%s,"brew":%s,"node":%s,"node_version":"%s","tmux":%s,"git":%s,"jq":%s,"trash":%s},' \
    "$b_xcode" "$b_brew" "$node_ok" "$node_ver" "$b_tmux" "$b_git" "$b_jq" "$b_trash"
  printf '"clis":{"claude":%s,"codex":%s,"agy":%s},' "$c_claude" "$c_codex" "$c_agy"
  printf '"optional":{"whisper":%s,"tailscale":%s,"cloudflared":%s,"moshi_hook":%s},' \
    "$o_whisper" "$o_tailscale" "$o_cloudflared" "$o_moshi"
  printf '"hub_running":%s,"ready":%s}\n' "$hub_running" "$READY"
else
  C_RED="${C_ERR_RED:-}"; [ -t 1 ] && C_RED=$'\033[31m'
  mark() { [ "$1" = true ] && printf '%s✓%s' "$C_GREEN" "$C_RESET" || printf '%s✕%s' "$C_RED" "$C_RESET"; }
  log ""
  log "${C_TEAL}${C_BOLD}  Claude Code Hub — Doctor${C_RESET}"
  log "  OS: $OS $MACOS_VER ($ARCH)"
  printf '  Required:  %s xcode-clt  %s brew  %s node(%s)  %s tmux  %s git  %s jq  %s trash\n' \
    "$(mark "$b_xcode")" "$(mark "$b_brew")" "$(mark "$node_ok")" "${node_ver:-—}" \
    "$(mark "$b_tmux")" "$(mark "$b_git")" "$(mark "$b_jq")" "$(mark "$b_trash")"
  printf '  CLIs:      %s claude  %s codex  %s agy\n' "$(mark "$c_claude")" "$(mark "$c_codex")" "$(mark "$c_agy")"
  printf '  Optional:  %s whisper  %s tailscale  %s cloudflared  %s moshi-hook\n' \
    "$(mark "$o_whisper")" "$(mark "$o_tailscale")" "$(mark "$o_cloudflared")" "$(mark "$o_moshi")"
  printf '  Hub running (:%s): %s\n' "$hub_port" "$(mark "$hub_running")"
  [ "$READY" = true ] && ok "alle Required-Prereqs vorhanden" || warn "Required-Prereqs fehlen — siehe ✕ oben"
fi

[ "$OS" = macos ] || exit 1
[ "$READY" = true ] && exit 0 || exit 3
