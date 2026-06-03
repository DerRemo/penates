import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('vendored xterm manifest matches installed @xterm versions', () => {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, 'public/vendor/xterm/manifest.json'), 'utf8'));
  } catch {
    assert.fail('public/vendor/xterm/manifest.json missing — run "npm run vendor:xterm"');
  }
  const pkgs = Object.keys(manifest);
  assert.ok(pkgs.length >= 5, `expected >=5 vendored packages, got ${pkgs.length}`);
  for (const [pkg, vendored] of Object.entries(manifest)) {
    let installed;
    try {
      installed = JSON.parse(readFileSync(join(ROOT, 'node_modules', pkg, 'package.json'), 'utf8')).version;
    } catch {
      assert.fail(`${pkg} not installed — run "npm install"`);
    }
    assert.equal(vendored, installed,
      `${pkg}: vendored ${vendored} != installed ${installed} — run "npm run vendor:xterm"`);
  }
});
