// Scenery generated in code where PLATEAU has no geometry: trees (positions from PLATEAU vegetation + the Kamo east-bank row seen in the aerial photo)
// and the Kamo bridges (footprints read from the aerial photo, heights from the terrain model).
import * as THREE from './three.module.min.js';
import { U, cityMaterial } from './world.js';
import { patchMaterial, GLSL_NOISE, rng, clamp, lerp, TAU } from './util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ geometry accumulators
class Acc {
  constructor(leaf) { this.p = []; this.n = []; this.c = []; this.i = []; this.leaf = leaf; if (leaf) { this.uv = []; this.par = []; } this.nv = 0; }
  tube(path, sides, ao = 1) { // path: [{p, r}]
    const base = this.nv, up = V3(0, 1, 0), a = V3(), b = V3(), d = V3(), q = V3();
    for (let k = 0; k < path.length; k++) { const P = path[k].p, r = path[k].r; d.copy(path[Math.min(k + 1, path.length - 1)].p).sub(path[Math.max(k - 1, 0)].p).normalize(); a.crossVectors(d, Math.abs(d.y) > 0.95 ? V3(1, 0, 0) : up).normalize(); b.crossVectors(d, a).normalize();
      for (let s = 0; s < sides; s++) { const t = s / sides * TAU; q.copy(a).multiplyScalar(Math.cos(t)).addScaledVector(b, Math.sin(t)); this.p.push(P.x + q.x * r, P.y + q.y * r, P.z + q.z * r); this.n.push(q.x, q.y, q.z); this.c.push(1, 1, 1, ao * (k === 0 ? 0.6 : 1)); this.nv++; } }
    for (let k = 0; k < path.length - 1; k++) for (let s = 0; s < sides; s++) { const i0 = base + k * sides + s, i1 = base + k * sides + (s + 1) % sides, j0 = i0 + sides, j1 = i1 + sides; this.i.push(i0, j0, i1, i1, j0, j1); }
  }
  box(x0, y0, z0, x1, y1, z1, ao = 1, R = null) { // axis-aligned box, optionally transformed by R(v)
    const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], F = [[0, 3, 2, 1, 0, 0, -1], [4, 5, 6, 7, 0, 0, 1], [0, 4, 7, 3, -1, 0, 0], [1, 2, 6, 5, 1, 0, 0], [3, 7, 6, 2, 0, 1, 0], [0, 1, 5, 4, 0, -1, 0]], v = V3(), n = V3();
    for (const f of F) { const b = this.nv; for (let k = 0; k < 4; k++) { v.set(...c[f[k]]); n.set(f[4], f[5], f[6]); if (R) R(v, n); this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.c.push(1, 1, 1, ao * (f[5] < 0 ? 0.55 : 1)); this.nv++; } this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  }
  card(C, u, v, su, sv, N, col, ao, seed, kind, sway0, sway1) { const b = this.nv, P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, c] of P) { this.p.push(C.x + u.x * a * su + v.x * c * sv, C.y + u.y * a * su + v.y * c * sv, C.z + u.z * a * su + v.z * c * sv); this.n.push(N.x, N.y, N.z); this.c.push(col[0], col[1], col[2], ao); this.uv.push(a * 0.5 + 0.5, c * 0.5 + 0.5); this.par.push(seed, kind, c < 0 ? sway0 : sway1); this.nv++; }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  geometry() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 4)); if (this.leaf) { g.setAttribute('aLuv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('aPar', new THREE.Float32BufferAttribute(this.par, 3)); } g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
}

// ------------------------------------------------------------------ leaves
const LEAF_V = `attribute vec2 aLuv; attribute vec3 aPar; varying vec2 vLuv; flat varying vec3 vPar; varying vec3 vWPos; uniform float uTime; uniform vec2 uWind;`;
const LEAF_VB = `{ float sw = aPar.z; float ph = uTime * 1.5 + position.x * 0.7 + position.z * 0.55 + aPar.x * 6.0; transformed.xz += uWind * (sin(ph) * 0.6 + sin(ph * 2.7 + 1.3) * 0.25 + 0.3) * sw * 0.085; transformed.y += sin(ph * 1.9) * sw * 0.014; vLuv = aLuv; vPar = aPar; }`;
const LEAF_F = `varying vec2 vLuv; flat varying vec3 vPar; varying vec3 vWPos; uniform vec3 uSunDir, uSunCol; uniform float uSunI; uniform float uNight; uniform sampler2D uLampTex; uniform vec4 uLampRect; uniform vec3 uLampCol;
${GLSL_NOISE}
float leafMask(vec2 uv, float seed, float kind, out float tone){
  float nx = kind > 2.5 ? 4.0 : (kind > 0.5 && kind < 1.5 ? 5.0 : 3.0), ny = kind > 2.5 ? 4.0 : (kind > 0.5 && kind < 1.5 ? 2.0 : 3.0);
  vec2 g = uv * vec2(nx, ny), id = floor(g), f = fract(g) - 0.5; float h = h21(id + seed * 37.0); tone = h;
  float a = (kind > 0.5 && kind < 1.5) ? 1.5708 + (h - 0.5) * 0.9 : h * 6.2832; f += (vec2(h21(id + seed + 3.1), h21(id + seed + 7.7)) - 0.5) * 0.28;
  vec2 r = vec2(cos(a) * f.x + sin(a) * f.y, -sin(a) * f.x + cos(a) * f.y);
  float L = (kind > 0.5 && kind < 1.5) ? 0.47 : 0.43, W = (kind > 0.5 && kind < 1.5) ? 0.085 : 0.21; float x = r.x / L, w = W * (1.0 - x * x);
  float pres = kind > 2.5 ? 0.06 : (kind > 1.5 ? 0.62 : (kind > 0.5 ? 0.10 : 0.16));
  float m = step(abs(x), 1.0) * step(abs(r.y), w) * step(pres, h21(id + seed * 11.0));
  float fw = max(fwidth(uv.x), fwidth(uv.y)) * nx; float lod = ss(0.35, 1.1, fw); // far away: stable stochastic coverage instead of sub-pixel leaves
  return mix(m, step(kind > 2.5 ? 0.25 : 0.55, h21(floor(uv * 2.0) + seed * 5.0)), lod);
}`;
const LEAF_FA = `{ float tone; float m = leafMask(vLuv, vPar.x, vPar.y, tone); if (m < 0.5) discard; vec3 lc = vColor.rgb * (0.72 + 0.56 * tone); lc = mix(lc, lc.grb * vec3(0.9, 1.0, 0.6), step(0.86, tone) * 0.35); diffuseColor.rgb = lc * mix(0.42, 1.0, vColor.a); }`;
const LEAF_FE = `{ vec3 vd = normalize(vWPos - cameraPosition); totalEmissiveRadiance += diffuseColor.rgb * uSunCol * uSunI * 0.16 * ss(-0.1, 0.8, dot(vd, uSunDir)); }
  { vec4 lt = texture2D(uLampTex, (vWPos.xz - uLampRect.xy) * uLampRect.zw); totalEmissiveRadiance += diffuseColor.rgb * uLampCol * (lt.r * lt.r) * (1.0 - ss(0.5, 5.0, vWPos.y - (lt.g * 16.0 - 8.0))) * uNight * 0.5; }`;   // the street lamps reach the fallen leaves and the lower branches as they reach the paving

function leafMaterials(Q) {
  const uni = { uTime: U.uTime, uWind: { value: new THREE.Vector2(0.8, 0.35) }, uSunDir: U.uSunDir, uSunCol: U.uSunCol, uSunI: { value: 1 }, uNight: U.uNight, uLampTex: U.uLampTex, uLampRect: U.uLampRect, uLampCol: U.uLampCol };
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { key: 'leaf', vPars: LEAF_V, vBegin: LEAF_VB, vEnd: `vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`, fPars: LEAF_F, fAlbedo: LEAF_FA, fEmissive: LEAF_FE, fFinal: `gl_FragColor.a = vViewPosition.z;` }, uni);
  const dep = patchMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), { key: 'leafD', vPars: LEAF_V, vBegin: LEAF_VB, fPars: LEAF_F, fMap: `{ float tone; if (leafMask(vLuv, vPar.x, vPar.y, tone) < 0.5) discard; }` }, uni);
  return { mat, dep, uni };
}

const PAL = {
  // mid-October: cherry leaves are starting to turn, maples and willows are still green
  cherry: [[0.085, 0.155, 0.035], [0.12, 0.19, 0.04], [0.19, 0.21, 0.05], [0.14, 0.20, 0.045], [0.50, 0.36, 0.06], [0.50, 0.20, 0.04], [0.36, 0.09, 0.03]],
  maple: [[0.075, 0.15, 0.035], [0.10, 0.18, 0.04], [0.15, 0.21, 0.05], [0.24, 0.25, 0.05]],
  willow: [[0.13, 0.22, 0.05], [0.18, 0.27, 0.06], [0.25, 0.31, 0.07]],
  ever: [[0.035, 0.085, 0.028], [0.05, 0.11, 0.035], [0.07, 0.12, 0.03]],
};

function makeTree(bark, leaves, x, y, z, H, Rc, sp, rnd, dens, nav) {
  const rr = (a, b) => a + (b - a) * rnd(), pal = PAL[sp], pick = () => { const c = pal[Math.min(pal.length - 1, (rnd() * rnd() * pal.length * 1.6) | 0)], k = rr(0.8, 1.2); return [c[0] * k, c[1] * k, c[2] * k]; };
  const shrub = H < 3.2, trunkH = shrub ? H * 0.25 : H * (sp === 'willow' ? 0.52 : 0.36), r0 = shrub ? 0.035 + H * 0.012 : 0.05 + H * 0.021, lean = [rr(-0.06, 0.06), rr(-0.06, 0.06)];
  const tp = []; for (let k = 0; k <= 4; k++) { const t = k / 4; tp.push({ p: V3(x + lean[0] * trunkH * t * t * 3 + (k ? rr(-0.04, 0.04) : 0), y - 0.15 + (trunkH + 0.15) * t, z + lean[1] * trunkH * t * t * 3 + (k ? rr(-0.04, 0.04) : 0)), r: r0 * lerp(k === 0 ? 1.35 : 1, 0.66, t) }); }
  bark.tube(tp, shrub ? 5 : 7); const top = tp[4].p, C = V3(x + lean[0] * trunkH * 3, y + H - Rc * (sp === 'willow' ? 0.9 : 0.72), z + lean[1] * trunkH * 3), anchors = [];
  const nL = shrub ? 3 : 4 + ((rnd() * 3) | 0), a0 = rnd() * TAU;
  const branch = (start, dir, L, r, depth) => { const path = [], d = dir.clone(), p = start.clone(), n = 4; path.push({ p: p.clone(), r });
    for (let k = 1; k <= n; k++) { d.y += (sp === 'willow' ? -0.10 : 0.07) * (depth ? 0.5 : 1); d.x += rr(-0.12, 0.12); d.z += rr(-0.12, 0.12); d.normalize(); p.addScaledVector(d, L / n); path.push({ p: p.clone(), r: r * lerp(1, 0.22, k / n) }); if (k >= 2) anchors.push({ p: p.clone(), d: d.clone(), tip: k === n }); if (k < n) anchors.push({ p: p.clone().addScaledVector(d, L / n * 0.5), d: d.clone(), tip: false }); }
    bark.tube(path, depth ? 4 : 5, 0.9);
    if (!depth && !shrub) { const ns = 3 + ((rnd() * 2) | 0); for (let s = 0; s < ns; s++) { const k = 1 + ((rnd() * 3) | 0), sd = path[k].p.clone().sub(path[k - 1].p).normalize(), ang = rr(0.5, 1.1) * (rnd() < 0.5 ? -1 : 1), c = Math.cos(ang), sn = Math.sin(ang); const nd = V3(sd.x * c - sd.z * sn, sd.y + rr(-0.15, 0.3), sd.x * sn + sd.z * c).normalize(); branch(path[k].p, nd, L * rr(0.4, 0.62), path[k].r * 0.6, 1); } } };
  for (let k = 0; k < nL; k++) { const az = a0 + k / nL * TAU + rr(-0.35, 0.35), el = sp === 'willow' ? rr(0.75, 1.15) : rr(0.42, 1.0), d = V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); const L = Math.min(Rc * rr(0.9, 1.2) / Math.max(0.45, Math.cos(el)), (y + H - top.y) / Math.max(0.3, Math.sin(el)) * 0.95); branch(V3(top.x, top.y - rr(0, trunkH * 0.18), top.z), d, L, r0 * 0.52, 0); }
  // leaf cards
  const u = V3(), v = V3(), N = V3(), o = V3(), P = V3(), kind = sp === 'willow' ? 1 : (sp === 'ever' ? 3 : 0), per = (sp === 'ever' ? 3.0 : sp === 'willow' ? 1 : 2.7) * dens;
  const frame = (nrm) => { u.crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0)).normalize(); v.crossVectors(nrm, u).normalize(); const a = rnd() * TAU, c = Math.cos(a), s = Math.sin(a), ux = u.x * c + v.x * s, uy = u.y * c + v.y * s, uz = u.z * c + v.z * s; v.set(v.x * c - u.x * s, v.y * c - u.y * s, v.z * c - u.z * s); u.set(ux, uy, uz); };
  for (const A of anchors) {
    if (sp === 'willow') for (let w = 0; w < (dens > 0.5 ? 3 : 2); w++) { let len = rr(1.6, 3.8), yy = A.p.y; const yaw = rnd() * TAU, hx = Math.cos(yaw), hz = Math.sin(yaw), n = Math.max(2, Math.round(len / 0.85)), col = pick(), bx = A.p.x + rr(-0.25, 0.25), bz = A.p.z + rr(-0.25, 0.25), g = nav.ground(bx, bz);
      for (let k = 0; k < n; k++) { const y1 = yy, y0 = yy - 0.9; if (y0 < g + 0.7) break; P.set(bx, (y0 + y1) / 2, bz); o.set(P.x - C.x, 0.25, P.z - C.z).normalize(); N.set(-hz, 0, hx).lerp(o, 0.6).normalize(); leaves.card(P, V3(hx, 0, hz), V3(0, 1, 0), 0.34, 0.47, N, col, clamp(0.5 + 0.5 * Math.hypot(P.x - C.x, P.z - C.z) / Rc, 0, 1), rnd(), 1, 0.35 + 0.3 * (k + 1), 0.35 + 0.3 * k); yy -= 0.82; } }
    if (sp === 'willow') continue;
    const n = Math.floor(per) + (rnd() < per % 1 ? 1 : 0) + (A.tip ? 2 : 0);
    for (let k = 0; k < n; k++) { const s = sp === 'ever' ? rr(0.24, 0.40) : rr(0.34, 0.58), spread = shrub ? 0.3 : 0.62; P.set(A.p.x + rr(-spread, spread), A.p.y + rr(-0.3, 0.35), A.p.z + rr(-spread, spread)); o.copy(P).sub(C); const dist = o.length() / Rc; o.normalize(); N.set(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)).normalize(); frame(N); N.lerp(o, 0.6).normalize(); leaves.card(P, u, v, s, s, N, pick(), clamp(0.3 + 0.75 * dist, 0, 1), rnd(), kind, 0.5, 0.5); }
  }
  // fallen leaves under deciduous trees
  if ((sp === 'cherry' || sp === 'maple') && !shrub) { const n = Math.round(16 * dens + 6); for (let k = 0; k < n; k++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * Rc * 1.5, fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d; if (!nav.walkable(fx, fz) || nav.cls(fx, fz) === 1 || nav.furn(fx, fz) > -900) continue; const g = nav.ground(fx, fz); if (Math.abs(g - y) > 1.2) continue; const yaw = rnd() * TAU; P.set(fx, g + 0.006 + rnd() * 0.004, fz); leaves.card(P, V3(Math.cos(yaw), 0, Math.sin(yaw)), V3(-Math.sin(yaw), 0, Math.cos(yaw)), 0.3, 0.3, V3(0, 1, 0), pick(), 1, rnd(), 2, 0, 0); } }
}

// ------------------------------------------------------------------ bridges
function makeBridge(B, world, conc, deckAcc, rail, roosts, out) {
  const nav = world.nav, a = V3(B.a[0], 0, B.a[1]), b = V3(B.b[0], 0, B.b[1]), L = a.distanceTo(b), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, hw = B.w / 2;
  const ya = B.ya ?? nav.ground(a.x - dx * 3, a.z - dz * 3), yb = B.yb ?? nav.ground(b.x + dx * 3, b.z + dz * 3), yT = t => lerp(ya, yb, t) + Math.sin(t * Math.PI) * (B.camber ?? 0.35);
  const R = (v, n) => { const x = v.x, z = v.z; v.x = a.x + dx * x - dz * z; v.z = a.z + dz * x + dx * z; if (n) { const nx = n.x, nz = n.z; n.x = dx * nx - dz * nz; n.z = dz * nx + dx * nz; } };
  if (out && B.core) out.deckY = x => (x >= a.x && x <= b.x) ? yT((x - a.x) / (b.x - a.x)) : null;
  // deck top: drawn with the terrain material, which paints bridge decks as carriageway and footways. It runs 3.6 m past each end so it also covers the abutments.
  const E = 3.6, N = Math.max(8, Math.round((L + 2 * E) / 3)), M = 4, base = deckAcc.nv, box = B.core ? world.meta.core : world.meta.ctx, v = V3();
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) { const xs = -E + (L + 2 * E) * i / N; v.set(xs, 0, -hw + B.w * j / M); R(v); const ov = xs < 0 ? -xs / E : xs > L ? (xs - L) / E : 0; deckAcc.p.push(v.x, yT(Math.min(1, Math.max(0, xs / L))) - (ov > 0 ? 0.008 + 0.035 * ov : 0), v.z); /* the overrun dips a few cm, so it shows only where the land falls short of the deck */ deckAcc.n.push(0, 1, 0); deckAcc.uv.push((v.x - box.x0) / (box.x1 - box.x0), (v.z - box.z0) / (box.z1 - box.z0)); deckAcc.nv++; }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const p = base + i * (M + 1) + j, q = p + M + 1; deckAcc.i.push(p, p + 1, q, q, p + 1, q + 1); }
  // slab + girders (in segments so they follow the camber), fascia, parapets
  const seg = Math.max(6, Math.round(L / 6)), gd = B.girder ?? 1.15, sl = 0.38;
  for (let s = 0; s < seg; s++) { const t0 = s / seg, t1 = (s + 1) / seg, x0 = L * t0, x1 = L * t1, y = (yT(t0) + yT(t1)) / 2;
    const yt = Math.min(yT(t0), yT(t1)) - 0.04; conc.box(x0, y - sl, -hw + 0.3, x1, yt, hw - 0.3, 0.8, R); conc.box(x0, y - sl, -hw, x1, y - 0.02, -hw + 0.3, 0.8, R); conc.box(x0, y - sl, hw - 0.3, x1, y - 0.02, hw, 0.8, R);   // the slab stays under the cambered deck: flat segments used to poke through it at their lower end
    const ng = Math.max(3, Math.round(B.w / 2.8)); for (let g = 0; g < ng; g++) { const zc = -hw + 0.5 + (B.w - 1.0) * g / (ng - 1); conc.box(x0, y - sl - gd, zc - 0.22, x1, y - sl, zc + 0.22, 0.55, R); }
    for (const sd of [-1, 1]) { const z0 = sd * hw; if (B.rail) { rail.box(x0, y + 1.02, z0 - 0.06, x1, y + 1.12, z0 + 0.06, 1, R); rail.box(x0, y + 0.12, z0 - 0.04, x1, y + 0.2, z0 + 0.04, 1, R); const np = Math.max(2, Math.round((x1 - x0) / 0.32)); for (let k = 0; k < np; k++) { const xx = x0 + (x1 - x0) * (k + 0.5) / np; rail.box(xx - 0.02, y + 0.2, z0 - 0.02, xx + 0.02, y + 1.02, z0 + 0.02, 1, R); } conc.box(x0, y - 0.02, z0 - 0.22, x1, y + 0.12, z0 + 0.22, 1, R); }
      else conc.box(x0, y - 0.02, z0 - 0.2, x1, y + 0.95, z0 + 0.2, 1, R); } }
  if (B.rail) { const np = Math.max(4, Math.round(L / 9)); for (let k = 0; k <= np; k++) { const t = k / np, y = yT(t); for (const sd of [-1, 1]) { conc.box(L * t - 0.32, y - 0.02, sd * hw - 0.32, L * t + 0.32, y + 1.35, sd * hw + 0.32, 1, R); conc.box(L * t - 0.38, y + 1.35, sd * hw - 0.38, L * t + 0.38, y + 1.47, sd * hw + 0.38, 1, R); } } }
  // piers + abutments
  const piers = B.piers ?? 2; for (let k = 1; k <= piers; k++) { const t = k / (piers + 1), xc = L * t, yTop = yT(t) - sl - gd, c = V3(xc, 0, 0); R(c); const bed = Math.min(nav.ground(c.x, c.z), nav.waterY(c.x, c.z) > -300 ? nav.waterY(c.x, c.z) - 0.8 : 1e9) - 0.5;
    conc.box(xc - 1.05, bed, -hw + 0.6, xc + 1.05, yTop - 0.55, hw - 0.6, 0.75, R); conc.box(xc - 1.45, yTop - 0.55, -hw + 0.2, xc + 1.45, yTop, hw - 0.2, 0.7, R);
    if (roosts && B.core) { const ng = Math.max(3, Math.round(B.w / 2.8)); for (let g = 0; g < ng - 1; g++) { const zc = -hw + 0.5 + (B.w - 1.0) * (g + 0.5) / (ng - 1); for (const ox of [-1.0, 0, 1.0]) { v.set(xc + ox, 0, zc); R(v); roosts.push({ x: v.x, y: yTop, z: v.z, low: true }); } } } }
  for (const [t, s] of [[0, -1], [1, 1]]) { const xc = L * t, y = yT(t), c = V3(xc + s * 1.5, 0, 0); R(c); const g = Math.min(nav.ground(c.x, c.z), y - 2) - 1.5; conc.box(xc - (s < 0 ? 3.5 : 0.6), g, -hw, xc + (s < 0 ? 0.6 : 3.5), y - 0.07, hw, 0.8, R); }
}

// ------------------------------------------------------------------ build
export function buildScenery(app) {
  const { scene, world, Q } = app, nav = world.nav, meta = world.meta, rnd = rng(20261112), rr = (a, b) => a + (b - a) * rnd();
  const lm = leafMaterials(Q), bark = new Acc(false), groups = [new Acc(true), new Acc(true), new Acc(true)], gi = x => x < -40 ? 0 : x < 40 ? 1 : 2, dens = Q.leaf ?? 1;
  let nT = 0; const crowns = [];   // [x, y of the foot, z, height, crown radius] of every tree, for the camera's line-of-sight test
  // PLATEAU vegetation (LOD3 zone)
  for (const t of meta.trees || []) { const [x, y, z, h, r] = t, H = clamp(h, 1.4, 14), Rc = clamp(r || H * 0.42, 0.6, 5.5); const east = x > 40, q = rnd();
    const sp = H < 3.2 ? (q < 0.6 ? 'ever' : 'maple') : east ? (q < 0.55 ? 'cherry' : q < 0.85 ? 'willow' : 'maple') : (q < 0.45 ? 'maple' : q < 0.8 ? 'cherry' : 'ever');
    const fy = nav.ground(x, z) > y - 1.5 ? Math.min(y, nav.ground(x, z)) : y; makeTree(bark, groups[gi(x)], x, fy, z, H, Rc, sp, rnd, dens, nav); crowns.push([x, fy, z, H, Rc]); nT++; }
  // Kamo east bank: the row of cherry trees along Kawabata-dori (crowns visible in the aerial photo)
  for (let z = -214; z < 132; z += rr(8.5, 11.5)) { const road = nav.ground(2, z); let xe = null; for (let x = -32; x < -2; x += 0.5) if (nav.ground(x, z) >= road - 0.7 && nav.cls(x, z) === 0) { xe = x; break; } if (xe === null) continue; const x = xe + rr(0.6, 1.6); if (nav.cls(x, z) !== 0 || nav.furn(x, z) > -900) continue;
    const tH = rr(6.2, 8.6), tR = rr(2.9, 3.9); makeTree(bark, groups[1], x, nav.ground(x, z), z, tH, tR, rnd() < 0.85 ? 'cherry' : 'willow', rnd, dens, nav); crowns.push([x, nav.ground(x, z), z, tH, tR]); nT++; }
  const barkMat = cityMaterial('frnp', Q, { rough: 0.95, uniforms: { uTint: { value: new THREE.Color(0.115, 0.09, 0.07) }, uGrain: { value: 0.7 } } });
  const bm = new THREE.Mesh(bark.geometry(), barkMat); bm.castShadow = true; bm.receiveShadow = true; bm.matrixAutoUpdate = false; scene.add(bm);
  const leafMeshes = []; for (const g of groups) { if (!g.nv) continue; const m = new THREE.Mesh(g.geometry(), lm.mat); m.customDepthMaterial = lm.dep; m.castShadow = Q.tier !== 'low'; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); leafMeshes.push(m); }

  // bridges over the Kamo (not present in the PLATEAU bridge model for this area)
  const conc = new Acc(false), rail = new Acc(false), deckCore = new Acc(false), deckCtx = new Acc(false), roosts = []; deckCore.uv = []; deckCtx.uv = [];
  const BR = [
    { n: '四条大橋', a: [-98.5, 153.2], b: [-30.5, 153.2], w: 24.5, core: true, rail: true, piers: 2, camber: 0.45 },
    { n: '三条大橋', a: [-85, -417.5], b: [-8, -434], w: 15.5, piers: 3, camber: 0.5 },
    { n: '御池大橋', a: [-92, -640], b: [-8, -640], w: 27, piers: 2 },
    { n: '団栗橋', a: [-150, 318], b: [-83, 339], w: 11, piers: 2 },
  ];
  const ext = {}; for (const B of BR) { try { makeBridge(B, world, conc, B.core ? deckCore : deckCtx, rail, roosts, ext); } catch (e) { console.warn('bridge ' + B.n + ': ' + e.message); } }
  const concMat = cityMaterial('frnp', Q, { rough: 0.9, uniforms: { uTint: { value: new THREE.Color(0.40, 0.385, 0.36) }, uGrain: { value: 0.32 } } }), railMat = cityMaterial('frnp', Q, { rough: 0.55, uniforms: { uTint: { value: new THREE.Color(0.13, 0.22, 0.19) }, uGrain: { value: 0.25 } } });
  const add = (acc, mat, cast = true) => { if (!acc.nv) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(acc.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.n, 3)); if (acc.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(acc.c, 4)); if (acc.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2)); g.setIndex(acc.i); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m; };
  add(conc, concMat); add(rail, railMat); if (world.terrain) add(deckCore, world.terrain.material, true); if (world.terrainCtx) add(deckCtx, world.terrainCtx.material, true);
  return { roosts, crowns, nTrees: nT, deckY: ext.deckY || null, update(dt, camera) { lm.uni.uSunI.value = world.env.sunI; const t = U.uTime.value, g = 0.75 + 0.35 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.53 + 1.7); lm.uni.uWind.value.set(0.85 * g, 0.4 * g); } };
}
