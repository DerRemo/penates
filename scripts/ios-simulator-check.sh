#!/bin/bash
set -e
DEVICE="${1:-iPhone 15}"
URL="${2:-http://localhost:3334}"
OUT_DIR=".superpowers/sim-screenshots"
mkdir -p "$OUT_DIR"

echo "Booting $DEVICE..."
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator

echo "Waiting 6s for boot..."
sleep 6

echo "Opening $URL in Safari..."
xcrun simctl openurl booted "$URL"

echo "Capturing 3 screenshots (0s, 4s, 8s)"
sleep 2
xcrun simctl io booted screenshot "$OUT_DIR/shot-initial.png"
sleep 4
xcrun simctl io booted screenshot "$OUT_DIR/shot-mid.png"
sleep 4
xcrun simctl io booted screenshot "$OUT_DIR/shot-final.png"
echo "Done. Screenshots in $OUT_DIR/"
