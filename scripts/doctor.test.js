// scripts/doctor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCTOR = join(dirname(fileURLToPath(import.meta.url)), 'doctor.sh');
function runJson(env = {}) {
  let out, code = 0;
  try {
    out = execFileSync('bash', [DOCTOR, '--json'], { encoding: 'utf8', env: { ...process.env, ...env } });
  } catch (e) { out = e.stdout?.toString() ?? ''; code = e.status ?? 1; }
  return { json: JSON.parse(out), code };
}

test('--json emits a structured report with required/clis/optional blocks', () => {
  // Pin the macOS report shape (xcode_clt/brew keys) so it is deterministic on any
  // host — on a Linux CI runner the real OS would otherwise emit the build_tools
  // shape (no xcode_clt). The Linux shape is covered separately below.
  const { json } = runJson({ PENATES_TEST_OS: 'macos' });
  assert.equal(typeof json.os, 'string');
  for (const k of ['xcode_clt', 'brew', 'node', 'tmux', 'git', 'jq', 'trash'])
    assert.equal(typeof json.required[k], 'boolean', `required.${k}`);
  for (const k of ['claude', 'codex', 'agy'])
    assert.equal(typeof json.clis[k], 'boolean', `clis.${k}`);
  assert.equal(typeof json.ready, 'boolean');
});

test('a missing required tool flips ready=false and exit 3', () => {
  const { json, code } = runJson({ PENATES_TEST_MISSING: 'tmux' });
  assert.equal(json.required.tmux, false);
  assert.equal(json.ready, false);
  assert.equal(code, 3);
});

test('all required present → ready=true and exit 0 (reference machine)', () => {
  const { json, code } = runJson();
  // On a fully-provisioned dev machine this is the happy path.
  if (json.ready) assert.equal(code, 0);
  else assert.equal(code, 3); // CI without all prereqs: still internally consistent
});

test('Linux branch reports build_tools instead of xcode/brew and is internally consistent', () => {
  const { json } = runJson({ PENATES_TEST_OS: 'linux' });
  assert.equal(json.os, 'linux');
  assert.equal(typeof json.required.build_tools, 'boolean');
  assert.equal(typeof json.required.node, 'boolean');
  assert.equal(typeof json.required.trash, 'boolean');
  assert.equal(json.required.xcode_clt, undefined); // no xcode key on linux
  assert.equal(typeof json.ready, 'boolean');
});

test('Linux missing tmux → ready=false, exit 3', () => {
  const { json, code } = runJson({ PENATES_TEST_OS: 'linux', PENATES_TEST_MISSING: 'tmux' });
  assert.equal(json.required.tmux, false);
  assert.equal(json.ready, false);
  assert.equal(code, 3);
});
