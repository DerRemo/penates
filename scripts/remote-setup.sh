#!/usr/bin/env bash
set -uo pipefail
# Remote-Zugriff einrichten — geführt. Usage: remote-setup.sh [tailscale|cloudflare|skip] [--dry-run]
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
# shellcheck disable=SC1091  # lib.sh path is dynamic ($HERE); file always present at runtime
source "$HERE/lib.sh"
APP_DIR="$(cd "$HERE/.." && pwd)"

MODE=""
for a in "$@"; do
  case "$a" in
    tailscale|cloudflare|skip) MODE="$a" ;;
    --dry-run) PENATES_DRY_RUN=1 ;;
    --yes) PENATES_YES=1 ;;
    *) err "unbekanntes Argument: $a"; exit 2 ;;
  esac
done

env_get() { grep "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-; }
env_set() { # env_set KEY VALUE
  if grep -q "^$1=" "$APP_DIR/.env" 2>/dev/null; then
    run sed -i '' "s#^$1=.*#$1=$2#" "$APP_DIR/.env"
  else
    # shellcheck disable=SC2034  # PENATES_DRY_RUN read by run(); value surfaced in [dry-run] output
    [ "$PENATES_DRY_RUN" = 1 ] && printf '  [dry-run] echo %s=%s >> .env\n' "$1" "$2" || printf '%s=%s\n' "$1" "$2" >> "$APP_DIR/.env"
  fi
}
HUB_PORT="$(env_get PORT)"; HUB_PORT="${HUB_PORT:-3333}"

if [ -z "$MODE" ]; then
  if [ "$PENATES_YES" = 1 ] || ! is_tty; then MODE="skip"; else
    log ""; log "  Remote-Zugriff:"
    log "    1) Tailscale  — empfohlen, keine Domain, echtes HTTPS (PWA/Push)"
    log "    2) Cloudflare — eigene Domain / öffentlich"
    log "    3) Überspringen (nur lokal)"
    printf '  Wahl [1]: ' > /dev/tty; read -r ch < /dev/tty || ch=1
    case "$ch" in 2) MODE=cloudflare ;; 3) MODE=skip ;; *) MODE=tailscale ;; esac
  fi
fi

setup_tailscale() {
  step "Tailscale-Remote"
  # --dry-run ist ein reiner Plan-Preview: nicht an fehlendem brew / nicht-angemeldetem
  # Tailscale abbrechen (sonst zeigt der Plan auf einer Maschine ohne Homebrew nichts).
  if ! have brew && [ "$PENATES_DRY_RUN" != 1 ]; then
    err "Homebrew fehlt — erst install.sh/Prereqs."; return 1
  fi
  have tailscale || run brew install tailscale
  if ! guide_step "Tailscale angemeldet" tailscale status --json -- \
        "Führe aus:  sudo tailscale up" \
        "und melde dich im Browser an." && [ "$PENATES_DRY_RUN" != 1 ]; then
    REMOTE_TODO+=("sudo tailscale up  # dann erneut: ./scripts/remote-setup.sh tailscale"); return 1
  fi
  # MagicDNS + HTTPS-Certs (Admin-Console, nicht skriptbar)
  local host url
  host="$(tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName":"\([^"]*\)".*/\1/p' | head -1)"
  host="${host%.}"
  guide_step "Tailscale HTTPS aktiv" bash -c "tailscale cert ${host:-x} >/dev/null 2>&1 || tailscale serve status >/dev/null 2>&1" -- \
    "Aktiviere HTTPS-Certs + MagicDNS im Admin:" \
    "  https://login.tailscale.com/admin/dns  (Enable HTTPS)" \
    || REMOTE_TODO+=("Tailscale-Admin: HTTPS-Certs aktivieren, dann: tailscale serve --bg ${HUB_PORT}")
  run tailscale serve --bg "${HUB_PORT}" || run tailscale serve --bg https / "http://localhost:${HUB_PORT}"
  url=""
  [ -n "$host" ] && { url="https://${host}"; env_set VAPID_SUBJECT "$url"; }
  ok "Tailscale-Serve aktiv → ${url:-https://<dein-host>.ts.net}"
  [ -n "$url" ] && REMOTE_URL="$url"
}

setup_cloudflare() {
  step "Cloudflare-Tunnel-Remote"
  have brew || { err "Homebrew fehlt."; return 1; }
  have cloudflared || run brew install cloudflared
  local domain=''
  if [ "$PENATES_YES" = 1 ] || ! is_tty; then
    REMOTE_TODO+=("cloudflared tunnel login && cloudflared tunnel create claude-hub")
    REMOTE_TODO+=("README → 'Remote über Cloudflare' für config.yml + service install")
    warn "Cloudflare braucht interaktiven Login/Domain → in den TODO-Report verschoben"; return 1
  fi
  printf '  Domain (z.B. code.deine-domain.xyz): ' > /dev/tty; read -r domain < /dev/tty || domain=''
  [ -z "$domain" ] && { warn "keine Domain → übersprungen"; return 1; }
  # shellcheck disable=SC2016  # $HOME intentionally unexpanded here; bash -c evaluates it in the subprocess
  guide_step "cloudflared angemeldet" bash -c '[ -f "$HOME/.cloudflared/cert.pem" ]' -- \
    "Führe aus:  cloudflared tunnel login" || { REMOTE_TODO+=("cloudflared tunnel login"); return 1; }
  run cloudflared tunnel create claude-hub || true
  local tid
  tid="$(cloudflared tunnel list 2>/dev/null | awk '/claude-hub/{print $1; exit}')"
  run cloudflared tunnel route dns claude-hub "$domain" || true
  if [ "$PENATES_DRY_RUN" = 1 ]; then
    printf '  [dry-run] write ~/.cloudflared/config.yml (tunnel %s → localhost:%s)\n' "${tid:-<id>}" "$HUB_PORT"
  else
    mkdir -p "$HOME/.cloudflared"
    cat > "$HOME/.cloudflared/config.yml" <<YAML
tunnel: ${tid}
credentials-file: ${HOME}/.cloudflared/${tid}.json
ingress:
  - hostname: ${domain}
    service: http://localhost:${HUB_PORT}
  - service: http_status:404
YAML
  fi
  run cloudflared service install || true
  env_set VAPID_SUBJECT "https://${domain}"
  ok "Cloudflare-Tunnel → https://${domain}"
  REMOTE_TODO+=("Optional härten: Cloudflare Access vor den Tunnel (README → 'mit Cloudflare Access härten')")
  REMOTE_URL="https://${domain}"
}

# shellcheck disable=SC2034  # REMOTE_TODO/REMOTE_URL consumed via PENATES_TODO_FILE/PENATES_REMOTE_OUT below
REMOTE_TODO=(); REMOTE_URL=""
case "$MODE" in
  tailscale)  setup_tailscale  || true ;;
  cloudflare) setup_cloudflare || true ;;
  skip)       ok "Remote übersprungen — Hub nur lokal (http://localhost:${HUB_PORT})" ;;
esac

# TODO-Report exportieren (install.sh liest diese Datei für den Abschluss-Report)
: > "${PENATES_TODO_FILE:-/dev/null}"
for t in "${REMOTE_TODO[@]+"${REMOTE_TODO[@]}"}"; do [ -n "$t" ] && printf '%s\n' "$t" >> "${PENATES_TODO_FILE:-/dev/null}"; done
[ -n "$REMOTE_URL" ] && printf 'URL=%s\n' "$REMOTE_URL" >> "${PENATES_REMOTE_OUT:-/dev/null}"
exit 0
