#!/usr/bin/env bash
# Regenerate the Xcode project from project.yml (picks up newly added source
# files), then build + run the unit tests on a simulator. One command for the
# whole iOS test cycle — used by implementer subagents after adding files.
set -euo pipefail
cd "$(dirname "$0")/.."
xcodegen generate >/dev/null

# Resolve a concrete "iPhone 17" simulator UDID on the iOS 26.5 runtime.
# Multiple installed runtimes (26.4 + 26.5) each expose a same-named device,
# which makes a bare `name=iPhone 17` destination ambiguous — xcodebuild may
# pick a Shutdown one (or the wrong runtime) and fail preflight. We pin to
# 26.5 explicitly, boot it, and target by id for determinism. Override the
# device with PENATES_SIM_UDID, or the runtime with PENATES_SIM_RUNTIME.
RUNTIME="${PENATES_SIM_RUNTIME:-iOS 26.5}"
UDID="${PENATES_SIM_UDID:-$(xcrun simctl list devices "$RUNTIME" available \
  | grep -m1 'iPhone 17 (' \
  | grep -oiE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')}"
if [ -z "$UDID" ]; then
  echo "build-test: no available 'iPhone 17' simulator on $RUNTIME" >&2
  exit 1
fi
xcrun simctl boot "$UDID" 2>/dev/null || true   # idempotent: ignores "already booted"

xcodebuild test \
  -project Penates.xcodeproj \
  -scheme Penates \
  -destination "platform=iOS Simulator,id=$UDID" \
  -quiet
