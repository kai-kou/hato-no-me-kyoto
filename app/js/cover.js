// Ground cover near the subject: pebbles and grass tufts as real geometry, so the river bank keeps its relief at pigeon height.
// Everything is placed from world-anchored hash cells, so the same stone is in the same place whenever the subject comes back.
import * as THREE from './three.module.min.js';
import { cityMaterial } from './world.js';
import { clamp } from './util.js';

const hash = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function vnoise(x, z, seed) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return (hash(i, j, seed) * (1 - u) + hash(i + 1, j, seed) * u) * (1 - v) + (hash(i, j + 1, seed) * (1 - u) + hash(i + 1, j + 1, seed) * u) * v; }

function pebbleGeometry(detail) { // a lumpy, flattened dome; colour alpha = occlusion (dark where it meets the ground)
  const src = new THREE.IcosahedronGeometry(1, detail), P = src.attributes.position, pos = [], nor = [], col = [], v = new THREE.Vector3();
  for (let t = 0; t < P.count; t += 3) { if ((P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3 < -0.42) continue;
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(P, t + k).normalize(); const nx = v.x, ny = v.y, nz = v.z, r = 1 + 0.44 * (hash(Math.round(nx * 40), Math.round(ny * 40), Math.round(nz * 40)) - 0.5);
      pos.push(nx * r, ny * r * 0.62, nz * r); nor.push(nx, ny * 1.35, nz); col.push(1, 1, 1, 0.40 + 0.60 * sm(-0.35, 0.55, ny)); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.normalizeNormals(); src.dispose(); return g;
}
function tuftGeometry(blades) { // a few curved blades; colour darkens toward the root, alpha doubles as sway weight
  const pos = [], nor = [], col = [], idx = []; let nv = 0;
  for (let b = 0; b < blades; b++) { const a = hash(b, 3, 11) * 6.2832, lean = 0.25 + 0.65 * hash(b, 5, 11), h = 0.042 + 0.052 * hash(b, 7, 11), w = 0.0013 + 0.0012 * hash(b, 9, 11), ox = (hash(b, 2, 13) - 0.5) * 0.034, oz = (hash(b, 4, 13) - 0.5) * 0.034, dx = Math.cos(a), dz = Math.sin(a);
    for (let s = 0; s <= 2; s++) { const t = s / 2, y = h * t * (1 - 0.2 * lean * t), off = lean * h * t * t * 0.9, ww = w * (1 - t * 0.82), cx = ox + dx * off, cz = oz + dz * off;
      for (const sd of [-1, 1]) { pos.push(cx - dz * ww * sd, y, cz + dx * ww * sd); nor.push(dx * 0.3, 1, dz * 0.3); col.push(0.50 + 0.50 * t, 0.56 + 0.44 * t, 0.46 + 0.34 * t, 0.5 + 0.5 * t); nv++; } }
    const o = nv - 6; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4, o + 3, o + 5, o + 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.normalizeNormals(); return g;
}

export class Cover {
  constructor(app) {
    const { Q, scene, world } = app, k = Q.cover; this.world = world; this.nav = world.nav;
    this.Rp = k >= 1 ? 4.2 : 3.3; this.cp = k >= 1 ? 0.07 : 0.082; this.Rg = k >= 1 ? 3.2 : 2.5; this.cg = k >= 1 ? 0.05 : 0.062;
    this.maxP = Math.ceil(Math.PI * this.Rp * this.Rp / (this.cp * this.cp) * 0.78); this.maxG = Math.ceil(Math.PI * this.Rg * this.Rg / (this.cg * this.cg) * 0.95);
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m; };
    this.peb = mk(pebbleGeometry(k >= 1 ? 1 : 0), cityMaterial('peb', Q, { rough: 0.88, env: 0.4 }), this.maxP);
    const gm = cityMaterial('grass', Q, { rough: 0.8, env: 0.35 }); gm.side = THREE.DoubleSide; this.gr = mk(tuftGeometry(k >= 1 ? 9 : 7), gm, this.maxG);
    this.cx = 1e9; this.cz = 1e9; this.hasG = false;
  }
  // (x, z): the point on the ground the view is about
  update(x, z) { const g = !!this.world.gmap; if (g === this.hasG && Math.hypot(x - this.cx, z - this.cz) < 0.25) return; this.hasG = g; this.cx = x; this.cz = z; this._pebbles(x, z); this._grass(x, z); }
  _ok(x, z, slope) { const W = this.world; return W.bankAt(x, z) > 0.5 && this.nav.cls(x, z) === 0 && W.slopeAt(x, z) < slope; }
  _pebbles(cx, cz) {
    const W = this.world, m = this.peb, M = m.instanceMatrix.array, C = m.instanceColor.array, R = this.Rp, cs = this.cp; let n = 0;
    for (let j = Math.floor((cz - R) / cs), j1 = Math.ceil((cz + R) / cs); j <= j1; j++) for (let i = Math.floor((cx - R) / cs), i1 = Math.ceil((cx + R) / cs); i <= i1; i++) {
      if (n >= this.maxP || hash(i, j, 1) > 0.72) continue; const x = (i + 0.15 + 0.7 * hash(i, j, 2)) * cs, z = (j + 0.15 + 0.7 * hash(i, j, 3)) * cs, d = Math.hypot(x - cx, z - cz); if (d > R || !this._ok(x, z, 0.22)) continue;
      const ge = W.greenAt(x, z); if (ge > 0.02 && hash(i, j, 4) < sm(0.02, 0.05, ge) * 0.92) continue;
      const fade = 1 - sm(R * 0.7, R, d), q = hash(i, j, 6), r = (hash(i, j, 5) > 0.94 ? 0.013 + 0.013 * q : 0.0032 + 0.0078 * q * Math.sqrt(q)) * fade; if (r < 0.0012) continue;
      const th = hash(i, j, 7) * 6.2832, c = Math.cos(th), s = Math.sin(th), sx = r * (0.8 + 0.55 * hash(i, j, 8)), sz = r * (0.8 + 0.55 * hash(i, j, 9)), sy = r * (0.7 + 0.6 * hash(i, j, 10)), o = n * 16;
      M[o] = c * sx; M[o + 1] = 0; M[o + 2] = -s * sx; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = sy; M[o + 6] = 0; M[o + 7] = 0; M[o + 8] = s * sz; M[o + 9] = 0; M[o + 10] = c * sz; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = W.groundY(x, z) - sy * 0.1; M[o + 14] = z; M[o + 15] = 1;
      const L = 0.16 + 0.36 * hash(i, j, 11), w = hash(i, j, 12); C[n * 3] = L * (1.0 + 0.10 * w); C[n * 3 + 1] = L * (0.97 + 0.04 * w); C[n * 3 + 2] = L * (0.90 - 0.07 * w); n++; }
    m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
  }
  _grass(cx, cz) {
    const W = this.world, m = this.gr, M = m.instanceMatrix.array, C = m.instanceColor.array, R = this.Rg, cs = this.cg; let n = 0;
    if (W.gmap) for (let j = Math.floor((cz - R) / cs), j1 = Math.ceil((cz + R) / cs); j <= j1; j++) for (let i = Math.floor((cx - R) / cs), i1 = Math.ceil((cx + R) / cs); i <= i1; i++) {
      if (n >= this.maxG) continue; const x = (i + hash(i, j, 21)) * cs, z = (j + hash(i, j, 22)) * cs, d = Math.hypot(x - cx, z - cz); if (d > R) continue;
      const p = sm(0.012, 0.045, W.greenAt(x, z)); if (p <= 0 || hash(i, j, 23) > p * 0.93 || !this._ok(x, z, 0.75)) continue;
      const fade = 1 - sm(R * 0.68, R, d), sc = (0.6 + 0.8 * hash(i, j, 25)) * (0.75 + 0.55 * vnoise(x * 2.1, z * 2.1, 32)) * fade * (0.55 + 0.45 * p); if (sc < 0.1) continue;
      const th = hash(i, j, 26) * 6.2832, c = Math.cos(th) * sc, s = Math.sin(th) * sc, sy = sc * (0.8 + 0.5 * hash(i, j, 27)), o = n * 16;
      M[o] = c; M[o + 1] = 0; M[o + 2] = -s; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = sy; M[o + 6] = 0; M[o + 7] = 0; M[o + 8] = s; M[o + 9] = 0; M[o + 10] = c; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = W.groundY(x, z) - 0.003; M[o + 14] = z; M[o + 15] = 1;
      const k = hash(i, j, 28), dry = sm(0.48, 0.80, vnoise(x * 0.55, z * 0.55, 31) * 0.65 + hash(i, j, 24) * 0.35) * 0.62;
      C[n * 3] = (0.085 + 0.135 * k) * (1 - dry) + 0.42 * dry; C[n * 3 + 1] = (0.150 + 0.160 * k) * (1 - dry) + 0.37 * dry; C[n * 3 + 2] = (0.030 + 0.040 * k) * (1 - dry) + 0.16 * dry; n++; }
    m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
  }
}
