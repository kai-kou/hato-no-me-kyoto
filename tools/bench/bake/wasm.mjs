import fs from 'node:fs';
const { instance } = await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/hato_bake.wasm'), {}); const w = instance.exports;
const rd = (f, T) => { const b = fs.readFileSync(f); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const pos = rd('data/core.pos', Float32Array), nor = rd('data/core.nor', Float32Array), idx = rd('data/core.idx', Uint32Array), nv = pos.length / 3;
const pp = w.alloc(pos.byteLength), pn = w.alloc(nor.byteLength), pi = w.alloc(idx.byteLength), po = w.alloc(nv);
new Float32Array(w.memory.buffer, pp, pos.length).set(pos); new Float32Array(w.memory.buffer, pn, nor.length).set(nor); new Uint32Array(w.memory.buffer, pi, idx.length).set(idx);
const t0 = performance.now(); const cast = w.bake_sky(pp, pn, nv, pi, idx.length, 0, 0, 4, 80, po); const s = (performance.now() - t0) / 1000;
console.log(JSON.stringify({ wasm: true, verts: nv, tris: idx.length / 3, rays_cast: cast, seconds: +s.toFixed(1), mrays_per_s: +(cast / s / 1e6).toFixed(2), memory_mb: Math.round(w.memory.buffer.byteLength / 1e6) }));
