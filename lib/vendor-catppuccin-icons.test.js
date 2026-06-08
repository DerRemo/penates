import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public/vendor/catppuccin-icons');

test('vendored catppuccin icon set is present and complete per manifest', () => {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  } catch {
    assert.fail('public/vendor/catppuccin-icons/manifest.json missing — run "npm run vendor:catppuccin-icons"');
  }
  // Pflicht-Fallbacks müssen immer dabei sein.
  for (const must of ['_file', '_folder', '_folder_open']) {
    assert.ok(manifest.icons.includes(must), `manifest missing required fallback "${must}"`);
  }
  // Jedes gelistete Icon existiert auf der Platte und ist eine css-variables-SVG.
  for (const name of manifest.icons) {
    const p = join(DIR, `${name}.svg`);
    assert.ok(existsSync(p), `vendored icon "${name}.svg" missing — run "npm run vendor:catppuccin-icons"`);
    const svg = readFileSync(p, 'utf8');
    assert.ok(svg.includes('<svg'), `${name}.svg not a valid SVG`);
  }
});
