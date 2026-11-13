// Inventory of texture atlases used by features (min LOD) in a lon/lat box
// usage: MINLOD=3 node atlasinv.mjs w,s,e,n dir1 [dir2...]
import fs from 'node:fs';
import sharp from 'sharp';
import { leavesInBox, tileFile, readTile, getIO, sha1, cleanGlb } from './lib.mjs';
const MINLOD = +(process.env.MINLOD || 0);
const [boxS, ...dirs] = process.argv.slice(2); const [bw, bs, be, bn] = boxS.split(',').map(Number); const io = await getIO();
const A = new Map();
for (const dir of dirs) for (const uri of leavesInBox(dir + '/tileset.json', bw, bs, be, bn)) {
  const f = tileFile(dir, uri); if (!fs.existsSync(f)) continue; let tile; try { tile = readTile(f); } catch (e) { continue; }
  const { feat, idAttr } = tile; const keep = new Uint8Array(Math.max(1, feat.n));
  for (let i = 0; i < feat.n; i++) { const x = feat.x[i], y = feat.y[i]; if (x >= bw && x <= be && y >= bs && y <= bn && feat.lod[i] >= MINLOD) keep[i] = 1; }
  if (!keep.some(v => v)) continue;
  const doc = await io.readBinary(new Uint8Array(cleanGlb(tile.glb)));
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), T = prim.getAttribute('TEXCOORD_0'), ID = prim.getAttribute(idAttr), I = prim.getIndices(); if (!P || !ID) continue;
    const pa = P.getArray(), ta = T && T.getArray(), ia = I ? I.getArray() : null, ida = ID.getArray(), tex = prim.getMaterial() && prim.getMaterial().getBaseColorTexture(); if (!tex || !ta) continue;
    const img = Buffer.from(tex.getImage()), h = sha1(img); let a = A.get(h);
    if (!a) { const m = await sharp(img).metadata(); a = { h, w: m.width, hgt: m.height, fmt: m.format, bytes: img.length, feats: new Set(), tiles: new Set(), area: 0, uvA: 0, tris: 0, roofA: 0, upA: 0 }; A.set(h, a); }
    a.tiles.add(uri); const tc = ia ? ia.length / 3 : P.getCount() / 3;
    for (let t = 0; t < tc; t++) {
      const i0 = ia ? ia[t * 3] : t * 3, i1 = ia ? ia[t * 3 + 1] : t * 3 + 1, i2 = ia ? ia[t * 3 + 2] : t * 3 + 2, fi = Math.round(ida[i0]); if (!keep[fi]) continue;
      a.feats.add(uri + ':' + fi); a.tris++;
      const ux = pa[i1 * 3] - pa[i0 * 3], uy = pa[i1 * 3 + 1] - pa[i0 * 3 + 1], uz = pa[i1 * 3 + 2] - pa[i0 * 3 + 2], vx = pa[i2 * 3] - pa[i0 * 3], vy = pa[i2 * 3 + 1] - pa[i0 * 3 + 1], vz = pa[i2 * 3 + 2] - pa[i0 * 3 + 2];
      a.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      a.uvA += 0.5 * Math.abs((ta[i1 * 2] - ta[i0 * 2]) * (ta[i2 * 2 + 1] - ta[i0 * 2 + 1]) - (ta[i2 * 2] - ta[i0 * 2]) * (ta[i1 * 2 + 1] - ta[i0 * 2 + 1]));
    }
  }
}
const L = [...A.values()].filter(a => a.tris).sort((a, b) => b.w * b.hgt - a.w * a.hgt); let mp = 0, by = 0;
for (const a of L) { mp += a.w * a.hgt; by += a.bytes; }
console.log('atlases', L.length, 'MPix', (mp / 1e6).toFixed(0), 'MB', (by / 1e6).toFixed(1));
const dimC = {}; for (const a of L) { const k = a.w + 'x' + a.hgt + ' ' + a.fmt; dimC[k] = (dimC[k] || 0) + 1; } console.log(dimC);
for (const a of L.slice(0, +(process.env.TOP || 12))) console.log(a.h.slice(0, 8), a.w + 'x' + a.hgt, a.fmt, (a.bytes / 1e6).toFixed(2) + 'MB', 'feats', a.feats.size, 'tiles', a.tiles.size, 'tris', a.tris, 'area', Math.round(a.area), 'uvCover', (a.uvA * 100).toFixed(0) + '%', 'px/m', Math.sqrt(a.uvA * a.w * a.hgt / Math.max(1, a.area)).toFixed(0));
