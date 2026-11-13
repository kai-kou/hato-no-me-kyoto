// Stage 3: top-height rasters (building / furniture) over the core box, used for visibility + nav.
import fs from 'node:fs';
import sharp from 'sharp';
import { CACHE, CORE_L, loadLayer } from './cfg.mjs';
const RES_ = 0.25, RX0_ = Math.floor(CORE_L.x0) - 8, RZ0_ = Math.floor(CORE_L.z0) - 8, RW_ = Math.ceil((CORE_L.x1 - CORE_L.x0 + 16) / RES_), RH_ = Math.ceil((CORE_L.z1 - CORE_L.z0 + 16) / RES_);
export const RES = RES_, RX0 = RX0_, RZ0 = RZ0_, RW = RW_, RH = RH_;
export function rasterLayers(names, filter, spec) {
  const RES = spec ? spec.res : 0.25, RX0 = spec ? spec.x0 : RX0_, RZ0 = spec ? spec.z0 : RZ0_, RW = spec ? spec.w : RW_, RH = spec ? spec.h : RH_;
  const top = new Float32Array(RW * RH).fill(-1e3), bot = new Float32Array(RW * RH).fill(1e3);
  for (const name of names) { const L = loadLayer(name);
    for (const g of L.groups) { const p = g.pos, ix = g.idx;
      for (let t = 0; t < ix.length; t += 3) {
        if (filter && !filter(L.features[g.fid[ix[t]]], name)) continue;
        const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        const ax = (p[a] - RX0) / RES, az = (p[a + 2] - RZ0) / RES, bx = (p[b] - RX0) / RES, bz = (p[b + 2] - RZ0) / RES, cx = (p[c] - RX0) / RES, cz = (p[c + 2] - RZ0) / RES, ay = p[a + 1], by = p[b + 1], cy = p[c + 1];
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(RW - 1, Math.ceil(Math.max(ax, bx, cx))), z0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), z1 = Math.min(RH - 1, Math.ceil(Math.max(az, bz, cz)));
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) < 1e-9) { // vertical triangle: stamp its edges
          const st = (x, z, y) => { const i = Math.round(x), j = Math.round(z); if (i < 0 || j < 0 || i >= RW || j >= RH) return; const k = j * RW + i; if (y > top[k]) top[k] = y; if (y < bot[k]) bot[k] = y; };
          const edge = (x0, z0, y0, x1, z1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0))); for (let s = 0; s <= n; s++) { const f = s / n; st(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, y0 + (y1 - y0) * f); } };
          edge(ax, az, ay, bx, bz, by); edge(bx, bz, by, cx, cz, cy); edge(cx, cz, cy, ax, az, ay); continue;
        }
        for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
          const w0 = ((bz - cz) * (i - cx) + (cx - bx) * (j - cz)) / den, w1 = ((cz - az) * (i - cx) + (ax - cx) * (j - cz)) / den, w2 = 1 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue; const y = w0 * ay + w1 * by + w2 * cy, k = j * RW + i; if (y > top[k]) top[k] = y; if (y < bot[k]) bot[k] = y;
        }
      }
    }
  }
  return { top, bot };
}
if (process.argv[1].endsWith('raster.mjs')) {
  const b = rasterLayers(['bldg3', 'bldg2', 'bldgctx']); fs.writeFileSync(`${CACHE}/top_bldg.bin`, Buffer.from(b.top.buffer)); fs.writeFileSync(`${CACHE}/bot_bldg.bin`, Buffer.from(b.bot.buffer));
  const f = rasterLayers(['frn', 'brid']); fs.writeFileSync(`${CACHE}/top_frn.bin`, Buffer.from(f.top.buffer));
  const r = rasterLayers(['tran']); fs.writeFileSync(`${CACHE}/top_tran.bin`, Buffer.from(r.top.buffer));
  fs.writeFileSync(`${CACHE}/raster.json`, JSON.stringify({ res: RES, x0: RX0, z0: RZ0, w: RW, h: RH }));
  // debug image: building height (grey), furniture (orange), roads (blue)
  const out = Buffer.alloc(RW * RH * 3); let occ = 0, minB = 1e9, roadH = [];
  for (let k = 0; k < RW * RH; k++) { let R = 20, G = 24, B = 30; if (r.top[k] > -900) { R = 60; G = 110; B = 220; roadH.push(r.top[k]); } if (b.top[k] > -900) { const v = Math.min(255, 60 + (b.top[k] - b.bot[k]) * 9); R = G = B = v; occ++; if (b.bot[k] < minB) minB = b.bot[k]; } if (f.top[k] > -900 && b.top[k] < -900) { R = 255; G = 150; B = 30; } out[k * 3] = R; out[k * 3 + 1] = G; out[k * 3 + 2] = B; }
  await sharp(out, { raw: { width: RW, height: RH, channels: 3 } }).resize(Math.round(RW / 2)).png().toFile(`${CACHE}/raster_debug.png`);
  roadH.sort((x, y) => x - y); console.log('raster', RW, RH, 'bldg cells', occ, 'min bldg base y', minB.toFixed(2), 'road y range', roadH[0]?.toFixed(2), roadH[roadH.length >> 1]?.toFixed(2), roadH[roadH.length - 1]?.toFixed(2));
}
