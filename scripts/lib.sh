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
  if [ -n "${PENATES_TEST_OS:-}" ]; then echo "$PENATES_TEST_OS"; return; fi
  case "$(uname -s)" in
    Darwin) echo macos ;;
    Linux)  echo linux ;;
    *)      echo unsupported ;;
  esac
}

arch_brew_prefix() {
  if [ "$(uname -m)" = "arm64" ]; then echo /opt/homebrew; else echo /usr/local; fi
}

# PENATES_TEST_PKG — Test-Seam: Komma-Liste „vorhandener" Paketmanager-Binaries.
# Wenn gesetzt, ist die Liste autoritativ (wie PENATES_TEST_OS) — die reale Umgebung
# wird NICHT konsultiert, sonst leakt z. B. das echte apt-get des CI-Runners durch.
: "${PENATES_TEST_PKG:=}"
_pkg_present() {
  if [ -n "$PENATES_TEST_PKG" ]; then
    case ",${PENATES_TEST_PKG}," in *",$1,"*) return 0 ;; *) return 1 ;; esac
  fi
  have "$1"
}

# pkg_manager — erkennt den System-Paketmanager. echo apt|dnf|pacman, sonst "".
pkg_manager() {
  if   _pkg_present apt-get; then echo apt
  elif _pkg_present dnf;     then echo dnf
  elif _pkg_present pacman;  then echo pacman
  else echo ""; fi
}

# install_pkg <canonical...> — mappt kanonische Namen auf Distro-Pakete und
# installiert via dem erkannten Manager (respektiert --dry-run via run()).
# Kanonische Tokens: node tmux git jq trash build-tools python3
install_pkg() {
  local pm; pm="$(pkg_manager)"
  [ -z "$pm" ] && { warn "Kein apt/dnf/pacman erkannt — bitte manuell installieren: $*"; return 1; }
  local pkgs=()
  local tok
  for tok in "$@"; do
    case "$pm:$tok" in
      apt:node)           pkgs+=(nodejs npm) ;;
      apt:trash)          pkgs+=(trash-cli) ;;
      apt:build-tools)    pkgs+=(build-essential python3) ;;
      dnf:node)           pkgs+=(nodejs npm) ;;
      dnf:trash)          pkgs+=(trash-cli) ;;
      dnf:build-tools)    pkgs+=(gcc gcc-c++ make python3) ;;
      pacman:node)        pkgs+=(nodejs npm) ;;
      pacman:trash)       pkgs+=(trash-cli) ;;
      pacman:build-tools) pkgs+=(base-devel python) ;;
      *:python3)          [ "$pm" = pacman ] && pkgs+=(python) || pkgs+=(python3) ;;
      *)                  pkgs+=("$tok") ;;  # tmux/git/jq sind überall identisch
    esac
  done
  case "$pm" in
    apt)    run sudo apt-get install -y "${pkgs[@]}" ;;
    dnf)    run sudo dnf install -y "${pkgs[@]}" ;;
    pacman) run sudo pacman -S --needed --noconfirm "${pkgs[@]}" ;;
  esac
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
