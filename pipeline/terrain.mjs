// Stage 2: mosaics of GSI DEM + GSI seamless photo (and the PLATEAU ortho, for reference) resampled into the local metric frame.
import fs from 'node:fs';
import sharp from 'sharp';
import { ORIGIN, DL, CACHE, CORE_L, CTX_L, enu } from './cfg.mjs';
const G = DL + '/gsi';
const dLon = enu.ll(ORIGIN.lon + 1e-4, ORIGIN.lat)[0] / 1e-4, dLat = enu.ll(ORIGIN.lon, ORIGIN.lat + 1e-4)[1] / 1e-4; // metres per degree
export const toLL = (x, z) => [ORIGIN.lon + x / dLon, ORIGIN.lat + (-z) / dLat];
const merc = (lon, lat, zoom) => { const n = 2 ** zoom; return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n]; };

async function mosaic(dir, zoom, ext) {
  const files = fs.readdirSync(`${G}/${dir}`).filter(f => f.startsWith(zoom + '_')); const xs = files.map(f => +f.split('_')[1]), ys = files.map(f => +f.split('_')[2].split('.')[0]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = (Math.max(...xs) - x0 + 1) * 256, h = (Math.max(...ys) - y0 + 1) * 256, buf = Buffer.alloc(w * h * 3);
  for (const f of files) { const tx = +f.split('_')[1] - x0, ty = +f.split('_')[2].split('.')[0] - y0; let raw; try { raw = await sharp(`${G}/${dir}/${f}`).removeAlpha().raw().toBuffer(); } catch (e) { continue; } for (let r = 0; r < 256; r++) raw.copy(buf, ((ty * 256 + r) * w + tx * 256) * 3, r * 768, r * 768 + 768); }
  return { buf, w, h, x0, y0, zoom, px(lon, lat) { const [mx, my] = merc(lon, lat, zoom); return [(mx - x0) * 256, (my - y0) * 256]; } };
}
const demVal = (m, i) => { const v = m.buf[i * 3] * 65536 + m.buf[i * 3 + 1] * 256 + m.buf[i * 3 + 2]; return v === 8388608 ? NaN : (v < 8388608 ? v : v - 16777216) * 0.01; };
function sampleDem(m, lon, lat) { const [px, py] = m.px(lon, lat), x = Math.floor(px - 0.5), y = Math.floor(py - 0.5), fx = px - 0.5 - x, fy = py - 0.5 - y; if (x < 0 || y < 0 || x >= m.w - 1 || y >= m.h - 1) return NaN; const a = demVal(m, y * m.w + x), b = demVal(m, y * m.w + x + 1), c = demVal(m, (y + 1) * m.w + x), d = demVal(m, (y + 1) * m.w + x + 1); if (a !== a || b !== b || c !== c || d !== d) return [a, b, c, d].find(v => v === v) ?? NaN; return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy; }
function sampleRGB(m, lon, lat, out, o) { const [px, py] = m.px(lon, lat), x = Math.max(0, Math.min(m.w - 2, Math.floor(px - 0.5))), y = Math.max(0, Math.min(m.h - 2, Math.floor(py - 0.5))), fx = Math.min(1, Math.max(0, px - 0.5 - x)), fy = Math.min(1, Math.max(0, py - 0.5 - y)); for (let c = 0; c < 3; c++) { const i = (y * m.w + x) * 3 + c; out[o + c] = (m.buf[i] * (1 - fx) + m.buf[i + 3] * fx) * (1 - fy) + (m.buf[i + m.w * 3] * (1 - fx) + m.buf[i + m.w * 3 + 3] * fx) * fy; } }

const dem1 = await mosaic('dem1a', 17), dem5 = await mosaic('dem5a', 15), ortho = await mosaic('ortho', 18), gsi = await mosaic('gsiphoto', 18);
// DEM grid over context at 1 m (orthometric metres)
const DX = Math.floor(CTX_L.x0), DZ = Math.floor(CTX_L.z0), DW = Math.ceil(CTX_L.x1) - DX + 1, DH = Math.ceil(CTX_L.z1) - DZ + 1, dem = new Float32Array(DW * DH), demRaw = new Float32Array(DW * DH); let na = 0;
for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) { const [lon, lat] = toLL(DX + i, DZ + j); let v = sampleDem(dem1, lon, lat); demRaw[j * DW + i] = v; if (v !== v) { v = sampleDem(dem5, lon, lat); na++; } dem[j * DW + i] = v; }
fs.writeFileSync(`${CACHE}/dem.bin`, Buffer.from(dem.buffer)); fs.writeFileSync(`${CACHE}/dem1raw.bin`, Buffer.from(demRaw.buffer)); fs.writeFileSync(`${CACHE}/dem.json`, JSON.stringify({ x0: DX, z0: DZ, w: DW, h: DH, res: 1 }));
let mn = 1e9, mx = -1e9, nn = 0; for (const v of dem) { if (v === v) { if (v < mn) mn = v; if (v > mx) mx = v; } else nn++; } console.log('dem', DW, DH, 'min', mn, 'max', mx, 'filled from 5m', na, 'still NaN', nn);
async function orthoOut(name, box, res, src) { const w = Math.round((box.x1 - box.x0) / res), h = Math.round((box.z1 - box.z0) / res), out = Buffer.alloc(w * h * 3); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const [lon, lat] = toLL(box.x0 + (i + 0.5) * res, box.z0 + (j + 0.5) * res); sampleRGB(src, lon, lat, out, (j * w + i) * 3); } await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${CACHE}/${name}.png`); console.log(name, w, h); }
// ground photo: GSI seamless photo (true colour). The PLATEAU ortho tiles for this area carry only two distinct channels (G == B), so they are kept for reference only.
await orthoOut('ortho_core', CORE_L, 0.25, gsi);
await orthoOut('ortho_ctx', CTX_L, 1, gsi);
await orthoOut('plateau_core', CORE_L, 0.25, ortho);
// hillshade preview of DEM in core for inspection
{ const b = CORE_L, res = 0.5, w = Math.round((b.x1 - b.x0) / res), h = Math.round((b.z1 - b.z0) / res), out = Buffer.alloc(w * h * 3); const at = (x, z) => { const i = Math.round(x - DX), j = Math.round(z - DZ); return dem[j * DW + i]; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = b.x0 + i * res, z = b.z0 + j * res, e = at(x, z), sx = (at(x + 1, z) - at(x - 1, z)) / 2, sz = (at(x, z + 1) - at(x, z - 1)) / 2; const sh = Math.max(0, Math.min(1, 0.6 - sx * 0.9 + sz * 0.9)); const t = Math.max(0, Math.min(1, (e - 34) / 12)); out[(j * w + i) * 3] = 255 * sh * (0.4 + 0.6 * t); out[(j * w + i) * 3 + 1] = 255 * sh * 0.8; out[(j * w + i) * 3 + 2] = 255 * sh * (1 - 0.6 * t); }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toFile(`${CACHE}/dem_core_shade.png`); }

// far terrain (10 m DEM, z12) + photo, resampled to a 24 km square at 32 m
{ const far = await mosaic('demfar', 12), ph = await mosaic('photofar', 12); const S = 12000, res = 32, n = Math.round(2 * S / res), h = new Float32Array(n * n), rgb = Buffer.alloc(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const [lon, lat] = toLL(-S + (i + 0.5) * res, -S + (j + 0.5) * res); const v = sampleDem(far, lon, lat); h[j * n + i] = v === v ? v : 0; sampleRGB(ph, lon, lat, rgb, (j * n + i) * 3); }
  fs.writeFileSync(`${CACHE}/demfar.bin`, Buffer.from(h.buffer)); fs.writeFileSync(`${CACHE}/demfar.json`, JSON.stringify({ x0: -S, z0: -S, n, res })); await sharp(rgb, { raw: { width: n, height: n, channels: 3 } }).png().toFile(`${CACHE}/photofar.png`);
  let mx = 0; for (const v of h) if (v > mx) mx = v; console.log('far', n, 'max elev', mx); }
