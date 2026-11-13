// Stage 6: write runtime assets (quantised meshes with baked vertex AO, nav grids, texture packs, metadata).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ORIGIN, CACHE, CORE_L, CTX_L, loadLayer } from './cfg.mjs';
const OUT = process.argv[2] || fileURLToPath(new URL('../app', import.meta.url)); fs.mkdirSync(OUT + '/d', { recursive: true }); fs.mkdirSync(OUT + '/t', { recursive: true });
const R = JSON.parse(fs.readFileSync(`${CACHE}/raster.json`, 'utf8')), NAV = JSON.parse(fs.readFileSync(`${CACHE}/nav.json`, 'utf8'));
const rdF = n => { const b = fs.readFileSync(`${CACHE}/${n}.bin`); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const rdI = n => { const b = fs.readFileSync(`${CACHE}/${n}.bin`); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const topB = rdF('top_bldg'), navG = rdI('nav_G'), NC = NAV.core;
const groundAt = (x, z) => { const i = Math.min(NC.w - 1, Math.max(0, Math.floor((x - NC.x0) / NC.res))), j = Math.min(NC.h - 1, Math.max(0, Math.floor((z - NC.z0) / NC.res))); return navG[j * NC.w + i] / 100; };
const heightAt = (x, z) => { const i = Math.round((x - R.x0) / R.res), j = Math.round((z - R.z0) / R.res); if (i < 0 || j < 0 || i >= R.w || j >= R.h) return -50; const t = topB[j * R.w + i]; return Math.max(t, groundAt(x, z)); };
const DIRS = []; for (let a = 0; a < 8; a++) DIRS.push([Math.cos(a * Math.PI / 4), Math.sin(a * Math.PI / 4)]);
function aoAt(x, y, z, nx, ny, nz) {
  const wall = Math.abs(ny) < 0.6, hl = Math.hypot(nx, nz) || 1, hx = nx / hl, hz = nz / hl, px = x + nx * 0.22, py = y + ny * 0.22 + 0.03, pz = z + nz * 0.22; let vis = 0, ws = 0;
  for (const [dx, dz] of DIRS) { const w = wall ? Math.max(0, dx * hx + dz * hz) + 0.12 : 1; let ms = 0; for (const d of [0.5, 1, 2, 4, 8]) { const s = (heightAt(px + dx * d, pz + dz * d) - py) / d; if (s > ms) ms = s; } vis += w * (1 - ms / Math.sqrt(1 + ms * ms)); ws += w; }
  let a = vis / ws; if (wall && y - groundAt(x + hx * 0.3, z + hz * 0.3) < 0.35) a *= 0.82; return Math.max(0, Math.min(1, 0.28 + 0.72 * Math.pow(a, 0.9)));
}

// ---------- pak writer ----------
class Pak { constructor() { this.parts = []; this.off = 0; this.items = []; }
  add(arr) { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const pad = (4 - (this.off % 4)) % 4; if (pad) { this.parts.push(Buffer.alloc(pad)); this.off += pad; } const r = [this.off, arr.length]; this.parts.push(b); this.off += b.length; return r; }
  write(file, extra = {}) { const js = Buffer.from(JSON.stringify({ items: this.items, ...extra }), 'utf8'); const pad = (4 - (js.length % 4)) % 4; const head = Buffer.alloc(8); head.writeUInt32LE(0x4b415048, 0); head.writeUInt32LE(js.length + pad, 4); const raw = Buffer.concat([head, js, Buffer.alloc(pad, 0x20), ...this.parts]); const z = zlib.deflateRawSync(raw, { level: 9 }); fs.writeFileSync(file, z); return { raw: raw.length, z: z.length }; } }
function addMesh(pak, m) { // m: {id, kind, tex, pos(F32), nor(F32), uv(F32)|null, col(F32 rgb)|null, idx(U32), ...meta}
  const nv = m.pos.length / 3; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < nv; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const sx = Math.max(1e-3, x1 - x0), sy = Math.max(1e-3, y1 - y0), sz = Math.max(1e-3, z1 - z0), P = new Uint16Array(nv * 3), N = new Int8Array(nv * 3 + ((4 - (nv * 3) % 4) % 4)), C = new Uint8Array(nv * 4);
  for (let i = 0; i < nv; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; let nx = m.nor[i * 3], ny = m.nor[i * 3 + 1], nz = m.nor[i * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P[i * 3] = Math.round((x - x0) / sx * 65535); P[i * 3 + 1] = Math.round((y - y0) / sy * 65535); P[i * 3 + 2] = Math.round((z - z0) / sz * 65535); N[i * 3] = Math.round(nx * 127); N[i * 3 + 1] = Math.round(ny * 127); N[i * 3 + 2] = Math.round(nz * 127);
    const ao = m.noAO ? 1 : aoAt(x, y, z, nx, ny, nz); const c = m.col; C[i * 4] = c ? Math.round(Math.min(1, c[i * 3]) * 255) : 255; C[i * 4 + 1] = c ? Math.round(Math.min(1, c[i * 3 + 1]) * 255) : 255; C[i * 4 + 2] = c ? Math.round(Math.min(1, c[i * 3 + 2]) * 255) : 255; C[i * 4 + 3] = Math.round(ao * 255); }
  const it = { id: m.id, kind: m.kind, tex: m.tex || null, cls: m.cls || null, bb: [x0, y0, z0, x1, y1, z1].map(v => +v.toFixed(3)), nv, ni: m.idx.length, pos: pak.add(P), nor: pak.add(N), col: pak.add(C) };
  if (m.uv) { const U = new Uint16Array(nv * 2); for (let i = 0; i < nv * 2; i++) U[i] = Math.round(Math.min(1, Math.max(0, m.uv[i])) * 65535); it.uv = pak.add(U); }
  it.idx = nv <= 65535 ? pak.add(Uint16Array.from(m.idx)) : pak.add(Uint32Array.from(m.idx)); it.i32 = nv > 65535 ? 1 : 0; pak.items.push(it); return it;
}
function loadPacked(layer) { const j = JSON.parse(fs.readFileSync(`${CACHE}/packed_${layer}.json`, 'utf8')), bin = fs.readFileSync(`${CACHE}/packed_${layer}.bin`), ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const f = (o, T) => new T(ab, o[0], o[1]); for (const g of j.groups) { g.pos = f(g.off.pos, Float32Array); g.nor = f(g.off.nor, Float32Array); g.uv = f(g.off.uv, Float32Array); g.idx = f(g.off.idx, Uint32Array); g.fid = f(g.off.fid, Uint32Array); }
  if (j.plain) { const o = j.plain.off; j.plain.pos = f(o.pos, Float32Array); j.plain.nor = f(o.nor, Float32Array); j.plain.col = f(o.col, Float32Array); j.plain.idx = f(o.idx, Uint32Array); j.plain.fid = f(o.fid, Uint32Array); } return j; }
// split an indexed mesh by a per-triangle key function -> Map(key -> {pos,nor,col,idx})
function splitBy(src, keyOf) { const out = new Map(); for (let t = 0; t < src.idx.length; t += 3) { const k = keyOf(src.idx[t], t); if (k == null) continue; let o = out.get(k); if (!o) { o = { pos: [], nor: [], col: [], uv: [], idx: [], map: new Map() }; out.set(k, o); } for (let e = 0; e < 3; e++) { const v = src.idx[t + e]; let n = o.map.get(v); if (n === undefined) { n = o.pos.length / 3; o.map.set(v, n); o.pos.push(src.pos[v * 3], src.pos[v * 3 + 1], src.pos[v * 3 + 2]); o.nor.push(src.nor[v * 3], src.nor[v * 3 + 1], src.nor[v * 3 + 2]); if (src.col) o.col.push(src.col[v * 3], src.col[v * 3 + 1], src.col[v * 3 + 2]); if (src.uv) o.uv.push(src.uv[v * 2], src.uv[v * 2 + 1]); } o.idx.push(n); } } return out; }
const cell = (x, z, s) => Math.floor(x / s) + '_' + Math.floor(z / s);

const core = new Pak(), texTable = {}; let triTotal = 0, vertTotal = 0;
// ---------- textured layers ----------
for (const [layer, kind] of [['bldg3', 'lod3'], ['bldg2', 'lod2'], ['frn', 'frn']]) {
  const L = loadPacked(layer);
  for (const g of L.groups) { addMesh(core, { id: g.key, kind, tex: g.key, pos: g.pos, nor: g.nor, uv: g.uv, idx: g.idx }); texTable[g.key] = { w: g.w, h: g.h, bb: g.bb }; triTotal += g.idx.length / 3; vertTotal += g.pos.length / 3; }
  if (L.plain) { const P = L.plain;
    if (layer === 'frn') { // class by function, chunk by 48 m cells
      const clsOf = f => { const fn = (L.features[f].func || ''); if (fn.includes('柵') || fn.includes('壁')) return 'fence'; if (fn.includes('建造物')) return 'deck'; if (/マンホール|ハンドホール/.test(fn)) return 'iron'; if (/側溝|集水|路側|電柱|柱|階段/.test(fn)) return 'conc'; if (/照明|信号|標識|管理/.test(fn)) return 'metal'; return 'misc'; };
      for (const [k, o] of splitBy(P, v => clsOf(P.fid[v]) + '|' + cell(P.pos[v * 3], P.pos[v * 3 + 2], 48))) { addMesh(core, { id: 'frnp_' + k, kind: 'frnp', cls: k.split('|')[0], pos: new Float32Array(o.pos), nor: new Float32Array(o.nor), idx: new Uint32Array(o.idx) }); triTotal += o.idx.length / 3; vertTotal += o.pos.length / 3; }
    } else { addMesh(core, { id: layer + '_plain', kind: kind + 'p', pos: P.pos, nor: P.nor, col: P.col, idx: P.idx }); triTotal += P.idx.length / 3; }
  }
}
// ---------- roads / bridges (untextured, procedural materials at runtime) ----------
for (const [layer, kind] of [['tran', 'road'], ['brid', 'bridge'], ['vegp', 'shrub']]) {
  const L = loadLayer(layer); const pos = [], nor = [], idx = [], col = [];
  // principal street direction per feature (for the paving pattern)
  const acc = L.features.map(() => [0, 0, 0, 0, 0, 0]); for (const g of L.groups) for (let v = 0; v < g.pos.length / 3; v++) { const a = acc[g.fid[v]], x = g.pos[v * 3], z = g.pos[v * 3 + 2]; a[0]++; a[1] += x; a[2] += z; a[3] += x * x; a[4] += z * z; a[5] += x * z; }
  const dirs = acc.map(a => { const n = Math.max(1, a[0]), mx = a[1] / n, mz = a[2] / n, cxx = a[3] / n - mx * mx, czz = a[4] / n - mz * mz, cxz = a[5] / n - mx * mz, th = 0.5 * Math.atan2(2 * cxz, cxx - czz); return [Math.cos(th), Math.sin(th)]; });
  for (const g of L.groups) { const base = pos.length / 3; for (let v = 0; v < g.pos.length / 3; v++) { pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); nor.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); const d = dirs[g.fid[v]]; col.push(d[0] * 0.5 + 0.5, d[1] * 0.5 + 0.5, 1); } for (const i of g.idx) idx.push(base + i); }
  addMesh(core, { id: layer, kind, pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), idx: new Uint32Array(idx) }); triTotal += idx.length / 3;
}
const cs = core.write(`${OUT}/d/core.bin`); console.log('core.bin', cs, 'meshes', core.items.length, 'tris', triTotal, 'verts(tex)', vertTotal);

// ---------- context buildings: vertex colours sampled from textures ----------
{ const L = loadLayer('bldgctx'), ctx = new Pak(); const acc = new Map(); let tris = 0; const gmin = L.features.map(f => f.bb[1]);
  for (const g of L.groups) { let img = null, iw = 0, ih = 0; if (g.img) { const o = await sharp(`${CACHE}/img/${g.img}`, { limitInputPixels: false }).removeAlpha().resize(512, 512, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }); img = o.data; iw = o.info.width; ih = o.info.height; }
    const nv = g.pos.length / 3, col = new Float32Array(nv * 3);
    for (let v = 0; v < nv; v++) { if (img) { const u = Math.min(iw - 1, Math.max(0, Math.floor(g.uv[v * 2] * iw))), w = Math.min(ih - 1, Math.max(0, Math.floor(g.uv[v * 2 + 1] * ih))), o = (w * iw + u) * 3; col[v * 3] = img[o] / 255; col[v * 3 + 1] = img[o + 1] / 255; col[v * 3 + 2] = img[o + 2] / 255; } else { col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 0.72; } }
    // per-triangle average colour (flat) reads better than corner samples of an atlas
    for (let t = 0; t < g.idx.length; t += 3) { const a = g.idx[t], b = g.idx[t + 1], c = g.idx[t + 2]; let r = 0, gg = 0, bl = 0; if (img) { for (const [wa, wb, wc] of [[.34, .33, .33], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6]]) { const u = g.uv[a * 2] * wa + g.uv[b * 2] * wb + g.uv[c * 2] * wc, w = g.uv[a * 2 + 1] * wa + g.uv[b * 2 + 1] * wb + g.uv[c * 2 + 1] * wc, o = (Math.min(ih - 1, Math.max(0, Math.floor(w * ih))) * iw + Math.min(iw - 1, Math.max(0, Math.floor(u * iw)))) * 3; r += img[o]; gg += img[o + 1]; bl += img[o + 2]; } r /= 1020; gg /= 1020; bl /= 1020; } else r = gg = bl = 0.72;
      const key = cell((g.pos[a * 3] + g.pos[b * 3] + g.pos[c * 3]) / 3, (g.pos[a * 3 + 2] + g.pos[b * 3 + 2] + g.pos[c * 3 + 2]) / 3, 260); let o = acc.get(key); if (!o) { o = { pos: [], nor: [], col: [], idx: [] }; acc.set(key, o); }
      for (const v of [a, b, c]) { o.idx.push(o.pos.length / 3); o.pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); o.nor.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); const hgt = Math.max(0, g.pos[v * 3 + 1] - gmin[g.fid[v]]), sh = 0.62 + 0.38 * Math.min(1, hgt / 9); o.col.push((r * 0.6 + col[v * 3] * 0.4) * sh * 0.86, (gg * 0.6 + col[v * 3 + 1] * 0.4) * sh * 0.86, (bl * 0.6 + col[v * 3 + 2] * 0.4) * sh * 0.86); } tris++; }
  }
  for (const [k, o] of acc) addMesh(ctx, { id: 'ctx_' + k, kind: 'ctx', pos: new Float32Array(o.pos), nor: new Float32Array(o.nor), col: new Float32Array(o.col), idx: new Uint32Array(o.idx), noAO: true });
  console.log('ctx.bin', ctx.write(`${OUT}/d/ctx.bin`), 'meshes', ctx.items.length, 'tris', tris); }

// ---------- nav pak ----------
{ const nav = new Pak(); const g = {}; for (const n of ['nav_G', 'nav_T', 'nav_F', 'nav_W', 'ctx_G', 'ctx_T', 'ctx_W', 'water1']) g[n] = nav.add(rdI(n));
  for (const n of ['nav_C', 'nav_AO']) { const b = fs.readFileSync(`${CACHE}/${n}.bin`); g[n] = nav.add(new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))); }
  const far = rdF('demfar'), fm = JSON.parse(fs.readFileSync(`${CACHE}/demfar.json`, 'utf8')), fi = new Int16Array(far.length); for (let i = 0; i < far.length; i++) fi[i] = Math.round(far[i] * 10); g.far = nav.add(fi);
  console.log('nav.bin', nav.write(`${OUT}/d/nav.bin`, { grids: g, core: NAV.core, ctx: NAV.ctx, water1: NAV.water1, far: fm, off: NAV.off, geoid: NAV.geoid })); }

// ---------- textures ----------
{ const names = Object.keys(texTable); for (const lv of ['b', 'm']) { const parts = [], idx = {}; let off = 0; for (const n of names) { const b = fs.readFileSync(`${CACHE}/atlas/${n}_${lv}.webp`); idx[n] = [off, b.length]; parts.push(b); off += b.length; } const js = Buffer.from(JSON.stringify(idx)); const head = Buffer.alloc(4); head.writeUInt32LE(js.length, 0); fs.writeFileSync(`${OUT}/t/${lv}.pak`, Buffer.concat([head, js, ...parts])); console.log(`t/${lv}.pak`, off); }
  let hu = 0; for (const n of names) for (const lv of ['h', 'u']) { fs.copyFileSync(`${CACHE}/atlas/${n}_${lv}.webp`, `${OUT}/t/${n}_${lv}.webp`); hu += fs.statSync(`${OUT}/t/${n}_${lv}.webp`).size; } console.log('h+u files', names.length * 2, (hu / 1e6).toFixed(1), 'MB');
  const oc = await sharp(`${CACHE}/ortho_core.png`).resize(1024, 800, { fit: 'fill' }).webp({ quality: 84 }).toBuffer(); fs.writeFileSync(`${OUT}/t/ortho_core.webp`, oc);
  const ox = await sharp(`${CACHE}/ortho_ctx.png`).resize(1024, 1024, { fit: 'fill' }).webp({ quality: 76 }).toBuffer(); fs.writeFileSync(`${OUT}/t/ortho_ctx.webp`, ox);
  const of = await sharp(`${CACHE}/photofar.png`).resize(512, 512).webp({ quality: 70 }).toBuffer(); fs.writeFileSync(`${OUT}/t/far.webp`, of); console.log('ortho', oc.length, ox.length, of.length); }

// ---------- metadata ----------
{ const F = loadLayer('frn').features, lamps = [], pois = [];
  for (const f of F) { const b = f.bb, fn = f.func || ''; const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2; if (fn.includes('照明')) lamps.push([+cx.toFixed(2), +b[4].toFixed(2), +cz.toFixed(2), +(b[4] - b[1]).toFixed(2)]); else if (/祠|ベンチ|自動販売機|看板|信号/.test(fn)) pois.push({ t: fn, p: [+cx.toFixed(2), +b[1].toFixed(2), +cz.toFixed(2)], s: [+(b[3] - b[0]).toFixed(2), +(b[4] - b[1]).toFixed(2), +(b[5] - b[2]).toFixed(2)] }); }
  const trees = loadLayer('vegs').features.map(f => { const b = f.bb; return [+((b[0] + b[3]) / 2).toFixed(2), +b[1].toFixed(2), +((b[2] + b[5]) / 2).toFixed(2), +(b[4] - b[1]).toFixed(2), +(((b[3] - b[0]) + (b[5] - b[2])) / 4).toFixed(2)]; });
  const meta = { origin: ORIGIN, core: CORE_L, ctx: CTX_L, tex: texTable, lamps, trees, pois };
  fs.writeFileSync(`${OUT}/d/meta.json`, JSON.stringify(meta)); console.log('meta: lamps', lamps.length, 'trees', trees.length, 'pois', pois.length, 'tex', Object.keys(texTable).length); }
