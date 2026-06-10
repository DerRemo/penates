import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.html'),
  'utf8',
);

test('no `transition: all` anywhere (CSS or JS-set)', () => {
  // Catch both the CSS colon form (`transition: all …`) and the JS assignment
  // form (`transition = 'all …'`) — the spec bans the lazy `all` keyword in both.
  const hits = html.match(/transition\s*[:=]\s*['"]?all\b/g) || [];
  assert.equal(hits.length, 0, `found ${hits.length} \`transition … all\``);
});

test('dead --ease-in token is gone (definition + usage)', () => {
  // --ease-in-out and --ease-out must survive; only the bare --ease-in dies.
  assert.equal((html.match(/--ease-in\b(?!-out)/g) || []).length, 0,
    'bare --ease-in still present');
  assert.match(html, /--ease-out:/, '--ease-out must remain');
  assert.match(html, /--ease-in-out:/, '--ease-in-out must remain');
});

test('--ease-drawer token exists and is used', () => {
  assert.match(html, /--ease-drawer:\s*cubic-bezier/, 'token definition missing');
  assert.match(html, /var\(--ease-drawer\)/, 'token never used');
});

test('view-enter keyframes exist', () => {
  assert.match(html, /@keyframes view-enter\b/, 'view-enter missing');
  assert.match(html, /@keyframes view-enter-fade\b/, 'view-enter-fade missing');
});
