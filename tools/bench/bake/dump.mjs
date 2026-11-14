// the city geometry as the app has it after loading: positions, normals and indices of every mesh in one set of arrays
import fs from 'node:fs';
import { b64bytes, inflateRaw } from '../../../app/js/util.js';
const A = new URL('../../../app/', import.meta.url).pathname;
async function pak(f) { const buf = await inflateRaw(b64bytes(new Uint8Array(fs.readFileSync(A + f)))); const dv = new DataView(buf), jl = dv.getUint32(4, true); return { json: JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl))), buf, base: 8 + jl }; }
for (const name of ['core', 'ctx']) {
  const p = await pak('d/' + name + '.txt'); let nv = 0, ni = 0; const kinds = {};
  for (const it of p.json.items) { nv += it.nv; ni += it.idx[1]; kinds[it.kind] = (kinds[it.kind] || 0) + it.idx[1] / 3; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni), meta = []; let vo = 0, io = 0;
  for (const it of p.json.items) {
    const b = it.bb, P = new Uint16Array(p.buf, p.base + it.pos[0], it.nv * 3), N = new Int8Array(p.buf, p.base + it.nor[0], it.nv * 3), I = it.i32 ? new Uint32Array(p.buf, p.base + it.idx[0], it.idx[1]) : new Uint16Array(p.buf, p.base + it.idx[0], it.idx[1]);
    const sx = (b[3] - b[0]) / 65535, sy = (b[4] - b[1]) / 65535, sz = (b[5] - b[2]) / 65535;
    for (let i = 0; i < it.nv; i++) { const o = (vo + i) * 3; pos[o] = b[0] + P[i * 3] * sx; pos[o + 1] = b[1] + P[i * 3 + 1] * sy; pos[o + 2] = b[2] + P[i * 3 + 2] * sz; const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; nor[o] = N[i * 3] / l; nor[o + 1] = N[i * 3 + 1] / l; nor[o + 2] = N[i * 3 + 2] / l; }
    for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    meta.push({ kind: it.kind, tex: it.tex || null, v0: vo, nv: it.nv }); vo += it.nv; io += I.length;
  }
  fs.writeFileSync(`data/${name}.pos`, Buffer.from(pos.buffer)); fs.writeFileSync(`data/${name}.nor`, Buffer.from(nor.buffer)); fs.writeFileSync(`data/${name}.idx`, Buffer.from(idx.buffer)); fs.writeFileSync(`data/${name}.json`, JSON.stringify(meta));
  console.log(name, 'items', p.json.items.length, 'verts', nv, 'tris', ni / 3, JSON.stringify(kinds), 'item keys', Object.keys(p.json.items[0]).join(','));
}
