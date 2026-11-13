// Texture coverage / texel density per LOD for tiles in a lon/lat box.
// usage: node texstat.mjs w,s,e,n dir1 [dir2...]
import fs from 'node:fs';
import sharp from 'sharp';
import { leavesInBox, tileFile, readTile, getIO, sha1, cleanGlb } from './lib.mjs';
const [boxS, ...dirs] = process.argv.slice(2); const [bw, bs, be, bn] = boxS.split(',').map(Number); const io = await getIO();
const S = {}; const dims = new Map();
const st = l => (S[l] = S[l] || { feats: 0, tris: 0, area: 0, texArea: 0, dens: [] });
for (const dir of dirs) for (const uri of leavesInBox(dir + '/tileset.json', bw, bs, be, bn)) {
  const f = tileFile(dir, uri); if (!fs.existsSync(f)) continue; let tile; try { tile = readTile(f); } catch (e) { continue; }
  const { feat, idAttr } = tile; const keep = new Uint8Array(Math.max(1, feat.n));
  for (let i = 0; i < feat.n; i++) { const x = feat.x[i], y = feat.y[i]; if (x >= bw && x <= be && y >= bs && y <= bn) { keep[i] = 1; st(feat.lod[i]).feats++; } }
  let doc; try { doc = await io.readBinary(new Uint8Array(cleanGlb(tile.glb))); } catch (e) { console.log('ERR', e.message); continue; }
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), T = prim.getAttribute('TEXCOORD_0'), ID = prim.getAttribute(idAttr), I = prim.getIndices(); if (!P || !ID) continue;
    const pa = P.getArray(), ta = T && T.getArray(), ia = I ? I.getArray() : null, ida = ID.getArray(), tex = prim.getMaterial() && prim.getMaterial().getBaseColorTexture();
    let px = 0; if (tex && ta) { const img = Buffer.from(tex.getImage()), h = sha1(img); if (!dims.has(h)) { const m = await sharp(img).metadata(); dims.set(h, m.width * m.height); } px = dims.get(h); }
    const tc = ia ? ia.length / 3 : P.getCount() / 3;
    for (let t = 0; t < tc; t++) {
      const a = ia ? ia[t * 3] : t * 3, b = ia ? ia[t * 3 + 1] : t * 3 + 1, c = ia ? ia[t * 3 + 2] : t * 3 + 2, fi = Math.round(ida[a]); if (!keep[fi]) continue;
      const s = st(feat.lod[fi]); s.tris++;
      const ux = pa[b * 3] - pa[a * 3], uy = pa[b * 3 + 1] - pa[a * 3 + 1], uz = pa[b * 3 + 2] - pa[a * 3 + 2], vx = pa[c * 3] - pa[a * 3], vy = pa[c * 3 + 1] - pa[a * 3 + 1], vz = pa[c * 3 + 2] - pa[a * 3 + 2];
      const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); s.area += ar;
      if (px) { const uvA = 0.5 * Math.abs((ta[b * 2] - ta[a * 2]) * (ta[c * 2 + 1] - ta[a * 2 + 1]) - (ta[c * 2] - ta[a * 2]) * (ta[b * 2 + 1] - ta[a * 2 + 1])); if (uvA > 1e-9 && ar > 0.01) { s.texArea += ar; s.dens.push([Math.sqrt(uvA * px / ar), ar]); } }
    }
  }
}
for (const l of Object.keys(S).sort()) {
  const s = S[l]; s.dens.sort((a, b) => a[0] - b[0]); let acc = 0, med = 0, p90 = 0; const tot = s.dens.reduce((q, d) => q + d[1], 0);
  for (const d of s.dens) { acc += d[1]; if (!med && acc >= tot * 0.5) med = d[0]; if (!p90 && acc >= tot * 0.9) p90 = d[0]; }
  console.log(`LOD${l}: feats=${s.feats} tris=${s.tris} area=${Math.round(s.area)}m2 textured=${(100 * s.texArea / Math.max(1, s.area)).toFixed(0)}% texel density median=${med.toFixed(1)} p90=${p90.toFixed(1)} px/m`);
}
