// Turns a TrueType/OpenType font into the outline file the editors use to print text a menu's own
// embedded fonts can't (Capiche's personalised message: see `PFONT` in public/capiche/engine.js).
//
//   npm i --no-save opentype.js
//   node dev/font-outlines.mjs <font.ttf> <out.json> ["Font name"] ["licence note"]
//
// Each glyph becomes PDF path operators in font units (y up), so the engine can draw any of these
// characters as plain filled shapes. No font object goes into the PDF, so nothing depends on which
// letters a subset kept, and taking the text out again leaves the export exactly as it was.
// Only the characters the editors offer are kept: capitals (the menus print in capitals), Latin-1
// accented capitals, digits and common punctuation.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const opentype = require('opentype.js');

const [src, out, name = '', licence = ''] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node dev/font-outlines.mjs <font.ttf> <out.json> ["Font name"] ["licence note"]'); process.exit(1); }
const font = opentype.loadSync(src);
const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ0123456789!"#&\'()*+,-./:;=?@’“”';

const r = (v) => Math.round(v);
function pathOps(cmds) {
  const ops = [];
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.type === 'M') { ops.push(r(c.x), r(c.y), 'm'); cx = c.x; cy = c.y; }
    else if (c.type === 'L') { ops.push(r(c.x), r(c.y), 'l'); cx = c.x; cy = c.y; }
    else if (c.type === 'C') { ops.push(r(c.x1), r(c.y1), r(c.x2), r(c.y2), r(c.x), r(c.y), 'c'); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') {   // a quadratic curve as the equivalent cubic
      const x1 = cx + (2 / 3) * (c.x1 - cx), y1 = cy + (2 / 3) * (c.y1 - cy);
      const x2 = c.x + (2 / 3) * (c.x1 - c.x), y2 = c.y + (2 / 3) * (c.y1 - c.y);
      ops.push(r(x1), r(y1), r(x2), r(y2), r(c.x), r(c.y), 'c'); cx = c.x; cy = c.y;
    } else if (c.type === 'Z') ops.push('h');
  }
  return ops.join(' ');
}

const glyphs = {}, missing = [];
for (const ch of CHARS) {
  const g = font.charToGlyph(ch);
  if (!g || g.index === 0) { missing.push(ch); continue; }
  glyphs[ch] = { w: g.advanceWidth, d: pathOps(g.path.commands) };
}
const kern = {};
const have = Object.keys(glyphs);
for (const a of have) for (const b of have) {
  const k = font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b));
  if (k) kern[a + b] = k;
}
const os2 = font.tables.os2 || {};
const json = {
  name: name || font.names.fullName?.en || '',
  licence,
  unitsPerEm: font.unitsPerEm,
  capHeight: os2.sCapHeight || Math.round(font.unitsPerEm * 0.7),
  descent: font.descender,
  glyphs,
  kern,
};
fs.writeFileSync(out, JSON.stringify(json));
console.log(`${out}: ${have.length} glyphs, ${Object.keys(kern).length} kerning pairs, ${fs.statSync(out).size} bytes` + (missing.length ? `; not in the font: ${missing.join(' ')}` : ''));
