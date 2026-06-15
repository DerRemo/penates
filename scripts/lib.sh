#!/usr/bin/env bash
# Geteilte Helfer für install.sh / doctor.sh / remote-setup.sh.
# OS-agnostisch strukturiert: macOS implementiert, Linux = Phase 2.
# Wird gesourct, nie direkt ausgeführt.

: "${PENATES_DRY_RUN:=0}"
: "${PENATES_YES:=0}"
: "${PENATES_VERBOSE:=0}"
: "${PENATES_TEST_MISSING:=}"   # Test-Seam: Komma-Liste „fehlender" Binaries

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_TEAL=$'\033[38;5;43m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_TEAL=''; C_YELLOW=''; C_GREEN=''
fi
if [ -t 2 ]; then C_ERR_RED=$'\033[31m'; C_ERR_RESET=$'\033[0m'; else C_ERR_RED=''; C_ERR_RESET=''; fi

log()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$C_GREEN"   "$C_RESET" "$*"; }
warn() { printf '  %s⚠%s %s\n' "$C_YELLOW"  "$C_RESET" "$*"; }
err()  { printf '  %s✕%s %s\n' "$C_ERR_RED" "$C_ERR_RESET" "$*" >&2; }
step() { printf '\n%s▸ %s%s\n' "$C_TEAL$C_BOLD" "$*" "$C_RESET"; }
dbg()  { [ "$PENATES_VERBOSE" = 1 ] && printf '  %s· %s%s\n' "$C_DIM" "$*" "$C_RESET" || true; }

# have <cmd> — installiert? (mit Test-Seam PENATES_TEST_MISSING)
have() {
  case ",${PENATES_TEST_MISSING}," in *",$1,"*) return 1 ;; esac
  command -v "$1" >/dev/null 2>&1
}

os_detect() {
  case "$(uname -s)" in
    Darwin) echo macos ;;
    Linux)  echo linux ;;
    *)      echo unsupported ;;
  esac
}

arch_brew_prefix() {
  if [ "$(uname -m)" = "arm64" ]; then echo /opt/homebrew; else echo /usr/local; fi
}

# is_tty — können wir den User interaktiv fragen? (auch wenn stdin = curl-Pipe)
is_tty() { [ -t 0 ] || { true >/dev/tty; } 2>/dev/null; }

# Hinweis: confirm = auto-JA bei --yes/headless (für „fortfahren?"-Prompts); guide_step hingegen SKIP bei headless.
# confirm <prompt> → 0=ja / 1=nein. Auto-ja bei --yes/headless.
confirm() {
  [ "$PENATES_YES" = 1 ] && return 0
  is_tty || return 0
  local a; printf '%s [Y/n] ' "$*" > /dev/tty; read -r a < /dev/tty || a=''
  case "$a" in n|N|no|NO) return 1 ;; *) return 0 ;; esac
}

# run <cmd...> — mutierender Befehl, respektiert --dry-run
run() {
  if [ "$PENATES_DRY_RUN" = 1 ]; then printf '  %s[dry-run] %s%s\n' "$C_DIM" "$*" "$C_RESET"; return 0; fi
  dbg "exec: $*"
  "$@"
}

# guide_step <label> <verify_cmd...> -- <instruction-lines...>
# Pollt verify; rot → Anleitung + warten (TTY) + erneut prüfen. 0=ok / 1=übersprungen.
# Übersprungene Schritte sammelt der Aufrufer für den TODO-Report.
guide_step() {
  local label="$1"; shift
  local verify=()
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do verify+=("$1"); shift; done
  shift || true   # consume "--"
  if [ "${#verify[@]}" -eq 0 ]; then err "guide_step: kein verify-Befehl angegeben"; return 1; fi
  if "${verify[@]}" >/dev/null 2>&1; then ok "$label"; return 0; fi
  warn "$label — Aktion nötig:"
  local line; for line in "$@"; do printf '    %s\n' "$line"; done
  while true; do
    if [ "$PENATES_YES" = 1 ] || ! is_tty; then
      warn "$label → headless übersprungen (s. TODO-Report)"; return 1
    fi
    printf '    ↳ Enter wenn erledigt (oder "s" = überspringen): ' > /dev/tty
    local a; read -r a < /dev/tty || a='s'
    [ "$a" = s ] && { warn "$label übersprungen"; return 1; }
    if "${verify[@]}" >/dev/null 2>&1; then ok "$label"; return 0; fi
    err "noch nicht erkannt — nochmal?"
  done
}
