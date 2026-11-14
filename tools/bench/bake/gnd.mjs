import fs from 'node:fs'; import zlib from 'node:zlib'; import { b64bytes, inflateRaw } from '../../../app/js/util.js';
const [, , mode, dst] = process.argv; const src = new URL('../../../app/d/nav.txt', import.meta.url).pathname;
const buf = Buffer.from(await inflateRaw(b64bytes(new Uint8Array(fs.readFileSync(src))))); const jl = buf.readUInt32LE(4), json = JSON.parse(buf.subarray(8, 8 + jl).toString('utf8')), base = 8 + jl, c = json.core, N = c.w * c.h;
const G = new Int16Array(buf.buffer, buf.byteOffset + base + json.grids.nav_G[0], N), W = new Int16Array(buf.buffer.slice(buf.byteOffset + base + json.grids.nav_W[0], buf.byteOffset + base + json.grids.nav_W[0] + N * 2)), C = buf.subarray(base + json.grids.nav_C[0], base + json.grids.nav_C[0] + N), AO = buf.subarray(base + json.grids.nav_AO[0], base + json.grids.nav_AO[0] + N);
if (mode === 'dump') { const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const k = j * c.w + i; pos[k * 3] = c.x0 + (i + 0.5) * c.res; pos[k * 3 + 1] = Math.max(G[k], C[k] === 1 ? W[k] : -1e5) / 100 + 0.02; pos[k * 3 + 2] = c.z0 + (j + 0.5) * c.res; nor[k * 3 + 1] = 1; }
  fs.writeFileSync('data/gnd.pos', Buffer.from(pos.buffer)); fs.writeFileSync('data/gnd.nor', Buffer.from(nor.buffer)); console.log('cells', N, 'class counts', [0, 1, 2, 3, 4].map(v => C.reduce((a, x) => a + (x === v), 0)).join(',')); }
else { const S = fs.readFileSync('data/gnd64.u8'); let o = 0, n = 0; const old = Buffer.from(AO);
  for (let k = 0; k < N; k++) { o += AO[k]; if (C[k] !== 3) AO[k] = Math.round(255 * Math.min(1, 0.25 + 0.75 * S[k] / 255)); n += AO[k]; }
  fs.writeFileSync(dst, zlib.deflateRawSync(buf, { level: 9 }).toString('base64')); fs.writeFileSync('data/ao_old.pgm', Buffer.concat([Buffer.from(`P5\n${c.w} ${c.h}\n255\n`), old])); fs.writeFileSync('data/ao_new.pgm', Buffer.concat([Buffer.from(`P5\n${c.w} ${c.h}\n255\n`), AO]));
  console.log(JSON.stringify({ cells: N, mean_old: +(o / N / 255).toFixed(3), mean_new: +(n / N / 255).toFixed(3) })); }
