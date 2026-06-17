#!/usr/bin/env bash
# Regenerate the Xcode project from project.yml (picks up newly added source
# files), then build + run the unit tests on a simulator. One command for the
# whole iOS test cycle — used by implementer subagents after adding files.
set -euo pipefail
cd "$(dirname "$0")/.."
xcodegen generate >/dev/null
xcodebuild test \
  -project Penates.xcodeproj \
  -scheme Penates \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -quiet
