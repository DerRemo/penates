#!/usr/bin/env bash
# Hub Self-Update: holt den neuesten Release-Tag, checkt ihn aus und ruft das
# idempotente setup.sh (npm install, vendor, Hooks/StatusLine/LaunchAgent +
# Server-Restart). Auch ohne Hub direkt aufrufbar: ./scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch --tags --prune
TAG=$(git -c versionsort.suffix=- tag --sort=-v:refname | head -1)
[ -n "$TAG" ] || { echo "Kein Release-Tag gefunden — Abbruch."; exit 1; }
echo "Update auf $TAG …"
git checkout "$TAG"
exec ./setup.sh
