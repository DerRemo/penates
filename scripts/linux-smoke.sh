#!/usr/bin/env bash
set -uo pipefail
# Linux smoke test — runs INSIDE the container (or on any Linux host). Asserts:
#  1) doctor.sh reports os=linux + ready
#  2) the server boots and answers /healthz
#  3) a real cc- tmux session spawns (the product's session backbone works)
#
# systemd autostart *enable* is NOT covered here (base containers lack PID1
# systemd); the unit-file generation is asserted at the text level by
# scripts/setup.test.js, and a live enable must be verified on a systemd host.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"
PORT="${PORT:-3333}"
TOKEN="${AUTH_TOKEN:-smoke}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "▸ doctor"
bash scripts/doctor.sh --json > /tmp/doctor.json || true
cat /tmp/doctor.json
node -e 'const d=require("/tmp/doctor.json"); process.exit(d.os==="linux" && d.ready ? 0 : 1)' \
  || fail "doctor not ready on linux (see /tmp/doctor.json)"
echo "  ✓ doctor ready"

echo "▸ boot server"
node server.js & SRV=$!
trap 'kill "$SRV" 2>/dev/null; tmux kill-server 2>/dev/null || true' EXIT
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -m1 "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
[ "$ok" = 1 ] || fail "server did not answer /healthz within 15s"
echo "  ✓ /healthz"

echo "▸ spawn cc- session"
curl -fsS -X POST "http://127.0.0.1:${PORT}/api/sessions" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"name\":\"smoke\",\"directory\":\"${HOME}\",\"command\":\"bash\"}" > /tmp/sess.json || fail "create session failed"
cat /tmp/sess.json
# tmux is the source of truth — assert the cc-smoke session is really there.
for _ in $(seq 1 10); do
  if tmux list-sessions 2>/dev/null | grep -q '^cc-smoke'; then
    echo "  ✓ cc-smoke session live"
    echo "SMOKE OK"
    exit 0
  fi
  sleep 0.5
done
fail "cc-smoke tmux session not found"
