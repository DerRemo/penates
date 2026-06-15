// scripts/linux-smoke.test.js — guard for the Linux container smoke harness.
// Docker is not available in unit runs, so the harness is not executed here; we
// assert it exists, is syntactically valid, and references the key verification
// steps. The full run is a manual/CI Docker invocation (see Dockerfile header).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('linux-smoke.sh exists and is syntactically valid bash', () => {
  const p = join(ROOT, 'scripts', 'linux-smoke.sh');
  assert.ok(existsSync(p), 'scripts/linux-smoke.sh missing');
  execFileSync('bash', ['-n', p]); // throws on syntax error
});

test('linux-smoke.sh asserts the key steps (doctor, healthz, cc- session)', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'linux-smoke.sh'), 'utf8');
  assert.match(src, /doctor\.sh --json/);
  assert.match(src, /os==="linux" && d\.ready/);
  assert.match(src, /\/healthz/);
  assert.match(src, /api\/sessions/);
  assert.match(src, /cc-smoke/);
});

test('Dockerfile.linux-smoke installs the Linux required toolchain', () => {
  const df = readFileSync(join(ROOT, 'Dockerfile.linux-smoke'), 'utf8');
  for (const pkg of ['tmux', 'jq', 'trash-cli', 'build-essential', 'nodejs'])
    assert.match(df, new RegExp(pkg), `Dockerfile should install ${pkg}`);
  assert.match(df, /npm install/);
  assert.match(df, /linux-smoke\.sh/); // CMD runs the smoke script
});
