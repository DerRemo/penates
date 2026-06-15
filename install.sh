#!/usr/bin/env bash
set -euo pipefail
# Claude Code Hub — One-Line Bootstrap (geführt).
#   curl -fsSL --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/DerRemo/claude-code-hub/main/install.sh | bash
RAW_BASE="${CCHUB_RAW_BASE:-https://raw.githubusercontent.com/DerRemo/claude-code-hub/main}"
REPO_URL="${CCHUB_REPO_URL:-https://github.com/DerRemo/claude-code-hub.git}"
GIT_DIR="${CCHUB_GIT_DIR:-$HOME/claude-code-hub}"
REMOTE="${CCHUB_REMOTE:-}"
NO_CLI="${CCHUB_NO_CLI:-0}"
DO_CHECK=0

usage() {
  cat <<EOF
Claude Code Hub — Installer
Usage: install.sh [flags]
  --check                 nur Preflight-Report, nichts ändern (Exit 3 wenn Prereqs fehlen)
  --dry-run               jede Aktion drucken, nichts ausführen
  --yes | --no-prompt     keine Prompts (headless/CI)
  --remote=tailscale|cloudflare|skip
  --no-cli                CLI-Installation überspringen
  --git-dir=<path>        Clone-Ziel (default ~/claude-code-hub)
  --verbose               Debug-Ausgabe
  --help                  diese Hilfe
Env-Twins: CCHUB_CHECK, CCHUB_DRY_RUN, CCHUB_YES, CCHUB_REMOTE, CCHUB_NO_CLI, CCHUB_GIT_DIR, CCHUB_VERBOSE
EOF
}

# ---- arg parsing (Env als Default, Flag überschreibt) ----
# NOTE: arg parsing runs BEFORE sourcing lib.sh so --help/invalid-flag work standalone.
: "${CCHUB_DRY_RUN:=0}"; : "${CCHUB_YES:=0}"; : "${CCHUB_VERBOSE:=0}"; : "${CCHUB_CHECK:=0}"
DO_CHECK="$CCHUB_CHECK"
for a in "$@"; do
  case "$a" in
    --check) DO_CHECK=1 ;;
    --dry-run) CCHUB_DRY_RUN=1 ;;
    --yes|--no-prompt) CCHUB_YES=1 ;;
    --no-cli) NO_CLI=1 ;;
    --verbose) CCHUB_VERBOSE=1 ;;
    --remote=*) REMOTE="${a#*=}" ;;
    --git-dir=*) GIT_DIR="${a#*=}" ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unbekanntes Argument: %s\n' "$a" >&2; usage >&2; exit 2 ;;
  esac
done
export CCHUB_DRY_RUN CCHUB_YES CCHUB_VERBOSE

# ---- lib.sh + doctor.sh beschaffen (Checkout ODER Boot-Download → eine Detection-Quelle) ----
BOOT_TMP=""
cleanup() { [ -n "$BOOT_TMP" ] && rm -rf "$BOOT_TMP" || true; }
trap cleanup EXIT
if [ -f scripts/lib.sh ] && [ -f setup.sh ]; then
  LIB=scripts/lib.sh; DOCTOR=scripts/doctor.sh; CHECKOUT="$(pwd)"
else
  BOOT_TMP="$(mktemp -d)"
  curl -fsSL --proto '=https' --tlsv1.2 "$RAW_BASE/scripts/lib.sh"    -o "$BOOT_TMP/lib.sh"
  curl -fsSL --proto '=https' --tlsv1.2 "$RAW_BASE/scripts/doctor.sh" -o "$BOOT_TMP/doctor.sh"
  LIB="$BOOT_TMP/lib.sh"; DOCTOR="$BOOT_TMP/doctor.sh"; CHECKOUT=""
fi
# shellcheck source=scripts/lib.sh
# shellcheck disable=SC1091  # lib.sh path is dynamic ($LIB); file always present at runtime
source "$LIB"

log ""; log "${C_TEAL}${C_BOLD}  ⚡ Claude Code Hub — Installer${C_RESET}"

# ---- Phase 0: Preflight-Report ----
step "Preflight"
doctor_rc=0; bash "$DOCTOR" || doctor_rc=$?   # ✓/✕-Report; Exit-Code fangen (|| umgeht set -e)
if [ "$DO_CHECK" = 1 ]; then exit "$doctor_rc"; fi   # --check: Report + Exit-Code, IMMER beenden — keine Mutation
[ "$(os_detect)" = macos ] || { err "Nur macOS wird unterstützt (Linux=Phase 2, Windows→WSL2)."; exit 1; }
macos_major="$(sw_vers -productVersion 2>/dev/null | cut -d. -f1 || true)"
[ "${macos_major:-0}" -ge 15 ] 2>/dev/null || warn "macOS < 15 (Sequoia) erkannt — jq/trash sind erst ab 15 Apple-mitgeliefert; best-effort via Homebrew."
confirm "  Fortfahren und fehlende Prereqs installieren?" || { warn "abgebrochen"; exit 0; }

# ---- Phase 1+2: detect-then-install ----
step "Prereqs"
if ! { have xcode-select && xcode-select -p >/dev/null 2>&1; }; then
  guide_step "Xcode Command Line Tools" \
    bash -c 'xcode-select -p >/dev/null 2>&1' -- \
    "Es öffnet sich ein Apple-Dialog → klicke *Installieren* und warte, bis er fertig ist." \
    "(Starte ihn ggf. mit:  xcode-select --install )" || true
fi
have brew || { warn "Homebrew wird installiert (fragt nach deinem Passwort)…"; \
  run /bin/bash -c "$(curl -fsSL --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; }
eval "$("$(arch_brew_prefix)/bin/brew" shellenv 2>/dev/null)" || true
have node  || run brew install node
have tmux  || run brew install tmux
have git   || run brew install git
have jq    || run brew install jq
{ have trash || [ -x /usr/bin/trash ]; } || run brew install trash
have moshi-hook || { run brew tap rjyo/moshi && run brew install moshi-hook; } || warn "moshi-hook nicht installiert (übersprungen — optional)"

# ---- Phase 3: Coding-CLIs (graceful) ----
if [ "$NO_CLI" != 1 ]; then
  step "Coding-CLIs"
  have claude || run bash -c 'curl -fsSL --proto =https --tlsv1.2 https://claude.ai/install.sh | bash' || warn "claude-Install fehlgeschlagen (übersprungen)"
  have codex  || CODEX_NON_INTERACTIVE=1 run bash -c 'curl -fsSL --proto =https --tlsv1.2 https://chatgpt.com/codex/install.sh | sh' || warn "codex-Install fehlgeschlagen (übersprungen)"
  have agy    || run bash -c 'curl -fsSL --proto =https --tlsv1.2 https://antigravity.google/cli/install.sh | bash' || warn "agy-Install fehlgeschlagen (übersprungen)"
fi

# ---- Phase 4: App holen ----
step "App"
if [ -n "$CHECKOUT" ]; then
  APP_DIR="$CHECKOUT"; ok "Checkout erkannt: $APP_DIR"
else
  if [ -d "$GIT_DIR/.git" ]; then run git -C "$GIT_DIR" pull --ff-only || true
  else run git clone "$REPO_URL" "$GIT_DIR"; fi
  APP_DIR="$GIT_DIR"
fi
cd "$APP_DIR"

# ---- Phase 5: setup.sh ----
step "Setup"
CCHUB_FROM_INSTALL=1 run bash ./setup.sh

# ---- Phase 6: Remote ----
step "Remote-Zugriff"
TODO_FILE="$(mktemp)"; REMOTE_OUT="$(mktemp)"
# shellcheck disable=SC2086  # ${REMOTE:+"$REMOTE"} intentional: pass arg only when non-empty (word-split safe via quoting)
CCHUB_TODO_FILE="$TODO_FILE" CCHUB_REMOTE_OUT="$REMOTE_OUT" \
  run bash ./scripts/remote-setup.sh ${REMOTE:+"$REMOTE"} || true

# ---- Phase 7: Abschluss-Report ----
step "Fertig"
PORT="$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2- || true)"; PORT="${PORT:-3333}"
TOKEN="$(grep '^AUTH_TOKEN=' .env 2>/dev/null | cut -d= -f2- || true)"
REMOTE_URL="$(sed -n 's/^URL=//p' "$REMOTE_OUT" 2>/dev/null | head -1 || true)"
log ""
ok "Hub läuft:  http://localhost:${PORT}"
[ -n "$REMOTE_URL" ] && ok "Remote:     ${REMOTE_URL}"
[ -n "$TOKEN" ] && log "  ${C_BOLD}Token:${C_RESET} ${TOKEN}"
log ""
log "  ${C_BOLD}📋 Noch von dir zu tun:${C_RESET}"
for cli in claude codex agy; do have "$cli" && log "    • $cli   → einmal starten und im Browser einloggen" || true; done
if [ -s "$TODO_FILE" ]; then while IFS= read -r t; do log "    • $t"; done < "$TODO_FILE"; fi
log "    • Prüfen:  ./scripts/doctor.sh"
rm -f "$TODO_FILE" "$REMOTE_OUT"
