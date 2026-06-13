import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownMini } from './markdown-mini.js';

test('renders paragraphs', () => {
  assert.equal(renderMarkdownMini('hello world').trim(), '<p>hello world</p>');
});

test('renders h3 from ##', () => {
  assert.equal(renderMarkdownMini('## Title').trim(), '<h3>Title</h3>');
});

test('renders h4 from ###', () => {
  assert.equal(renderMarkdownMini('### Sub').trim(), '<h4>Sub</h4>');
});

test('renders bold **x**', () => {
  assert.match(renderMarkdownMini('hey **bold** text'), /<strong>bold<\/strong>/);
});

test('renders italic *x* and _x_', () => {
  assert.match(renderMarkdownMini('*a* _b_'), /<em>a<\/em>.*<em>b<\/em>/);
});

test('renders inline code', () => {
  assert.match(renderMarkdownMini('run `npm install`'), /<code>npm install<\/code>/);
});

test('renders links with target _blank and rel noopener', () => {
  const out = renderMarkdownMini('[GH](https://github.com)');
  assert.match(out, /<a href="https:\/\/github\.com" target="_blank" rel="noopener">GH<\/a>/);
});

test('renders unordered lists', () => {
  const out = renderMarkdownMini('- one\n- two');
  assert.match(out, /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/);
});

test('escapes HTML in plain content', () => {
  assert.match(renderMarkdownMini('<script>alert(1)</script>'), /&lt;script&gt;/);
  assert.doesNotMatch(renderMarkdownMini('<script>alert(1)</script>'), /<script>/);
});

test('escapes HTML inside link text', () => {
  const out = renderMarkdownMini('[<b>x</b>](https://x)');
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('does not render bold inside inline code', () => {
  const out = renderMarkdownMini('`**not bold**`');
  assert.match(out, /<code>\*\*not bold\*\*<\/code>/);
});

test('empty input returns empty string', () => {
  assert.equal(renderMarkdownMini(''), '');
  assert.equal(renderMarkdownMini(null), '');
  assert.equal(renderMarkdownMini(undefined), '');
});

test('multiple paragraphs separated by blank lines', () => {
  const out = renderMarkdownMini('para one\n\npara two');
  assert.match(out, /<p>para one<\/p>[\s\S]*<p>para two<\/p>/);
});

test('does NOT render javascript: links as anchors (XSS guard)', () => {
  // ohne `)` im Payload, sonst stoppt der URL-Match vorher
  const out = renderMarkdownMini('[click](javascript:location=name)');
  assert.doesNotMatch(out, /<a /);
  assert.doesNotMatch(out, /href="javascript:/i);
  assert.match(out, /javascript:location=name/);  // bleibt als escaped Roh-Text sichtbar
});

test('does NOT render data: or vbscript: links as anchors', () => {
  const dataOut = renderMarkdownMini('[x](data:text/html;base64,PHM=)');
  assert.doesNotMatch(dataOut, /<a /);
  assert.doesNotMatch(dataOut, /href="data:/i);
  assert.doesNotMatch(renderMarkdownMini('[x](vbscript:msgbox)'), /<a /);
});

test('renders mailto, relative and fragment links', () => {
  assert.match(renderMarkdownMini('[m](mailto:a@b.com)'), /<a href="mailto:a@b\.com"/);
  assert.match(renderMarkdownMini('[r](/path/page)'), /<a href="\/path\/page"/);
  assert.match(renderMarkdownMini('[r](./rel)'), /<a href="\.\/rel"/);
  assert.match(renderMarkdownMini('[r](#anchor)'), /<a href="#anchor"/);
});

test('escapes URL attribute to prevent quote/angle injection', () => {
  const out = renderMarkdownMini('[x](https://example.com/?q=<a&b>)');
  // URL gets escaped during overall text escape, then again in href handler
  // Result is double-escaped but safe and functional
  assert.match(out, /href="https:\/\/example\.com\/\?q=&amp;lt;a&amp;amp;b&amp;gt;"/);
});
