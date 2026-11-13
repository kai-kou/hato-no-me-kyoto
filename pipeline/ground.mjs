// Stage 5: ground model. Geoid calibration, water mask + surface, ground / obstacle / AO grids for nav + rendering.
import fs from 'node:fs';
import sharp from 'sharp';
import { ORIGIN, CACHE, CTX_L, loadLayer } from './cfg.mjs';
import { rasterLayers } from './raster.mjs';
const R = JSON.parse(fs.readFileSync(`${CACHE}/raster.json`, 'utf8')), D = JSON.parse(fs.readFileSync(`${CACHE}/dem.json`, 'utf8'));
const rd = n => { const b = fs.readFileSync(`${CACHE}/${n}.bin`); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const dem = rd('dem'), demRaw = rd('dem1raw'), topB = rd('top_bldg'), botB = rd('bot_bldg'), topF = rd('top_frn'), topT = rd('top_tran');
const demAt = (x, z) => { const fx = Math.min(D.w - 1.001, Math.max(0, x - D.x0)), fz = Math.min(D.h - 1.001, Math.max(0, z - D.z0)), i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j, k = j * D.w + i; return (dem[k] * (1 - a) + dem[k + 1] * a) * (1 - b) + (dem[k + D.w] * (1 - a) + dem[k + D.w + 1] * a) * b; };
// --- inpaint missing DEM cells (water / no-return) by diffusion from valid neighbours
{ let front = []; for (let k = 0; k < dem.length; k++) if (dem[k] !== dem[k]) front.push(k); let guard = 0;
  while (front.length && guard++ < 400) { const upd = [], rest = []; for (const k of front) { const i = k % D.w, j = (k / D.w) | 0; let s = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= D.w || y >= D.h) continue; const v = dem[y * D.w + x]; if (v === v) { s += v; n++; } } if (n) upd.push([k, s / n]); else rest.push(k); } for (const [k, v] of upd) dem[k] = v; front = rest; } }
// --- geoid calibration from LOD3 road surfaces
const diffs = []; for (let j = 0; j < R.h; j += 3) for (let i = 0; i < R.w; i += 3) { const t = topT[j * R.w + i]; if (t > -900) { const d = demAt(R.x0 + i * R.res, R.z0 + j * R.res); if (d === d) diffs.push(t + ORIGIN.h - d); } }
diffs.sort((a, b) => a - b); const GEOID = diffs[diffs.length >> 1], OFF = GEOID - ORIGIN.h;
console.log('geoid offset (PLATEAU ellipsoidal - GSI orthometric): median', GEOID.toFixed(2), 'p10', diffs[Math.floor(diffs.length * 0.1)].toFixed(2), 'p90', diffs[Math.floor(diffs.length * 0.9)].toFixed(2), 'n', diffs.length);

// --- water on the 1 m context grid
const N1 = D.w * D.h, water = new Uint8Array(N1); for (let k = 0; k < N1; k++) water[k] = demRaw[k] !== demRaw[k] ? 1 : 0;
{ // drop tiny components
  const lab = new Int32Array(N1).fill(-1); let nl = 0; const st = [];
  for (let k0 = 0; k0 < N1; k0++) { if (!water[k0] || lab[k0] >= 0) continue; const cells = [k0]; lab[k0] = nl; st.push(k0); while (st.length) { const k = st.pop(), i = k % D.w, j = (k / D.w) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= D.w || b >= D.h) continue; const q = b * D.w + a; if (water[q] && lab[q] < 0) { lab[q] = nl; st.push(q); cells.push(q); } } } if (cells.length < 60) for (const c of cells) water[c] = 0; nl++; }
}
const wl = new Float32Array(N1).fill(NaN), dist = new Float32Array(N1).fill(1e9); { // BFS from shore
  let q = []; for (let j = 1; j < D.h - 1; j++) for (let i = 1; i < D.w - 1; i++) { const k = j * D.w + i; if (!water[k]) continue; let m = 1e9; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const n = k + b * D.w + a; if (!water[n] && dem[n] === dem[n]) m = Math.min(m, dem[n]); } if (m < 1e8) { wl[k] = m; dist[k] = 0.5; q.push(k); } }
  while (q.length) { const nq = []; for (const k of q) for (const d of [1, -1, D.w, -D.w]) { const n = k + d; if (n < 0 || n >= N1 || !water[n] || wl[n] === wl[n]) continue; wl[n] = wl[k]; dist[n] = dist[k] + 1; nq.push(n); } q = nq; }
  for (let it = 0; it < 14; it++) { const t = wl.slice(); for (let j = 1; j < D.h - 1; j++) for (let i = 1; i < D.w - 1; i++) { const k = j * D.w + i; if (!water[k]) continue; let s = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const v = t[k + b * D.w + a]; if (v === v) { s += v; n++; } } wl[k] = s / n; } }
}
let wc = 0; for (let k = 0; k < N1; k++) wc += water[k]; console.log('water cells (1m^2):', wc);

// --- core nav grid 0.5 m
const NW = R.w >> 1, NH = R.h >> 1, NR = 0.5, NN = NW * NH;
const G = new Float32Array(NN), T = new Float32Array(NN).fill(-1e3), Fr = new Float32Array(NN).fill(-1e3), W = new Float32Array(NN).fill(-1e3), C = new Uint8Array(NN), TR = new Float32Array(NN).fill(-1e3);
const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177 | 0; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
  const k = j * NW + i, x = R.x0 + (i + 0.5) * NR, z = R.z0 + (j + 0.5) * NR; let tb = -1e3, tf = -1e3, tt = -1e3;
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) { const q = (j * 2 + b) * R.w + i * 2 + a; if (topB[q] > tb) tb = topB[q]; if (topF[q] > tf) tf = topF[q]; if (topT[q] > tt) tt = topT[q]; }
  const di = Math.min(D.w - 1, Math.max(0, Math.round(x - D.x0 - 0.5))), dj = Math.min(D.h - 1, Math.max(0, Math.round(z - D.z0 - 0.5))), dk = dj * D.w + di;
  let g = demAt(x - 0.5, z - 0.5) + OFF;
  if (water[dk] && tb < -900) { const lvl = wl[dk] + OFF; W[k] = lvl; const depth = Math.min(0.6, 0.05 + dist[dk] * 0.05) * (0.8 + 0.4 * hash(i >> 2, j >> 2)); g = lvl - depth; C[k] = 1; }
  if (tt > -900) { TR[k] = tt; C[k] = 2; if (tb < -900) g = tt; }
  if (tb > -900) { C[k] = 3; T[k] = tb; }
  G[k] = g; Fr[k] = tf;
}
// --- AO for the ground (horizon scan against obstacle heights)
const Hf = new Float32Array(NN); for (let k = 0; k < NN; k++) Hf[k] = Math.max(G[k], T[k], C[k] === 1 ? W[k] : -1e3);
const AO = new Uint8Array(NN), dirs = []; for (let a = 0; a < 12; a++) dirs.push([Math.cos(a * Math.PI / 6), Math.sin(a * Math.PI / 6)]);
for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) { const k = j * NW + i; if (C[k] === 3) { AO[k] = 110; continue; } const y0 = Math.max(G[k], C[k] === 1 ? W[k] : -1e3) + 0.05; let vis = 0;
  for (const [dx, dz] of dirs) { let ms = 0; for (const d of [1, 2, 4, 8, 16, 28]) { const a = Math.round(i + dx * d), b = Math.round(j + dz * d); if (a < 0 || b < 0 || a >= NW || b >= NH) break; const s = (Hf[b * NW + a] - y0) / (d * NR); if (s > ms) ms = s; } vis += 1 - ms / Math.sqrt(1 + ms * ms); }
  AO[k] = Math.round(255 * Math.min(1, 0.25 + 0.75 * vis / dirs.length)); }
const i16 = (f, miss) => { const o = new Int16Array(f.length); for (let k = 0; k < f.length; k++) o[k] = f[k] < -900 ? -32768 : Math.max(-32000, Math.min(32000, Math.round(f[k] * 100))); return o; };
const meta = { geoid: GEOID, off: OFF, core: { x0: R.x0, z0: R.z0, w: NW, h: NH, res: NR } };
fs.writeFileSync(`${CACHE}/nav_G.bin`, Buffer.from(i16(G).buffer)); fs.writeFileSync(`${CACHE}/nav_T.bin`, Buffer.from(i16(T).buffer)); fs.writeFileSync(`${CACHE}/nav_F.bin`, Buffer.from(i16(Fr).buffer)); fs.writeFileSync(`${CACHE}/nav_W.bin`, Buffer.from(i16(W).buffer)); fs.writeFileSync(`${CACHE}/nav_C.bin`, Buffer.from(C.buffer)); fs.writeFileSync(`${CACHE}/nav_AO.bin`, Buffer.from(AO.buffer));
// --- context grids (4 m): ground + building tops
{ const res = 4, x0 = Math.floor(CTX_L.x0), z0 = Math.floor(CTX_L.z0), w = Math.floor((CTX_L.x1 - CTX_L.x0) / res), h = Math.floor((CTX_L.z1 - CTX_L.z0) / res); const g = new Float32Array(w * h), wat = new Uint8Array(w * h), wlv = new Float32Array(w * h).fill(-1e3);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = x0 + (i + 0.5) * res, z = z0 + (j + 0.5) * res, dk = Math.min(D.h - 1, Math.round(z - D.z0)) * D.w + Math.min(D.w - 1, Math.round(x - D.x0)); g[j * w + i] = demAt(x, z) + OFF; if (water[dk]) { wat[j * w + i] = 1; wlv[j * w + i] = wl[dk] + OFF; g[j * w + i] = wl[dk] + OFF - 0.3; } }
  const t = rasterLayers(['bldgctx', 'bldg2', 'bldg3'], null, { res, x0, z0, w, h }).top;
  fs.writeFileSync(`${CACHE}/ctx_G.bin`, Buffer.from(i16(g).buffer)); fs.writeFileSync(`${CACHE}/ctx_T.bin`, Buffer.from(i16(t).buffer)); fs.writeFileSync(`${CACHE}/ctx_W.bin`, Buffer.from(i16(wlv).buffer)); meta.ctx = { x0, z0, w, h, res }; }
// 1 m water level grid for the whole context (for the water mesh)
{ const o = new Int16Array(N1); for (let k = 0; k < N1; k++) o[k] = water[k] ? Math.round((wl[k] + OFF) * 100) : -32768; fs.writeFileSync(`${CACHE}/water1.bin`, Buffer.from(o.buffer)); meta.water1 = { x0: D.x0, z0: D.z0, w: D.w, h: D.h, res: 1 }; }
fs.writeFileSync(`${CACHE}/nav.json`, JSON.stringify(meta));
// debug image
{ const out = Buffer.alloc(NN * 3); let gmin = 1e9, gmax = -1e9; for (let k = 0; k < NN; k++) { if (G[k] < gmin) gmin = G[k]; if (G[k] > gmax) gmax = G[k]; }
  for (let k = 0; k < NN; k++) { const a = AO[k] / 255, t = (G[k] - gmin) / (gmax - gmin); let r = 255 * a * t, g = 255 * a * (0.4 + 0.5 * t), b = 255 * a * (1 - t); if (C[k] === 1) { r = 30; g = 90 + 100 * a; b = 200; } if (C[k] === 2) { r = 230 * a; g = 200 * a; b = 120 * a; } if (C[k] === 3) { r = g = b = 40; } out[k * 3] = r; out[k * 3 + 1] = g; out[k * 3 + 2] = b; }
  await sharp(out, { raw: { width: NW, height: NH, channels: 3 } }).png().toFile(`${CACHE}/nav_debug.png`); console.log('core grid', NW, NH, 'ground y range', gmin.toFixed(2), gmax.toFixed(2)); }
// sample profile across the river at z = -60 (west -> east)
{ const j = Math.round((-60 - R.z0) / NR); let s = ''; for (let x = -130; x <= 20; x += 5) { const i = Math.round((x - R.x0) / NR), k = j * NW + i; s += `${x}:${G[k].toFixed(1)}${C[k] === 1 ? 'w' + W[k].toFixed(1) : C[k] === 3 ? 'B' : C[k] === 2 ? 'r' : ''} `; } console.log('profile z=-60:', s); }
