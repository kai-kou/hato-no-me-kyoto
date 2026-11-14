import fs from 'node:fs';
import { b64bytes, inflateRaw } from '../../app/js/util.js';
const A = new URL('../../app/', import.meta.url).pathname;
const load = async f => { const { instance } = await WebAssembly.instantiate(fs.readFileSync(f), {}); instance.exports.b64_init(); return instance.exports; };
const W = await load('rust/target/wasm32-unknown-unknown/release/hato_bench.wasm'), WS = await load('rust/target_simd/wasm32-unknown-unknown/release/hato_bench.wasm');
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
const time = (fn, n) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); } return med(t); };
const out = { node: process.version, files: {} };
for (const f of ['d/core.txt', 'd/ctx.txt', 't/m.txt', 'd/nav.txt', 't/b.txt']) {
  const src = new Uint8Array(fs.readFileSync(A + f)); let ref;
  const js = time(() => { ref = b64bytes(src); }, 7);
  const wasmOf = w => time(() => { const p = w.alloc(src.length), q = w.alloc(src.length); new Uint8Array(w.memory.buffer, p, src.length).set(src); const n = w.b64_decode(p, src.length, q); const r = new Uint8Array(w.memory.buffer, q, n).slice(); if (r.length !== ref.length || r[1000] !== ref[1000] || r[r.length - 1] !== ref[ref.length - 1]) throw new Error('mismatch'); }, 7);
  const wasm = wasmOf(W), wasmSimd = wasmOf(WS);
  const native = typeof Uint8Array.fromBase64 === 'function' ? time(() => Uint8Array.fromBase64(new TextDecoder('latin1').decode(src).trim()), 5) : null;
  const buf = time(() => Buffer.from(src.toString ? Buffer.from(src).toString('latin1') : '', 'base64'), 5);
  let infl = null; if (f.startsWith('d/')) { const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); await inflateRaw(ref); t.push(performance.now() - t0); } infl = med(t); }
  out.files[f] = { mb_text: +(src.length / 1e6).toFixed(2), b64_js_ms: +js.toFixed(1), b64_wasm_ms: +wasm.toFixed(1), b64_wasm_simd_ms: +wasmSimd.toFixed(1), fromBase64_ms: native && +native.toFixed(1), node_buffer_ms: +buf.toFixed(1), inflate_native_ms: infl && +infl.toFixed(1) };
}
// pose kernel: 93 birds x 15 bones
const N = 93, inp = new Float32Array(N * 32).map((_, i) => Math.sin(i * 0.37) * 1.2), outJ = new Float32Array(N * 15 * 8);
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function poseJS() { let q1x, q1y, q1z, q1w, q2x, q2y, q2z, q2w;
  for (let i = 0; i < N; i++) { let px = 0, py = 0, pz = 0, pw = 1;
    for (let b = 0; b < 15; b++) { const a1 = AX[b % 3], a2 = AX[(b + 1) % 3]; let h = inp[i * 32 + b * 2] * 0.5, s = Math.fround(Math.sin(h)); q1x = a1[0] * s; q1y = a1[1] * s; q1z = a1[2] * s; q1w = Math.cos(h); h = inp[i * 32 + b * 2 + 1] * 0.5; s = Math.sin(h); q2x = a2[0] * s; q2y = a2[1] * s; q2z = a2[2] * s; q2w = Math.cos(h);
      const mx = q1x * q2w + q1w * q2x + q1y * q2z - q1z * q2y, my = q1y * q2w + q1w * q2y + q1z * q2x - q1x * q2z, mz = q1z * q2w + q1w * q2z + q1x * q2y - q1y * q2x, mw = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z;
      const x = px * mw + pw * mx + py * mz - pz * my, y = py * mw + pw * my + pz * mx - px * mz, z = pz * mw + pw * mz + px * my - py * mx, w = pw * mw - px * mx - py * my - pz * mz;
      const vx = 0.01 * b, vy = 0.02, vz = 0.03, ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
      const o = (i * 15 + b) * 8; outJ[o] = x; outJ[o + 1] = y; outJ[o + 2] = z; outJ[o + 3] = w; outJ[o + 4] = ix * w + iw * -x + iy * -z - iz * -y; outJ[o + 5] = iy * w + iw * -y + iz * -x - ix * -z; outJ[o + 6] = iz * w + iw * -z + ix * -y - iy * -x; outJ[o + 7] = 1;
      if (b % 4 !== 3) { px = x; py = y; pz = z; pw = w; } else { px = 0; py = 0; pz = 0; pw = 1; } } } }
const pin = W.alloc(N * 32 * 4), pout = W.alloc(N * 15 * 8 * 4); new Float32Array(W.memory.buffer, pin, N * 32).set(inp);
const dataTex = new Float32Array(N * 15 * 8);
const poseW = () => { W.pose_kernel(N, pin, pout); dataTex.set(new Float32Array(W.memory.buffer, pout, N * 15 * 8)); };   // the result has to be copied out to the texture's array
for (let i = 0; i < 3000; i++) { poseJS(); poseW(); }
const R = 20000; let t0 = performance.now(); for (let i = 0; i < R; i++) poseJS(); const tj = (performance.now() - t0) / R; t0 = performance.now(); for (let i = 0; i < R; i++) poseW(); const tw = (performance.now() - t0) / R;
let dmax = 0; const wv = new Float32Array(W.memory.buffer, pout, N * 15 * 8); for (let i = 0; i < wv.length; i++) dmax = Math.max(dmax, Math.abs(wv[i] - outJ[i]));
out.pose = { birds: N, bones: 15, js_us_per_frame: +(tj * 1000).toFixed(1), wasm_us_per_frame: +(tw * 1000).toFixed(1), max_abs_diff: dmax };
console.log(JSON.stringify(out, null, 1));
