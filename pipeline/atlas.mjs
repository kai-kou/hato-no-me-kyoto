// Stage 4: re-pack PLATEAU texture atlases per spatial bin with importance-based texel density,
// and write a 4-level WebP pyramid per bin.  usage: node atlas.mjs <layer> [ultraSize]
import fs from 'node:fs';
import sharp from 'sharp';
import { CACHE, loadLayer } from './cfg.mjs';
sharp.cache(false); sharp.concurrency(4);
const layer = process.argv[2], BIN = +(process.argv[3] || 2048), PAD = 4, MAXDENS = +(process.env.MAXDENS || 128), BASE_SCALE = +(process.env.BASE_SCALE || 1);
const HIDDEN_SCALE = +(process.env.HIDDEN_SCALE || 0.25), ROOF_SCALE = +(process.env.ROOF_SCALE || 0.25);
const R = JSON.parse(fs.readFileSync(`${CACHE}/raster.json`, 'utf8'));
const rd = n => { const b = fs.readFileSync(`${CACHE}/${n}.bin`); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const top = rd('top_bldg'), bot = rd('bot_bldg');
const blocked = (x, y, z) => { const i = Math.round((x - R.x0) / R.res), j = Math.round((z - R.z0) / R.res); if (i < 0 || j < 0 || i >= R.w || j >= R.h) return false; const k = j * R.w + i; return top[k] > -900 && y > bot[k] - 0.05 && y < top[k] + 0.05; };
const L = loadLayer(layer); const OUT = `${CACHE}/atlas`; fs.mkdirSync(OUT, { recursive: true });
const bins = []; const plain = { pos: [], nor: [], col: [], fid: [], idx: [] };
let srcPx = 0, outPx = 0, nCharts = 0; const allCharts = [];

class Skyline { // bottom-left skyline packer
  constructor(w, h) { this.w = w; this.h = h; this.sk = [[0, 0, w]]; this.used = 0; }
  clone() { const s = new Skyline(this.w, this.h); s.sk = this.sk.map(a => a.slice()); s.used = this.used; return s; }
  fit(i, w, h) { let x = this.sk[i][0]; if (x + w > this.w) return -1; let y = 0, left = w, k = i; while (left > 0) { if (k >= this.sk.length) return -1; y = Math.max(y, this.sk[k][1]); if (y + h > this.h) return -1; left -= this.sk[k][2]; k++; } return y; }
  add(w, h) { let best = -1, by = 1e9, bx = 0; for (let i = 0; i < this.sk.length; i++) { const y = this.fit(i, w, h); if (y >= 0 && (y < by || (y === by && this.sk[i][0] < bx))) { best = i; by = y; bx = this.sk[i][0]; } } if (best < 0) return null;
    const node = [bx, by + h, w]; this.sk.splice(best, 0, node); for (let i = best + 1; i < this.sk.length;) { const prevEnd = this.sk[i - 1][0] + this.sk[i - 1][2]; if (this.sk[i][0] < prevEnd) { const sh = prevEnd - this.sk[i][0]; this.sk[i][0] += sh; this.sk[i][2] -= sh; if (this.sk[i][2] <= 0) { this.sk.splice(i, 1); continue; } } break; }
    for (let i = 0; i < this.sk.length - 1;) { if (this.sk[i][1] === this.sk[i + 1][1]) { this.sk[i][2] += this.sk[i + 1][2]; this.sk.splice(i + 1, 1); } else i++; }
    this.used = Math.max(this.used, by + h); return [bx, by]; }
}

for (const g of L.groups) {
  const nv = g.pos.length / 3, nt = g.idx.length / 3;
  if (!g.img) { // untextured: vertex colour mesh
    const base = plain.pos.length / 3; for (let v = 0; v < nv; v++) { plain.pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); plain.nor.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); plain.col.push(...(g.color || [0.8, 0.8, 0.8])); plain.fid.push(g.fid[v]); } for (const i of g.idx) plain.idx.push(base + i); continue;
  }
  const meta = await sharp(`${CACHE}/img/${g.img}`).metadata(), W = meta.width, H = meta.height; srcPx += W * H;
  // ---- charts by vertex connectivity
  const par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i; const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < nt; t++) { const a = find(g.idx[t * 3]), b = find(g.idx[t * 3 + 1]), c = find(g.idx[t * 3 + 2]); par[b] = a; par[c] = a; }
  const cmap = new Map(); let charts = [];
  for (let v = 0; v < nv; v++) { const r = find(v); let c = cmap.get(r); if (!c) { c = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, vis: 0, hid: 0, roof: 0, area: 0, fid: g.fid[v], verts: [] }; cmap.set(r, c); charts.push(c); } const u = Math.min(1, Math.max(0, g.uv[v * 2])) * W, w = Math.min(1, Math.max(0, g.uv[v * 2 + 1])) * H; if (u < c.x0) c.x0 = u; if (u > c.x1) c.x1 = u; if (w < c.y0) c.y0 = w; if (w > c.y1) c.y1 = w; c.verts.push(v); }
  for (let t = 0; t < nt; t++) { const i0 = g.idx[t * 3], i1 = g.idx[t * 3 + 1], i2 = g.idx[t * 3 + 2], c = cmap.get(find(i0)), p = g.pos;
    const ux = p[i1 * 3] - p[i0 * 3], uy = p[i1 * 3 + 1] - p[i0 * 3 + 1], uz = p[i1 * 3 + 2] - p[i0 * 3 + 2], vx = p[i2 * 3] - p[i0 * 3], vy = p[i2 * 3 + 1] - p[i0 * 3 + 1], vz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const ar = 0.5 * Math.hypot(nx, ny, nz); if (ar < 1e-6) continue; nx /= 2 * ar; ny /= 2 * ar; nz /= 2 * ar; c.area += ar;
    if (Math.abs(ny) > 0.6) { c.roof += ar; continue; }
    const cx = (p[i0 * 3] + p[i1 * 3] + p[i2 * 3]) / 3, cy = (p[i0 * 3 + 1] + p[i1 * 3 + 1] + p[i2 * 3 + 1]) / 3, cz = (p[i0 * 3 + 2] + p[i1 * 3 + 2] + p[i2 * 3 + 2]) / 3, hl = Math.hypot(nx, nz) || 1; let hit = false;
    for (let d = 0.45; d <= 1.25 && !hit; d += 0.2) hit = blocked(cx + nx / hl * d, cy, cz + nz / hl * d);
    if (hit) c.hid += ar; else c.vis += ar; }
  for (const c of charts) { c.x0 = Math.max(0, Math.floor(c.x0) - 1); c.y0 = Math.max(0, Math.floor(c.y0) - 1); c.x1 = Math.min(W, Math.ceil(c.x1) + 1); c.y1 = Math.min(H, Math.ceil(c.y1) + 1); }
  // ---- merge charts whose source rects overlap strongly (shared pixels)
  charts.sort((a, b) => a.x0 - b.x0); const cp = charts.map((_, i) => i), cf = a => { while (cp[a] !== a) { cp[a] = cp[cp[a]]; a = cp[a]; } return a; };
  for (let i = 0; i < charts.length; i++) { const a = charts[i]; for (let j = i + 1; j < charts.length && charts[j].x0 < a.x1; j++) { const b = charts[j]; const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); if (ix <= 0 || iy <= 0) continue; const sm = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)); if (ix * iy > 0.3 * sm) cp[cf(j)] = cf(i); } }
  const merged = new Map(); charts.forEach((c, i) => { const r = cf(i); let m = merged.get(r); if (!m) { m = { ...c, verts: [] }; m.vis = m.hid = m.roof = m.area = 0; m.x0 = 1e9; m.y0 = 1e9; m.x1 = -1e9; m.y1 = -1e9; merged.set(r, m); } m.x0 = Math.min(m.x0, c.x0); m.y0 = Math.min(m.y0, c.y0); m.x1 = Math.max(m.x1, c.x1); m.y1 = Math.max(m.y1, c.y1); m.vis += c.vis; m.hid += c.hid; m.roof += c.roof; m.area += c.area; for (const v of c.verts) m.verts.push(v); });
  charts = [...merged.values()].filter(c => c.x1 > c.x0 && c.y1 > c.y0); nCharts += charts.length;
  for (const c of charts) { const w = c.x1 - c.x0, h = c.y1 - c.y0; let s = BASE_SCALE; const visShare = c.vis / Math.max(1e-6, c.area); if (visShare < 0.25) s *= (c.roof >= c.hid ? ROOF_SCALE : HIDDEN_SCALE);
    const dens = Math.sqrt(w * h / Math.max(0.01, c.area)); while (dens * s > MAXDENS && s > 1 / 16) s /= 2; while ((w * s > BIN - 2 * PAD - 2 || h * s > BIN - 2 * PAD - 2) && s > 1 / 64) s /= 2; c.s = s; }
  g.W = W; g.H = H; g.vchart = new Array(nv); for (const c of charts) { c.g = g; for (const v of c.verts) g.vchart[v] = c; } allCharts.push(...charts);
}
// ---- global pass: order features along a Morton curve, then bin-pack feature by feature
const mort = (x, z) => { let a = Math.max(0, Math.floor((x + 1000) / 16)), b = Math.max(0, Math.floor((z + 1000) / 16)), r = 0; for (let i = 0; i < 10; i++) r |= ((a >> i) & 1) << (2 * i) | ((b >> i) & 1) << (2 * i + 1); return r; };
const byF = new Map(); for (const c of allCharts) { if (!byF.has(c.fid)) byF.set(c.fid, []); byF.get(c.fid).push(c); }
const fl = [...byF.keys()].map(f => { const bb = L.features[f].bb; return { f, k: mort((bb[0] + bb[3]) / 2, (bb[2] + bb[5]) / 2) }; }).sort((a, b) => a.k - b.k);
let cur = null; const newBin = () => { cur = { sk: new Skyline(BIN, BIN), charts: [], feats: new Set() }; bins.push(cur); };
newBin();
for (const { f } of fl) { const cs = byF.get(f).sort((a, b) => (b.y1 - b.y0) * b.s - (a.y1 - a.y0) * a.s);
  for (let attempt = 0; attempt < 10; attempt++) {
    const trial = cur.sk.clone(), placed = []; let ok = true;
    for (const c of cs) { const w = Math.max(1, Math.round((c.x1 - c.x0) * c.s)) + 2 * PAD, h = Math.max(1, Math.round((c.y1 - c.y0) * c.s)) + 2 * PAD; const p = trial.add(w, h); if (!p) { ok = false; break; } placed.push([c, p, w, h]); }
    if (ok) { cur.sk = trial; for (const [c, p, w, h] of placed) { c.dx = p[0]; c.dy = p[1]; c.dw = w - 2 * PAD; c.dh = h - 2 * PAD; c.bin = cur; cur.charts.push(c); } cur.feats.add(f); break; }
    if (cur.charts.length) newBin(); else for (const c of cs) c.s /= 2; // too big for an empty bin -> shrink
  }
}

// ---- render bins
const cacheImg = new Map();
async function srcRaw(g) { if (cacheImg.has(g.img)) return cacheImg.get(g.img); if (cacheImg.size >= 3) cacheImg.delete(cacheImg.keys().next().value); const r = await sharp(`${CACHE}/img/${g.img}`, { limitInputPixels: false }).removeAlpha().raw().toBuffer(); cacheImg.set(g.img, r); return r; }
const outGroups = []; let bi = 0;
for (const b of bins) {
  if (!b.charts.length) continue;
  const bw = BIN, bh = Math.max(64, 2 ** Math.ceil(Math.log2(b.sk.used))), buf = Buffer.alloc(bw * bh * 3, 128);
  const bySrc = new Map(); for (const c of b.charts) { if (!bySrc.has(c.g)) bySrc.set(c.g, []); bySrc.get(c.g).push(c); }
  for (const [g, cl] of bySrc) { const W = g.W, src = await srcRaw(g);
  for (const c of cl) { const sw = c.x1 - c.x0, sh = c.y1 - c.y0;
    for (let y = -PAD; y < c.dh + PAD; y++) { const cy = Math.min(c.dh - 1, Math.max(0, y)), sy0 = c.y0 + Math.min(sh - 1, Math.floor(cy * sh / c.dh)), sy1 = Math.min(c.y1, Math.max(sy0 + 1, c.y0 + Math.floor((cy + 1) * sh / c.dh)));
      for (let x = -PAD; x < c.dw + PAD; x++) { const cx = Math.min(c.dw - 1, Math.max(0, x)), sx0 = c.x0 + Math.min(sw - 1, Math.floor(cx * sw / c.dw)), sx1 = Math.min(c.x1, Math.max(sx0 + 1, c.x0 + Math.floor((cx + 1) * sw / c.dw)));
        let r = 0, gg = 0, bb = 0, n = 0; const stepY = Math.max(1, (sy1 - sy0) >> 2), stepX = Math.max(1, (sx1 - sx0) >> 2);
        for (let yy = sy0; yy < sy1; yy += stepY) for (let xx = sx0; xx < sx1; xx += stepX) { const o = (yy * W + xx) * 3; r += src[o]; gg += src[o + 1]; bb += src[o + 2]; n++; }
        const o = ((c.dy + PAD + y) * bw + c.dx + PAD + x) * 3; buf[o] = r / n; buf[o + 1] = gg / n; buf[o + 2] = bb / n; } }
    outPx += (c.dw + 2 * PAD) * (c.dh + 2 * PAD);
  } }
  // geometry for this bin
  const pos = [], nor = [], uv = [], fid = [], idx = [];
  for (const g of bySrc.keys()) { const vmap = new Map(), W = g.W, H = g.H;
    const av = v => { let n = vmap.get(v); if (n !== undefined) return n; const c = g.vchart[v]; n = fid.length; vmap.set(v, n); pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2]); nor.push(g.nor[v * 3], g.nor[v * 3 + 1], g.nor[v * 3 + 2]); fid.push(g.fid[v]);
      const u = Math.min(1, Math.max(0, g.uv[v * 2])) * W, w = Math.min(1, Math.max(0, g.uv[v * 2 + 1])) * H; uv.push((c.dx + PAD + (u - c.x0) * c.dw / (c.x1 - c.x0)) / bw, (c.dy + PAD + (w - c.y0) * c.dh / (c.y1 - c.y0)) / bh); return n; };
    for (let t = 0; t < g.idx.length; t += 3) { const c = g.vchart[g.idx[t]]; if (!c || c.bin !== b) continue; idx.push(av(g.idx[t]), av(g.idx[t + 1]), av(g.idx[t + 2])); } }
  const name = `${layer}_${bi++}`; const img = sharp(buf, { raw: { width: bw, height: bh, channels: 3 } });
  const lv = [['u', 1, 80], ['h', 2, 78], ['m', 4, 76], ['b', 8, 74]]; const sizes = {};
  for (const [tag, div, q] of lv) { const o = await img.clone().resize(Math.max(8, bw / div), Math.max(8, bh / div), { kernel: 'lanczos3' }).webp({ quality: q, effort: 4 }).toBuffer(); fs.writeFileSync(`${OUT}/${name}_${tag}.webp`, o); sizes[tag] = o.length; }
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9; for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]); z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
  outGroups.push({ key: name, img: name, w: bw, h: bh, sizes, bb: [x0, y0, z0, x1, y1, z1].map(v => +v.toFixed(2)), feats: [...b.feats], pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), idx: new Uint32Array(idx), fid: new Uint32Array(fid) });
}
// save packed layer (custom cache: json + bin)
{ const parts = [], meta = []; let off = 0; const put = arr => { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); const r = [off, arr.length]; parts.push(b); off += b.length; return r; };
  for (const g of outGroups) meta.push({ key: g.key, img: g.img, w: g.w, h: g.h, sizes: g.sizes, bb: g.bb, feats: g.feats, off: { pos: put(g.pos), nor: put(g.nor), uv: put(g.uv), idx: put(g.idx), fid: put(g.fid) } });
  const pl = plain.idx.length ? { off: { pos: put(new Float32Array(plain.pos)), nor: put(new Float32Array(plain.nor)), col: put(new Float32Array(plain.col)), idx: put(new Uint32Array(plain.idx)), fid: put(new Uint32Array(plain.fid)) } } : null;
  fs.writeFileSync(`${CACHE}/packed_${layer}.bin`, Buffer.concat(parts)); fs.writeFileSync(`${CACHE}/packed_${layer}.json`, JSON.stringify({ features: L.features, groups: meta, plain: pl })); }
const tot = outGroups.reduce((s, g) => { for (const k in g.sizes) s[k] = (s[k] || 0) + g.sizes[k]; return s; }, {});
console.log(`${layer}: srcAtlases=${L.groups.filter(g => g.img).length} srcMPix=${(srcPx / 1e6).toFixed(0)} charts=${nCharts} bins=${outGroups.length} usedMPix=${(outPx / 1e6).toFixed(1)} binMPix=${(outGroups.reduce((s, g) => s + g.w * g.h, 0) / 1e6).toFixed(1)} plainTris=${plain.idx.length / 3} webpMB=${JSON.stringify(Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])))}`);
