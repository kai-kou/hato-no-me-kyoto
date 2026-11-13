import fs from 'node:fs';
import { leavesInBox, tileFile, readTile, getIO, cleanGlb } from './lib.mjs';
const dir = process.argv[2], io = await getIO(); const S = {}; let sample = null;
for (const uri of leavesInBox(dir + '/tileset.json', -180, -90, 180, 90)) {
  const f = tileFile(dir, uri); if (!fs.existsSync(f)) continue; const t = readTile(f); const bt = t.feat.bt || {}; const at = bt.attributes || t.feat.attrs || [];
  const key = i => { let a = at[i]; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } } a = a || {}; if (!sample && Object.keys(a).length > 4) sample = a; return (a['frn:function'] || a['tran:function'] || a['veg:class'] || a['brid:function'] || a['feature_type'] || '?') + '/' + (a['frn:class'] || a['tran:class'] || a['veg:species'] || a['gml:name'] || ''); };
  const doc = await io.readBinary(new Uint8Array(cleanGlb(t.glb)));
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const ID = prim.getAttribute(t.idAttr), I = prim.getIndices(), P = prim.getAttribute('POSITION'); if (!ID) continue; const ida = ID.getArray(), ia = I ? I.getArray() : null; const tex = !!(prim.getMaterial() && prim.getMaterial().getBaseColorTexture());
    const tc = ia ? ia.length / 3 : P.getCount() / 3; const seen = new Set();
    for (let k = 0; k < tc; k++) { const fi = Math.round(ida[ia ? ia[k * 3] : k * 3]); const kk = key(fi); const s = (S[kk] = S[kk] || { n: 0, tris: 0, tex: 0 }); s.tris++; if (tex) s.tex++; if (!seen.has(fi)) { seen.add(fi); s.n++; } }
  }
}
for (const [k, v] of Object.entries(S).sort((a, b) => b[1].tris - a[1].tris)) console.log(k, JSON.stringify(v));
console.log('SAMPLE', JSON.stringify(sample).slice(0, 900));
