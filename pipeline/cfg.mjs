import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeEnu } from './lib.mjs';
export const ORIGIN = { lat: 35.0052, lon: 135.7722, h: 73.0 };
export const CORE = { w: 135.7700, s: 35.0036, e: 135.7756, n: 35.0072 };   // full detail
export const CTX = { w: 135.7655, s: 34.9995, e: 135.7805, n: 35.0115 };    // context (LOD2, vertex colours)
// Source tiles (DL) and the per-stage cache (CACHE) are not kept in git. Override with HATO_DL / HATO_CACHE.
const HERE = fileURLToPath(new URL('.', import.meta.url));
export const DL = process.env.HATO_DL || HERE + 'dl';
export const CACHE = process.env.HATO_CACHE || HERE + 'cache';
export const enu = makeEnu(ORIGIN.lat, ORIGIN.lon, ORIGIN.h);
// local rect (x=east, z=-north) for a lon/lat box
export function localBox(b) { const a = enu.ll(b.w, b.s), c = enu.ll(b.e, b.n); return { x0: a[0], x1: c[0], z0: -c[1], z1: -a[1] }; }
export const CORE_L = localBox(CORE), CTX_L = localBox(CTX);

// ---- layer cache io ----
export function saveLayer(name, features, groups) {
  fs.mkdirSync(CACHE, { recursive: true });
  const parts = [], meta = []; let off = 0;
  for (const g of groups) {
    const m = { key: g.key, img: g.img || null, color: g.color || null, nv: g.pos.length / 3, ni: g.idx.length, off: {} };
    for (const [k, arr] of [['pos', g.pos], ['nor', g.nor], ['uv', g.uv], ['idx', g.idx], ['fid', g.fid]]) { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); m.off[k] = [off, arr.length]; parts.push(b); off += b.length; }
    meta.push(m);
  }
  fs.writeFileSync(`${CACHE}/${name}.bin`, Buffer.concat(parts)); fs.writeFileSync(`${CACHE}/${name}.json`, JSON.stringify({ features, groups: meta }));
}
export function loadLayer(name) {
  const j = JSON.parse(fs.readFileSync(`${CACHE}/${name}.json`, 'utf8')), bin = fs.readFileSync(`${CACHE}/${name}.bin`);
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  for (const g of j.groups) { const o = g.off; g.pos = new Float32Array(ab, o.pos[0], o.pos[1]); g.nor = new Float32Array(ab, o.nor[0], o.nor[1]); g.uv = new Float32Array(ab, o.uv[0], o.uv[1]); g.idx = new Uint32Array(ab, o.idx[0], o.idx[1]); g.fid = new Uint32Array(ab, o.fid[0], o.fid[1]); }
  return j;
}
