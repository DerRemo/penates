import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconKey } from './file-icons.js';

test('directories resolve to the folder key', () => {
  assert.equal(iconKey('src', true), '_folder');
  assert.equal(iconKey('node_modules', true), '_folder');
});

test('known extensions map to their icon key', () => {
  assert.equal(iconKey('app.js', false), 'javascript');
  assert.equal(iconKey('main.ts', false), 'typescript');
  assert.equal(iconKey('Component.tsx', false), 'react_ts');
  assert.equal(iconKey('data.json', false), 'json');
  assert.equal(iconKey('README.md', false), 'markdown');
  assert.equal(iconKey('index.html', false), 'html');
  assert.equal(iconKey('styles.css', false), 'css');
  assert.equal(iconKey('script.py', false), 'python');
  assert.equal(iconKey('main.rs', false), 'rust');
  assert.equal(iconKey('server.go', false), 'go');
  assert.equal(iconKey('setup.sh', false), 'shell');
  assert.equal(iconKey('config.yml', false), 'yaml');
  assert.equal(iconKey('Cargo.toml', false), 'toml');
  assert.equal(iconKey('photo.png', false), 'image');
  assert.equal(iconKey('logo.svg', false), 'svg');
  assert.equal(iconKey('manual.pdf', false), 'pdf');
});

test('special filenames win over extension', () => {
  assert.equal(iconKey('package.json', false), 'npm');
  assert.equal(iconKey('package-lock.json', false), 'lock');
  assert.equal(iconKey('.gitignore', false), 'git');
  assert.equal(iconKey('Dockerfile', false), 'docker');
  assert.equal(iconKey('yarn.lock', false), 'lock');
});

test('unknown extensions fall back to the generic file key', () => {
  assert.equal(iconKey('mystery.qwerty', false), '_file');
  assert.equal(iconKey('noext', false), '_file');
});

test('fileIcon returns key + svg-url markup', () => {
  // Lazy import to keep the pure map test independent.
  return import('./file-icons.js').then(({ fileIcon }) => {
    const r = fileIcon('app.js', false);
    assert.equal(r.key, 'javascript');
    assert.match(r.src, /catppuccin-icons\/javascript\.svg$/);
  });
});

test('fileIconSvg returns inline <svg> markup for the resolved key', () => {
  return import('./file-icons.js').then(({ fileIconSvg }) => {
    const js = fileIconSvg('app.js', false);
    // Must be inline SVG markup (so var(--vscode-ctp-*) resolves on the host page).
    assert.ok(js.startsWith('<svg'), 'should return inline <svg> markup');
    // The JS icon tints via the yellow css-variable — proves the var() refs survived.
    assert.match(js, /var\(--vscode-ctp-yellow\)/);

    // Folders resolve to the folder svg.
    const dir = fileIconSvg('src', true);
    assert.ok(dir.startsWith('<svg'));
    assert.deepEqual(dir, fileIconSvg('node_modules', true), 'all dirs share the folder svg');

    // Unknown extension falls back to the generic _file svg.
    const unknown = fileIconSvg('mystery.qwerty', false);
    assert.ok(unknown.startsWith('<svg'));
    assert.deepEqual(unknown, fileIconSvg('noext', false), 'unknown ext → _file svg');

    // Distinct file types resolve to distinct markup (not all the fallback).
    const ts = fileIconSvg('main.ts', false);
    assert.notDeepEqual(js, ts, 'js and ts should render different svgs');
    assert.notDeepEqual(js, unknown, 'known type should not equal the _file fallback');
  });
});

test('fileIconSvg markup matches the vendored ICON_SVG data for the key', () => {
  return Promise.all([
    import('./file-icons.js'),
    import('./catppuccin-icons-data.js'),
  ]).then(([{ fileIconSvg, iconKey }, { ICON_SVG }]) => {
    assert.equal(fileIconSvg('main.ts', false), ICON_SVG[iconKey('main.ts', false)]);
    assert.equal(fileIconSvg('x', true), ICON_SVG['_folder']);
  });
});
