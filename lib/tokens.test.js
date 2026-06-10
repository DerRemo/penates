import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

// Tokens die zur Laufzeit per JS gesetzt werden (Resizer-Breiten, iOS-Keyboard-
// Inset) bzw. ausschliesslich mit Fallback referenziert werden — die haben
// bewusst keine :root-Definition.
const RUNTIME_TOKENS = new Set([
  '--files-width',    // JS: FileBrowser-Resizer
  '--preview-width',  // JS: Preview-Panel-Resizer
  '--diff-width',     // JS: Diff-View-Resizer (legacy CSS)
  '--repo-width',     // JS: Repo-Panel-Resizer
  '--kb-inset',       // JS: iOS-Keyboard-Inset
  '--danger',         // nur mit Fallback var(--danger, #e44) genutzt
]);

test('jede referenzierte CSS-Custom-Property ist definiert (oder Laufzeit-Token)', () => {
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const referenced = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
  const missing = [...referenced].filter(t => !defined.has(t) && !RUNTIME_TOKENS.has(t));
  assert.deepStrictEqual(missing, [], `Undefinierte Tokens: ${missing.join(', ')}`);
});

test('Redesign-Foundation-Tokens existieren', () => {
  const required = [
    '--font-display', '--font-ui', '--font-mono',
    '--accent', '--accent-soft', '--accent-hover', '--accent-contrast',
    '--work-soft', '--wait-soft', '--idle-soft',
    '--status-working', '--status-waiting', '--status-idle',
    '--ease-out', '--ease-in-out', '--ease-drawer', '--dur', '--focus-ring',
    '--radius-md', '--radius-pill',
  ];
  for (const t of required) {
    assert.ok(new RegExp(`${t}\\s*:`).test(css), `${t} fehlt`);
  }
});

test('alle 4 Catppuccin-Flavors sind als data-theme-Block vorhanden', () => {
  for (const f of ['latte', 'frappe', 'macchiato', 'mocha']) {
    assert.ok(css.includes(`data-theme="${f}"`), `Flavor ${f} fehlt`);
  }
});

test('Bricolage Grotesque ist Display-Font, Space Grotesk ist weg', () => {
  assert.ok(/--font-display:\s*'Bricolage Grotesque'/.test(css), 'Bricolage nicht als --font-display');
  assert.ok(!/Space Grotesk/.test(css), 'Space Grotesk noch vorhanden');
  assert.ok(!/DM Sans/.test(css), 'DM Sans noch vorhanden');
});
