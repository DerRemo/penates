// Vendors fuse.js' ESM build into public/vendor/fuse/ — Muster wie vendor-xterm.mjs.
// Kein Build-Step: wir kopieren nur dist/fuse.mjs + ein manifest.json für den
// Drift-Guard. Lizenz Apache-2.0 (in node_modules/fuse.js/LICENSE).
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'vendor', 'fuse');
const PKG_DIR = join(ROOT, 'node_modules', 'fuse.js');

let meta;
try {
  meta = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));
} catch {
  console.error('vendor-fuse: fuse.js not found in node_modules — run "npm install" first');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(PKG_DIR, 'dist', 'fuse.mjs'), join(OUT, 'fuse.mjs'));
try { cpSync(join(PKG_DIR, 'LICENSE'), join(OUT, 'LICENSE')); } catch {}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ 'fuse.js': meta.version }, null, 2) + '\n');
console.log(`vendor-fuse: wrote fuse.js@${meta.version} to public/vendor/fuse/`);
