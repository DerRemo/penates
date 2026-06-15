// scripts/remote-setup.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RS = join(dirname(fileURLToPath(import.meta.url)), 'remote-setup.sh');
function run(args, env = {}) {
  let out, code = 0;
  try { out = execFileSync('bash', [RS, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); }
  catch (e) { out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? ''); code = e.status ?? 1; }
  return { out, code };
}

test('invalid path arg exits 2', () => {
  assert.equal(run(['wormhole']).code, 2);
});

test('--dry-run tailscale prints the plan, mutates nothing, exits 0', () => {
  const { out, code } = run(['tailscale', '--dry-run']);
  assert.equal(code, 0);
  assert.match(out, /tailscale serve/);
  assert.match(out, /\[dry-run\]/);
});

test('skip path is a no-op success', () => {
  assert.equal(run(['skip']).code, 0);
});
