import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('vendored fuse.js manifest matches installed fuse.js version', () => {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(ROOT, 'public/vendor/fuse/manifest.json'), 'utf8'));
  } catch {
    assert.fail('public/vendor/fuse/manifest.json missing — run "npm run vendor:fuse"');
  }
  let installed;
  try {
    installed = JSON.parse(readFileSync(join(ROOT, 'node_modules/fuse.js/package.json'), 'utf8')).version;
  } catch {
    assert.fail('fuse.js not installed — run "npm install"');
  }
  assert.equal(manifest['fuse.js'], installed,
    `fuse.js: vendored ${manifest['fuse.js']} != installed ${installed} — run "npm run vendor:fuse"`);
});
