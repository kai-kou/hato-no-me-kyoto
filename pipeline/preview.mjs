// Build a quick preview GLB (local ENU coords) from PLATEAU tiles inside a lon/lat box.
// usage: node preview.mjs out.glb lat0,lon0,h0 w,s,e,n maxTex dir1 [dir2 ...]
import fs from 'node:fs';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { EXTTextureWebP } from '@gltf-transform/extensions';
import { makeEnu, leavesInBox, tileFile, readTile, getIO, sha1, cleanGlb } from './lib.mjs';

const [out, originS, boxS, maxTexS, ...dirs] = process.argv.slice(2);
const MINLOD = +(process.env.MINLOD || 0);
const [lat0, lon0, h0] = originS.split(',').map(Number), [bw, bs, be, bn] = boxS.split(',').map(Number), maxTex = +maxTexS;
const enu = makeEnu(lat0, lon0, h0), io = await getIO();
const groups = new Map(); // key -> {pos:[],nor:[],uv:[],idx:[],img:Buffer|null,color:[r,g,b],n:0}
const stats = { tiles: 0, tris: 0, feats: 0, lod: {}, uvOut: 0, imgs: 0, imgBytes: 0 };
const images = new Map();
function grp(key, init) { let g = groups.get(key); if (!g) { g = { pos: [], nor: [], uv: [], idx: [], n: 0, ...init }; groups.set(key, g); } return g; }
const tmp = [0, 0, 0];
for (const dir of dirs) {
  const leaves = leavesInBox(dir + '/tileset.json', bw, bs, be, bn);
  for (const uri of leaves) {
    const f = tileFile(dir, uri); if (!fs.existsSync(f)) { console.log('missing', f); continue; }
    let tile; try { tile = readTile(f); } catch (e) { console.log('ERR read', f, e.message); continue; }
    const { feat, rtc, idAttr } = tile; stats.tiles++;
    const keep = new Uint8Array(Math.max(1, feat.n)).fill(1);
    const hasXY = feat.x && Array.prototype.some.call(feat.x, v => v !== 0);
    for (let i = 0; i < feat.n; i++) { const x = hasXY ? feat.x[i] : NaN, y = hasXY ? feat.y[i] : NaN; if ((x === x && (x < bw || x > be || y < bs || y > bn)) || feat.lod[i] < MINLOD) keep[i] = 0; else { stats.feats++; stats.lod[feat.lod[i]] = (stats.lod[feat.lod[i]] || 0) + 1; } }
    let doc; try { doc = await io.readBinary(new Uint8Array(cleanGlb(tile.glb))); } catch (e) { console.log('ERR glb', f, e.message); continue; }
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0'), ID = prim.getAttribute(idAttr), I = prim.getIndices();
        if (!P) continue; const pa = P.getArray(), na = N && N.getArray(), ta = T && T.getArray(), ia = I ? I.getArray() : null, ida = ID && ID.getArray(), vc = P.getCount();
        const mat = prim.getMaterial(); let key = 'c:cccccc', init = { color: [0.8, 0.8, 0.8] };
        const tex = mat && mat.getBaseColorTexture();
        if (tex && ta) {
          const img = Buffer.from(tex.getImage()); const h = sha1(img); key = 't:' + h;
          if (!images.has(h)) { images.set(h, img); stats.imgs++; stats.imgBytes += img.length; } init = { img: h };
        } else if (mat) { const c = mat.getBaseColorFactor(); key = 'c:' + c.slice(0, 3).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); init = { color: c.slice(0, 3) }; }
        const g = grp(key, init), base = g.n, map = new Int32Array(vc).fill(-1);
        const addV = v => {
          if (map[v] >= 0) return map[v];
          const x = pa[v * 3], y = pa[v * 3 + 1], z = pa[v * 3 + 2];
          // world (y-up) then ECEF
          const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
          let X = wx, Y = -wz, Z = wy; if (rtc) { X += rtc[0]; Y += rtc[1]; Z += rtc[2]; }
          enu.pt(X, Y, Z, tmp, 0); g.pos.push(tmp[0], tmp[1], tmp[2]);
          if (na) { const nx = na[v * 3], ny = na[v * 3 + 1], nz = na[v * 3 + 2]; const ax = M[0] * nx + M[4] * ny + M[8] * nz, ay = M[1] * nx + M[5] * ny + M[9] * nz, az = M[2] * nx + M[6] * ny + M[10] * nz; enu.vec(ax, -az, ay, tmp, 0); g.nor.push(tmp[0], tmp[1], tmp[2]); } else g.nor.push(0, 1, 0);
          if (ta) { const u = ta[v * 2], w = ta[v * 2 + 1]; if (u < -0.01 || u > 1.01 || w < -0.01 || w > 1.01) stats.uvOut++; g.uv.push(u, w); } else g.uv.push(0, 0);
          return (map[v] = g.n++);
        };
        const tc = ia ? ia.length / 3 : vc / 3;
        for (let t = 0; t < tc; t++) {
          const a = ia ? ia[t * 3] : t * 3, b = ia ? ia[t * 3 + 1] : t * 3 + 1, c = ia ? ia[t * 3 + 2] : t * 3 + 2;
          if (ida && feat.n && !keep[Math.round(ida[a])]) continue;
          g.idx.push(addV(a), addV(b), addV(c)); stats.tris++;
        }
      }
    }
  }
}
// write preview GLB
const doc = new Document(); doc.createExtension(EXTTextureWebP).setRequired(true); const buf = doc.createBuffer(); const scene = doc.createScene(); const node = doc.createNode('city'); scene.addChild(node); const mesh = doc.createMesh('m'); node.setMesh(mesh);
let px = 0, opx = 0; const texCache = new Map();
for (const [key, g] of groups) {
  if (!g.idx.length) continue;
  const m = doc.createMaterial(key).setRoughnessFactor(0.9).setMetallicFactor(0);
  if (g.img) {
    let t = texCache.get(g.img);
    if (!t) { const src = images.get(g.img); const meta = await sharp(src).metadata(); opx += meta.width * meta.height; const o = await sharp(src).resize({ width: maxTex, height: maxTex, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }); px += o.info.width * o.info.height; t = doc.createTexture(g.img).setImage(new Uint8Array(o.data)).setMimeType('image/webp'); texCache.set(g.img, t); }
    m.setBaseColorTexture(t);
  } else m.setBaseColorFactor([...g.color, 1]);
  const prim = doc.createPrimitive().setMaterial(m)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nor)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.idx)).setBuffer(buf));
  if (g.img) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(g.uv)).setBuffer(buf));
  mesh.addPrimitive(prim);
}
const bin = await io.writeBinary(doc); fs.writeFileSync(out, bin);
console.log(JSON.stringify({ out, MB: +(bin.length / 1e6).toFixed(1), groups: groups.size, ...stats, imgMB: +(stats.imgBytes / 1e6).toFixed(1), origMPix: +(opx / 1e6).toFixed(1), outMPix: +(px / 1e6).toFixed(1) }));
