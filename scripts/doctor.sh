#!/usr/bin/env bash
set -uo pipefail
# Prereq-/Umgebungs-Audit. Reine Detection, KEINE Mutation.
# Usage: doctor.sh [--json]   Exit: 0=alle Required da, 3=fehlt was, 1=unsupported OS.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
# shellcheck disable=SC1091  # lib.sh path is dynamic ($HERE); file always present at runtime
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
# Trash: macOS = trash / Apple's /usr/bin/trash; Linux = gio (glib2) oder trash-put (trash-cli).
if [ "$OS" = linux ]; then
  b_trash=false; { have gio || have trash-put; } && b_trash=true
else
  b_trash=false; { have trash || [ -x /usr/bin/trash ]; } && b_trash=true
fi
# Linux-Build-Toolchain (ersetzt den xcode-clt-Required-Check für node-pty-Kompilierung).
b_buildtools=false
if [ "$OS" = linux ]; then
  { have cc || have gcc; } && have make && b_buildtools=true
fi

# CLIs (recommended, nicht hart-required)
c_claude=false; have claude && c_claude=true
c_codex=false;  have codex && c_codex=true
c_agy=false;    have agy && c_agy=true

# Optional features
o_whisper=false;     have whisper-cli && o_whisper=true
o_tailscale=false;   have tailscale && o_tailscale=true
o_cloudflared=false; have cloudflared && o_cloudflared=true
o_moshi=false;       have moshi-hook && o_moshi=true

# Hub läuft? curl /healthz — zuverlässiger als lsof (das den Loopback-Listener
# auf manchen Macs nicht sieht) und bestätigt sogar einen gesunden Hub.
hub_port="${PORT:-3333}"
hub_running=false
if curl -fsS -m1 "http://127.0.0.1:${hub_port}/healthz" >/dev/null 2>&1; then hub_running=true; fi

READY=true
if [ "$OS" = macos ]; then
  for v in "$b_xcode" "$b_brew" "$node_ok" "$b_tmux" "$b_git" "$b_jq" "$b_trash"; do
    [ "$v" = true ] || READY=false
  done
elif [ "$OS" = linux ]; then
  for v in "$b_buildtools" "$node_ok" "$b_tmux" "$b_git" "$b_jq" "$b_trash"; do
    [ "$v" = true ] || READY=false
  done
else
  READY=false
fi

if [ "$JSON" = 1 ]; then
  printf '{"os":"%s","arch":"%s","macos":"%s",' "$OS" "$ARCH" "$MACOS_VER"
  if [ "$OS" = linux ]; then
    printf '"required":{"build_tools":%s,"node":%s,"node_version":"%s","tmux":%s,"git":%s,"jq":%s,"trash":%s},' \
      "$b_buildtools" "$node_ok" "$node_ver" "$b_tmux" "$b_git" "$b_jq" "$b_trash"
  else
    printf '"required":{"xcode_clt":%s,"brew":%s,"node":%s,"node_version":"%s","tmux":%s,"git":%s,"jq":%s,"trash":%s},' \
      "$b_xcode" "$b_brew" "$node_ok" "$node_ver" "$b_tmux" "$b_git" "$b_jq" "$b_trash"
  fi
  printf '"clis":{"claude":%s,"codex":%s,"agy":%s},' "$c_claude" "$c_codex" "$c_agy"
  printf '"optional":{"whisper":%s,"tailscale":%s,"cloudflared":%s,"moshi_hook":%s},' \
    "$o_whisper" "$o_tailscale" "$o_cloudflared" "$o_moshi"
  printf '"hub_running":%s,"ready":%s}\n' "$hub_running" "$READY"
else
  C_RED="${C_ERR_RED:-}"; [ -t 1 ] && C_RED=$'\033[31m'
  mark() { [ "$1" = true ] && printf '%s✓%s' "$C_GREEN" "$C_RESET" || printf '%s✕%s' "$C_RED" "$C_RESET"; }
  log ""
  log "${C_TEAL}${C_BOLD}  Penates — Doctor${C_RESET}"
  log "  OS: $OS $MACOS_VER ($ARCH)"
  if [ "$OS" = linux ]; then
    printf '  Required:  %s build-tools  %s node(%s)  %s tmux  %s git  %s jq  %s trash\n' \
      "$(mark "$b_buildtools")" "$(mark "$node_ok")" "${node_ver:-—}" \
      "$(mark "$b_tmux")" "$(mark "$b_git")" "$(mark "$b_jq")" "$(mark "$b_trash")"
  else
    printf '  Required:  %s xcode-clt  %s brew  %s node(%s)  %s tmux  %s git  %s jq  %s trash\n' \
      "$(mark "$b_xcode")" "$(mark "$b_brew")" "$(mark "$node_ok")" "${node_ver:-—}" \
      "$(mark "$b_tmux")" "$(mark "$b_git")" "$(mark "$b_jq")" "$(mark "$b_trash")"
  fi
  printf '  CLIs:      %s claude  %s codex  %s agy\n' "$(mark "$c_claude")" "$(mark "$c_codex")" "$(mark "$c_agy")"
  printf '  Optional:  %s whisper  %s tailscale  %s cloudflared  %s moshi-hook\n' \
    "$(mark "$o_whisper")" "$(mark "$o_tailscale")" "$(mark "$o_cloudflared")" "$(mark "$o_moshi")"
  printf '  Hub running (:%s): %s\n' "$hub_port" "$(mark "$hub_running")"
  if [ "$READY" = true ]; then ok "alle Required-Prereqs vorhanden"; else warn "Required-Prereqs fehlen — siehe ✕ oben"; fi
fi

[ "$OS" = unsupported ] && exit 1
[ "$READY" = true ] && exit 0 || exit 3
