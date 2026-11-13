// Stage 1: read PLATEAU 3D Tiles, transform to the local frame, cache per layer.
import fs from 'node:fs';
import { leavesInBox, tileFile, readTile, getIO, sha1, cleanGlb } from './lib.mjs';
import { DL, CACHE, CORE, CTX, CORE_L, CTX_L, enu, saveLayer } from './cfg.mjs';

const io = await getIO();
fs.mkdirSync(CACHE + '/img', { recursive: true });
const tmp = [0, 0, 0];

async function extract(name, dirs, llBox, lBox, featFilter) {
  const feats = [], groups = new Map(); let nTiles = 0;
  for (const dir of dirs) for (const uri of leavesInBox(`${DL}/${dir}/tileset.json`, llBox.w, llBox.s, llBox.e, llBox.n)) {
    const f = tileFile(`${DL}/${dir}`, uri); if (!fs.existsSync(f)) continue;
    let tile; try { tile = readTile(f); } catch (e) { console.log('ERR read', f, e.message); continue; }
    const { feat, rtc, idAttr } = tile; nTiles++;
    const base = feats.length, bt = feat.bt || {};
    for (let i = 0; i < Math.max(1, feat.n); i++) {
      let a = (bt.attributes && bt.attributes[i]) || (feat.attrs && feat.attrs[i]) || {}; if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { a = {}; } }
      feats.push({ src: dir.slice(0, 5), lod: feat.lod && feat.lod.length ? feat.lod[i] : 0, func: a['frn:function'] || a['tran:function'] || a['brid:function'] || a['veg:class'] || a['bldg:usage'] || null, cls: a['frn:class'] || a['bldg:class'] || null, name: a['gml:name'] || null, h: a['bldg:measuredHeight'] || null, st: a['bldg:storeysAboveGround'] || null, id: a['gml:id'] || null, bb: [1e9, 1e9, 1e9, -1e9, -1e9, -1e9], nt: 0 });
    }
    let doc; try { doc = await io.readBinary(new Uint8Array(cleanGlb(tile.glb))); } catch (e) { console.log('ERR glb', f, e.message); continue; }
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0'), ID = prim.getAttribute(idAttr), I = prim.getIndices(); if (!P) continue;
        const pa = P.getArray(), na = N && N.getArray(), ta = T && T.getArray(), ia = I ? I.getArray() : null, ida = ID && ID.getArray(), vc = P.getCount();
        const mat = prim.getMaterial(), tex = mat && mat.getBaseColorTexture(); let key, init;
        const cf = mat ? mat.getBaseColorFactor() : [0.8, 0.8, 0.8, 1];
        if (tex && ta) { const img = Buffer.from(tex.getImage()), h = sha1(img); const p = `${CACHE}/img/${h}`; if (!fs.existsSync(p)) fs.writeFileSync(p, img); key = 't:' + h; init = { img: h }; }
        else { key = 'c:' + cf.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); init = { color: cf.slice(0, 3) }; }
        let g = groups.get(key); if (!g) { g = { key, pos: [], nor: [], uv: [], idx: [], fid: [], n: 0, ...init }; groups.set(key, g); }
        const map = new Int32Array(vc).fill(-1);
        const addV = v => {
          if (map[v] >= 0) return map[v];
          const x = pa[v * 3], y = pa[v * 3 + 1], z = pa[v * 3 + 2];
          const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
          let X = wx, Y = -wz, Z = wy; if (rtc) { X += rtc[0]; Y += rtc[1]; Z += rtc[2]; }
          enu.pt(X, Y, Z, tmp, 0); g.pos.push(tmp[0], tmp[1], tmp[2]);
          const fi = base + (ida ? Math.round(ida[v]) : 0), bb = feats[fi].bb;
          if (tmp[0] < bb[0]) bb[0] = tmp[0]; if (tmp[1] < bb[1]) bb[1] = tmp[1]; if (tmp[2] < bb[2]) bb[2] = tmp[2]; if (tmp[0] > bb[3]) bb[3] = tmp[0]; if (tmp[1] > bb[4]) bb[4] = tmp[1]; if (tmp[2] > bb[5]) bb[5] = tmp[2];
          if (na) { const nx = na[v * 3], ny = na[v * 3 + 1], nz = na[v * 3 + 2]; const ax = M[0] * nx + M[4] * ny + M[8] * nz, ay = M[1] * nx + M[5] * ny + M[9] * nz, az = M[2] * nx + M[6] * ny + M[10] * nz; enu.vec(ax, -az, ay, tmp, 0); const l = Math.hypot(tmp[0], tmp[1], tmp[2]) || 1; g.nor.push(tmp[0] / l, tmp[1] / l, tmp[2] / l); } else g.nor.push(0, 0, 0);
          if (ta) g.uv.push(ta[v * 2], ta[v * 2 + 1]); else g.uv.push(0, 0);
          g.fid.push(fi); return (map[v] = g.n++);
        };
        const tc = ia ? ia.length / 3 : vc / 3;
        for (let t = 0; t < tc; t++) { const a = addV(ia ? ia[t * 3] : t * 3), b = addV(ia ? ia[t * 3 + 1] : t * 3 + 1), c = addV(ia ? ia[t * 3 + 2] : t * 3 + 2); g.idx.push(a, b, c); feats[g.fid[a]].nt++; }
      }
    }
  }
  // filter features by local box (centre) + custom filter, then compact
  const keep = feats.map(f => f.nt > 0 && (f.bb[0] + f.bb[3]) / 2 >= lBox.x0 && (f.bb[0] + f.bb[3]) / 2 <= lBox.x1 && (f.bb[2] + f.bb[5]) / 2 >= lBox.z0 && (f.bb[2] + f.bb[5]) / 2 <= lBox.z1 && (!featFilter || featFilter(f)));
  const remap = new Int32Array(feats.length).fill(-1), outF = []; feats.forEach((f, i) => { if (keep[i]) { remap[i] = outF.length; f.bb = f.bb.map(v => +v.toFixed(2)); delete f.nt; outF.push(f); } });
  const outG = []; let tris = 0;
  for (const g of groups.values()) {
    const vmap = new Int32Array(g.n).fill(-1), pos = [], nor = [], uv = [], fid = [], idx = [];
    const av = v => { if (vmap[v] >= 0) return vmap[v]; pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); nor.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); uv.push(g.uv[v * 2], g.uv[v * 2 + 1]); fid.push(remap[g.fid[v]]); return (vmap[v] = fid.length - 1); };
    for (let t = 0; t < g.idx.length; t += 3) { if (remap[g.fid[g.idx[t]]] < 0) continue; idx.push(av(g.idx[t]), av(g.idx[t + 1]), av(g.idx[t + 2])); }
    if (!idx.length) continue; tris += idx.length / 3;
    outG.push({ key: g.key, img: g.img, color: g.color, pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint32Array(idx), fid: new Uint32Array(fid) });
  }
  saveLayer(name, outF, outG);
  const lodc = {}; outF.forEach(f => lodc[f.lod] = (lodc[f.lod] || 0) + 1);
  console.log(`${name}: tiles=${nTiles} feats=${outF.length} lod=${JSON.stringify(lodc)} groups=${outG.length} tris=${tris} imgs=${outG.filter(g => g.img).length}`);
}

const B = ['26104_bldg_lod3', '26105_bldg_lod3', '26106_bldg_lod3'];
const which = process.argv[2] || 'all';
if (which === 'all' || which === 'bldg') {
  await extract('bldg3', B, CORE, CORE_L, f => f.lod >= 3);
  await extract('bldg2', B, CORE, CORE_L, f => f.lod < 3);
  await extract('bldgctx', B, CTX, CTX_L, f => { const cx = (f.bb[0] + f.bb[3]) / 2, cz = (f.bb[2] + f.bb[5]) / 2; return !(cx >= CORE_L.x0 && cx <= CORE_L.x1 && cz >= CORE_L.z0 && cz <= CORE_L.z1); });
}
if (which === 'all' || which === 'misc') {
  await extract('frn', ['26100_frn_lod3'], CORE, CORE_L);
  await extract('tran', ['26100_tran_lod3'], CORE, CORE_L);
  await extract('brid', ['26100_brid_lod3'], CORE, CORE_L);
  await extract('vegs', ['26100_veg_SolitaryVegetationObject_lod3'], CORE, CORE_L);
  await extract('vegp', ['26100_veg_PlantCover_lod3'], CORE, CORE_L);
}
console.log('CORE_L', CORE_L, 'CTX_L', CTX_L);
