import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'vendor', 'xterm');

const PKGS = [
  '@xterm/xterm',
  '@xterm/addon-fit',
  '@xterm/addon-web-links',
  '@xterm/addon-webgl',
  '@xterm/addon-unicode-graphemes',
  '@xterm/addon-search',
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const manifest = {};
const seen = new Set(); // guard against two packages shipping the same lib filename
for (const pkg of PKGS) {
  const pkgDir = join(ROOT, 'node_modules', pkg);
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    console.error(`vendor-xterm: ${pkg} not found in node_modules — run "npm install" first`);
    process.exit(1);
  }
  manifest[pkg] = meta.version;
  const libDir = join(pkgDir, 'lib');
  for (const f of readdirSync(libDir)) {
    // Copy only the UMD build (.js); skip .mjs (ESM) and .js.map (sourcemaps).
    if (!f.endsWith('.js')) continue;
    if (seen.has(f)) {
      console.error(`vendor-xterm: filename collision on "${f}" — two @xterm packages ship the same lib file`);
      process.exit(1);
    }
    seen.add(f);
    cpSync(join(libDir, f), join(OUT, f));
  }
  if (pkg === '@xterm/xterm') {
    cpSync(join(pkgDir, 'css', 'xterm.css'), join(OUT, 'xterm.css'));
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`vendor-xterm: wrote ${Object.keys(manifest).length} packages to public/vendor/xterm/`);
