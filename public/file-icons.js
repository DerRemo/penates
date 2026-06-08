// Einzige Quelle für Datei-/Ordner-Icons (Catppuccin css-variables, vendored
// unter public/vendor/catppuccin-icons/). Browser-import (FileBrowser, Dir-
// Picker, FilePreview, Diff) UND node:test nutzen dieselbe Datei (wie clis.js).
// Reines Daten-/Funktionsmodul, kein DOM. Unbekanntes → _file, Ordner → _folder.
//
// WICHTIG: Render-Stellen injizieren das Icon als INLINE-<svg> (fileIconSvg),
// NICHT als <img src>. Ein über <img> geladenes SVG rendert in isoliertem
// Kontext und kann var(--vscode-ctp-*) der Host-Seite nicht auflösen → die
// Icons bleiben unsichtbar. Inline im DOM löst die CSS-Variablen auf und
// retintet pro Hub-Flavor. iconKey/iconSrc bleiben für Back-Compat erhalten.
import { ICON_SVG } from './catppuccin-icons-data.js';

// Spezialnamen schlagen die Extension (exakter Dateiname, lowercase-Vergleich).
const BY_NAME = {
  'package.json': 'npm',
  'package-lock.json': 'lock',
  'yarn.lock': 'lock',
  'pnpm-lock.yaml': 'lock',
  'cargo.lock': 'lock',
  'dockerfile': 'docker',
  '.dockerignore': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
};

// Extension → Icon-Key. Nur Keys, die als SVG vendored sind (siehe
// scripts/vendor-catppuccin-icons.mjs ICONS-Liste); alles andere → _file.
const BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript',
  jsx: 'react', tsx: 'react_ts',
  json: 'json',
  md: 'markdown', markdown: 'markdown',
  html: 'html', htm: 'html',
  css: 'css', scss: 'sass', sass: 'sass',
  py: 'python',
  rs: 'rust',
  go: 'go',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yml: 'yaml', yaml: 'yaml',
  toml: 'toml',
  lock: 'lock',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', ico: 'image', bmp: 'image',
  svg: 'svg',
  pdf: 'pdf',
  txt: 'document', log: 'document',
  vue: 'vue',
  db: 'database', sqlite: 'database', sql: 'database',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};

// Liefert den Icon-Key (Dateiname ohne .svg). Ordner → _folder.
export function iconKey(name, isDir) {
  if (isDir) return '_folder';
  const lower = String(name || '').toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const ext = lower.includes('.') ? lower.split('.').pop() : '';
  return BY_EXT[ext] || '_file';
}

// Pfad zum vendored SVG, relativ zur SPA-Wurzel (public/ ist der Webroot).
export function iconSrc(key) {
  return `vendor/catppuccin-icons/${key}.svg`;
}

// Browser-Helper: { key, src } für eine Datei/Ordner. Legacy — Render-Stellen
// nutzen jetzt fileIconSvg (inline). Bleibt für etwaige Alt-Aufrufer erhalten.
export function fileIcon(name, isDir) {
  const key = iconKey(name, isDir);
  return { key, src: iconSrc(key) };
}

// Liefert das inline-<svg>-Markup für die aufgelöste Datei/Ordner. Inline statt
// <img src> → var(--vscode-ctp-*) der Host-Seite löst auf und retintet pro
// Flavor. Quelle: vendored Catppuccin-SVGs (vertrauenswürdig, kein <script>/
// Event-Handler — die Vendor-Pipeline garantiert das). Fallback _file, falls
// ein Key wider Erwarten fehlt.
export function fileIconSvg(name, isDir) {
  const key = iconKey(name, isDir);
  return ICON_SVG[key] || ICON_SVG['_file'] || '';
}
