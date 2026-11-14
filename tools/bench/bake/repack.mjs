// Put the ray-traced sky visibility into the alpha of the vertex colours of d/core.txt (where the app reads its ambient occlusion from).
import fs from 'node:fs'; import zlib from 'node:zlib';
import { b64bytes, inflateRaw } from '../../../app/js/util.js';
const [, , src, sky, dst] = process.argv;
const buf = Buffer.from(await inflateRaw(b64bytes(new Uint8Array(fs.readFileSync(src))))); const jl = buf.readUInt32LE(4), json = JSON.parse(buf.subarray(8, 8 + jl).toString('utf8')), base = 8 + jl;
const S = fs.readFileSync(sky); let vo = 0, oldSum = 0, newSum = 0, n = 0; const hist = { old: new Array(8).fill(0), neu: new Array(8).fill(0) };
for (const it of json.items) { const o = base + it.col[0];
  for (let i = 0; i < it.nv; i++) { const v = S[vo + i] / 255, a = Math.round(255 * Math.min(1, 0.2 + 0.8 * Math.pow(v, 0.8))), old = buf[o + i * 4 + 3];
    hist.old[old >> 5]++; hist.neu[a >> 5]++; oldSum += old; newSum += a; n++; buf[o + i * 4 + 3] = a; }
  vo += it.nv; }
const out = zlib.deflateRawSync(buf, { level: 9 }); fs.writeFileSync(dst, out.toString('base64'));
console.log(JSON.stringify({ verts: n, mean_old: +(oldSum / n / 255).toFixed(3), mean_new: +(newSum / n / 255).toFixed(3), hist_old_pct: hist.old.map(x => +(100 * x / n).toFixed(1)), hist_new_pct: hist.neu.map(x => +(100 * x / n).toFixed(1)), bytes_old: fs.statSync(src).size, bytes_new: fs.statSync(dst).size }));
