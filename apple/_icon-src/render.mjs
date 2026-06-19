import sharp from '/opt/homebrew/lib/node_modules/icon-composer-mcp/node_modules/sharp/lib/index.js';
const house = 'M256 128 L412 256 L364 256 L364 408 L148 408 L148 256 L100 256 Z';
const promptG = '<g fill="none" stroke="black" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"><polyline points="192 290 254 332 192 374"/><line x1="276" y1="360" x2="320" y2="360"/></g>';
const glyphSVG = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <mask id="cut"><rect width="512" height="512" fill="black"/><path d="${house}" fill="white"/>${promptG}</mask>
  <rect width="512" height="512" fill="${fill}" mask="url(#cut)"/>
</svg>`;
const CANVAS = 1024, INNER = 760; // ~12.9% padding each side
async function build(fill, out){
  const trimmed = await sharp(Buffer.from(glyphSVG(fill)), { density: 384 }).trim({ threshold: 1 }).png().toBuffer();
  const glyph = await sharp(trimmed).resize(INNER, INNER, { fit: 'inside' }).png().toBuffer();
  const gm = await sharp(glyph).metadata();
  await sharp({ create:{ width:CANVAS, height:CANVAS, channels:4, background:{r:0,g:0,b:0,alpha:0} } })
    .composite([{ input: glyph, left: Math.round((CANVAS-gm.width)/2), top: Math.round((CANVAS-gm.height)/2) }])
    .png().toFile(out);
  const st = await sharp(out).stats();
  console.log(out.split('/').pop(), '->', gm.width+'x'+gm.height, 'glyph; alpha-min='+st.channels[3].min, '(0 = real transparency present)');
}
await build('#179299', '/Users/rocky/Projects/claude-code-hub/apple/Penates/_icon/glyph_teal.png');
await build('#ffffff', '/Users/rocky/Projects/claude-code-hub/apple/Penates/_icon/glyph_white.png');
console.log('done');
