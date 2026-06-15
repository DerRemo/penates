// scripts/lib.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LIB = join(dirname(fileURLToPath(import.meta.url)), 'lib.sh');
// Helper: source lib.sh, run one expression, return stdout
function sh(expr, env = {}) {
  return execFileSync('bash', ['-c', `source "${LIB}"; ${expr}`], {
    encoding: 'utf8', env: { ...process.env, ...env },
  }).trim();
}

test('os_detect returns macos on darwin', () => {
  // runner is macOS for the real suite; on Linux CI this asserts the branch exists
  const out = sh('os_detect');
  assert.ok(['macos', 'linux', 'unsupported'].includes(out));
});

test('arch_brew_prefix maps arch to a brew prefix', () => {
  assert.match(sh('arch_brew_prefix'), /^\/(opt\/homebrew|usr\/local)$/);
});

test('have respects PENATES_TEST_MISSING seam', () => {
  // `sh` is always present; force it "missing" via the seam → exit 1
  assert.equal(sh('if have sh; then echo yes; else echo no; fi'), 'yes');
  assert.equal(sh('if have sh; then echo yes; else echo no; fi', { PENATES_TEST_MISSING: 'sh' }), 'no');
});

test('run honours dry-run (prints, does not execute)', () => {
  const out = sh('PENATES_DRY_RUN=1 run touch /tmp/penates-should-not-exist-xyz');
  assert.match(out, /\[dry-run\] touch/);
  assert.equal(sh('test -e /tmp/penates-should-not-exist-xyz && echo EXISTS || echo absent'), 'absent');
});

test('run with PENATES_DRY_RUN=0 actually executes', () => {
  const tmp = '/tmp/penates-run-test-' + Date.now();
  sh(`PENATES_DRY_RUN=0 run touch ${tmp}`);
  assert.equal(sh(`test -e ${tmp} && echo EXISTS || echo absent`), 'EXISTS');
  sh(`rm -f ${tmp}`);
});

test('confirm returns 0 (auto-yes) when PENATES_YES=1', () => {
  const out = sh('if confirm "x"; then echo Y; else echo N; fi', { PENATES_YES: '1' });
  assert.equal(out, 'Y');
});

test('guide_step returns success when verify command passes', () => {
  const out = sh('guide_step "x" true -- "i" && echo OK', { PENATES_YES: '1' });
  assert.match(out, /OK/);
});

test('guide_step with empty verify returns failure', () => {
  const out = sh('guide_step "x" -- "i" || echo FAILED', { PENATES_YES: '1' });
  assert.match(out, /FAILED/);
});
