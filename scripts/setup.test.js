// scripts/setup.test.js — text-level guard for setup.sh's OS-branched autostart.
// setup.sh is destructive (rewrites launchd plist / systemd unit / Claude hooks),
// so it is NOT executed here. Instead we assert syntax validity + that both OS
// arms and their key directives are present. This is the spec-sanctioned way to
// verify systemd unit-file generation without a PID1-systemd host (see plan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = join(ROOT, 'setup.sh');
const src = readFileSync(SETUP, 'utf8');

test('setup.sh is syntactically valid bash', () => {
  execFileSync('bash', ['-n', SETUP]); // throws on syntax error
});

test('setup.sh branches autostart on OS_KERNEL (Darwin ⊻ Linux)', () => {
  assert.match(src, /OS_KERNEL="\$\(uname -s\)"/);
  assert.match(src, /if \[ "\$OS_KERNEL" = "Darwin" \]/);
  assert.match(src, /elif \[ "\$OS_KERNEL" = "Linux" \]/);
});

test('macOS arm still writes the launchd plist (byte-identical markers intact)', () => {
  assert.match(src, /Library\/LaunchAgents/);
  assert.match(src, /launchctl bootstrap gui/);
  assert.match(src, /<key>KeepAlive<\/key>/);
  assert.match(src, /chmod 644 "\$PLIST_FILE"/);
});

test('Linux arm generates a valid systemd --user unit with the required directives', () => {
  assert.match(src, /UNIT_DIR="\$HOME\/\.config\/systemd\/user"/);
  assert.match(src, /UNIT_FILE="\$UNIT_DIR\/penates\.service"/);
  assert.match(src, /ExecStart=\$\{NODE_BIN\} \$\{APP_DIR\}\/server\.js/);
  assert.match(src, /Restart=always/);
  assert.match(src, /WantedBy=default\.target/);
  assert.match(src, /systemctl --user enable --now penates\.service/);
  assert.match(src, /loginctl enable-linger "\$USER"/);
});

test('Linux arm degrades gracefully without systemd', () => {
  assert.match(src, /Kein systemd erkannt/);
  assert.match(src, /AUTOSTART_SKIPPED=1/);
});

test('moshi-hook + brew installs are macOS-gated (no brew abort on Linux)', () => {
  // moshi-hook block must sit inside a Darwin guard
  assert.match(src, /OS_KERNEL" = "Darwin" \][\s\S]*?brew tap rjyo\/moshi/);
});

test('whisper is best-effort on Linux and the WSL hint is present', () => {
  assert.match(src, /whisper-cli nicht gefunden — Voice-Input bleibt aus \(Best-Effort/);
  assert.match(src, /WSL2 erkannt/);
  assert.match(src, /is_wsl\(\)/);
});
