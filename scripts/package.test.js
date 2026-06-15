import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

test('declares a Node engine floor of >=20', () => {
  assert.ok(pkg.engines && typeof pkg.engines.node === 'string', 'engines.node missing');
  assert.match(pkg.engines.node, />=\s*20/);
});
