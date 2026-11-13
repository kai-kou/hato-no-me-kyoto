import fs from 'node:fs';
import sharp from 'sharp';
import { leavesInBox, tileFile, readTile, getIO, cleanGlb, sha1 } from './lib.mjs';
const io = await getIO(); const C = {}; const seen = new Set(); let alphaImgs = 0, imgs = 0; const cols = {};
for (const dir of process.argv.slice(2)) for (const uri of leavesInBox(dir + '/tileset.json', 135.7700, 35.0036, 135.7756, 35.0072)) {
  const f = tileFile(dir, uri); if (!fs.existsSync(f)) continue; const t = readTile(f); const doc = await io.readBinary(new Uint8Array(cleanGlb(t.glb)));
  for (const m of doc.getRoot().listMaterials()) { const k = m.getAlphaMode() + (m.getDoubleSided() ? '/2s' : '/1s'); C[k] = (C[k] || 0) + 1; const tex = m.getBaseColorTexture(); if (!tex) { const c = m.getBaseColorFactor().map(v => v.toFixed(2)).join(','); cols[c] = (cols[c] || 0) + 1; } else { const img = Buffer.from(tex.getImage()), h = sha1(img); if (!seen.has(h)) { seen.add(h); imgs++; const md = await sharp(img).metadata(); if (md.hasAlpha) { const st = await sharp(img).stats(); if (st.channels[3] && st.channels[3].min < 250) alphaImgs++; } } } }
}
console.log('alpha modes', C, 'images', imgs, 'with real alpha', alphaImgs, 'plain colors', Object.entries(cols).sort((a, b) => b[1] - a[1]).slice(0, 12));
