// Vendors a curated subset of Catppuccin VSCode file icons (css-variables flavor)
// into public/vendor/catppuccin-icons/. Kein npm-Paket → wir holen die SVGs vom
// GitHub-Raw an einem gepinnten Ref. Die css-variables-Variante färbt via
// var(--vscode-ctp-<color>) → eine Datei retintet sich pro Hub-Flavor.
// Lizenz MIT (catppuccin/vscode-icons).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'vendor', 'catppuccin-icons');

// Gepinnter Ref — bewusst ein konkreter Branch/Tag, damit der Vendor
// reproduzierbar ist. Bei Update: REF + ggf. ICONS anpassen, neu vendoren.
const REF = 'main';
const BASE = `https://raw.githubusercontent.com/catppuccin/vscode-icons/${REF}/icons/css-variables`;

// Lokaler Icon-Key (Dateiname unter vendor/, von file-icons.js referenziert)
// → Quell-SVG-Name im Repo. Wo der Repo-Name vom Key abweicht (react→
// javascript-react, shell→bash, document→text, nodejs→npm) mappen wir explizit,
// damit file-icons.js stabile, sprechende Keys behält. _file/_folder/
// _folder_open sind die Pflicht-Fallbacks. Erweitern = hier ergänzen + neu vendoren.
const ICONS = {
  '_file': '_file', '_folder': '_folder', '_folder_open': '_folder_open',
  'javascript': 'javascript', 'typescript': 'typescript',
  'react': 'javascript-react', 'react_ts': 'typescript-react',
  'json': 'json', 'markdown': 'markdown', 'html': 'html', 'css': 'css', 'sass': 'sass',
  'python': 'python', 'rust': 'rust', 'go': 'go', 'shell': 'bash', 'yaml': 'yaml', 'toml': 'toml',
  'lock': 'lock', 'image': 'image', 'pdf': 'pdf', 'svg': 'svg', 'document': 'text',
  'git': 'git', 'docker': 'docker', 'nodejs': 'npm', 'npm': 'npm', 'vue': 'vue',
  'database': 'database', 'font': 'font',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const fetched = [];
for (const [key, source] of Object.entries(ICONS)) {
  const url = `${BASE}/${source}.svg`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`vendor-catppuccin-icons: ${source}.svg → HTTP ${res.status} (${url})`);
    process.exit(1);
  }
  const svg = await res.text();
  if (!svg.includes('<svg')) {
    console.error(`vendor-catppuccin-icons: ${source}.svg looks invalid`);
    process.exit(1);
  }
  writeFileSync(join(OUT, `${key}.svg`), svg);
  fetched.push(key);
}

// LICENSE des Repos mitziehen (MIT).
const lic = await fetch(`https://raw.githubusercontent.com/catppuccin/vscode-icons/${REF}/LICENSE`);
if (lic.ok) writeFileSync(join(OUT, 'LICENSE'), await lic.text());

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify({ source: 'catppuccin/vscode-icons', flavor: 'css-variables', ref: REF, icons: fetched }, null, 2) + '\n'
);
console.log(`vendor-catppuccin-icons: wrote ${fetched.length} icons (ref ${REF}) to public/vendor/catppuccin-icons/`);
