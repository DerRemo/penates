// scripts/install.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const INSTALL = join(dirname(fileURLToPath(import.meta.url)), '..', 'install.sh');
function run(args, env = {}) {
  let out, code = 0;
  try { out = execFileSync('bash', [INSTALL, ...args], { encoding: 'utf8', env: { ...process.env, ...env } }); }
  catch (e) { out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? ''); code = e.status ?? 1; }
  return { out, code };
}

test('--help prints usage and exits 0', () => {
  const { out, code } = run(['--help']);
  assert.equal(code, 0);
  assert.match(out, /Usage|--remote|--dry-run/);
});

test('invalid flag exits 2', () => {
  assert.equal(run(['--frobnicate']).code, 2);
});

test('--check runs doctor and stops without mutating (exit 0 or 3)', () => {
  const { code } = run(['--check'], { CCHUB_TEST_MISSING: 'tmux' });
  assert.equal(code, 3); // tmux forced missing → not ready
});
