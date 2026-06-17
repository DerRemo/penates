#!/usr/bin/env bash
# Regenerate the Xcode project from project.yml (picks up newly added source
# files), then build + run the unit tests on a simulator. One command for the
# whole iOS test cycle — used by implementer subagents after adding files.
set -euo pipefail
cd "$(dirname "$0")/.."
xcodegen generate >/dev/null

# Resolve a concrete "iPhone 17" simulator UDID. Multiple installed runtimes
# can each expose a same-named device, which makes a bare `name=iPhone 17`
# destination ambiguous — xcodebuild may pick a Shutdown one and fail preflight
# ("Unable to boot … Busy"). Picking one UDID, booting it, and targeting by id
# is deterministic. Override with PENATES_SIM_UDID to use a specific device.
UDID="${PENATES_SIM_UDID:-$(xcrun simctl list devices available \
  | grep -m1 'iPhone 17 (' \
  | grep -oiE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')}"
if [ -z "$UDID" ]; then
  echo "build-test: no available 'iPhone 17' simulator found" >&2
  exit 1
fi
xcrun simctl boot "$UDID" 2>/dev/null || true   # idempotent: ignores "already booted"

xcodebuild test \
  -project Penates.xcodeproj \
  -scheme Penates \
  -destination "platform=iOS Simulator,id=$UDID" \
  -quiet
