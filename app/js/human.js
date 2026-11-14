// People modelled in code. Each person is one skinned mesh (body, clothes, hair, shoes) lofted from rings,
// with its own build, outfit and colours; 13 bones, bind pose = standing with the arms hanging straight down.
// Coordinates: x = the person's left, y = up, z = forward, metres for a 1.72 m adult before the per-person scale.
import * as THREE from './three.module.min.js';
import { TAU, clamp } from './util.js';

export const NB = 13, B = { pel: 0, chest: 1, head: 2, uaL: 3, faL: 4, uaR: 5, faR: 6, thL: 7, shL: 8, ftL: 9, thR: 10, shR: 11, ftR: 12 };
export const LEN = { ua: 0.30, fa: 0.26, th: 0.42, sh: 0.42, ankle: 0.07, hipX: 0.085, pelY: 0.91, chestY: 1.06, headY: 1.50, shY: 1.41 };
// material ids carried in aFace.w
const CLOTH = 0, SKIN = 1, HAIR = 2, SHOE = 3, SOLE = 4, JACKET = 5, KIMONO = 6;

const sp = (v, e) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), e);
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const skMix = (a, b, t) => { const m = new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], (m.get(a[i]) || 0) + a[i + 1] * (1 - t)); for (let i = 0; i < b.length; i += 2) m.set(b[i], (m.get(b[i]) || 0) + b[i + 1] * t); const o = []; for (const [k, w] of m) if (w > 1e-4) o.push(k, w); return o; };

class Geo {
  constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; this.F = []; this.I = []; }
  get n() { return this.P.length / 3; }
  v(p, n, col, ao, sk, f) {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2], ao);
    const a = []; for (let i = 0; i < sk.length; i += 2) a.push([sk[i], sk[i + 1]]); a.sort((p0, p1) => p1[1] - p0[1]); a.length = Math.min(a.length, 4); let s = 0; for (const q of a) s += q[1];
    for (let k = 0; k < 4; k++) { this.SI.push(a[k] ? a[k][0] : 0); this.SW.push(a[k] ? a[k][1] / s : 0); }
    this.F.push(f[0], f[1], f[2], f[3]); return this.n - 1;
  }
}
const ring = (y, rx, rf, rb, sk, o = {}) => ({ x: o.x || 0, y, z: o.z || 0, rx, rf, rb, e: o.e || 2, ao: o.ao === undefined ? 1 : o.ao, col: o.col, sk });
let LODK = 1, LODR = 0;   // coarser tessellation for the light quality tier (set per person in buildPerson)
// smooth the profile through the control rings (Hermite in the axis coordinate, so it stays monotonic along the axis)
function refine(R, n, ax = 'y') { n = Math.max(1, n - LODR);
  const K = ['x', 'y', 'z', 'rx', 'rf', 'rb', 'e', 'ao'].filter(k => k !== ax), out = [];
  for (let i = 0; i < R.length - 1; i++) { const a = R[Math.max(i - 1, 0)], b = R[i], c = R[i + 1], d = R[Math.min(i + 2, R.length - 1)], D = c[ax] - b[ax];
    if (Math.abs(D) < 1e-6) { out.push(b); continue; }
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t, r = { [ax]: b[ax] + D * t };
      for (const key of K) { const tb = Math.abs(c[ax] - a[ax]) > 1e-6 ? (c[key] - a[key]) / (c[ax] - a[ax]) : (c[key] - b[key]) / D, tc = Math.abs(d[ax] - b[ax]) > 1e-6 ? (d[key] - b[key]) / (d[ax] - b[ax]) : (c[key] - b[key]) / D;
        r[key] = (2 * t3 - 3 * t2 + 1) * b[key] + (t3 - 2 * t2 + t) * D * tb + (-2 * t3 + 3 * t2) * c[key] + (t3 - t2) * D * tc; }
      r.rx = Math.max(r.rx, 1e-4); r.rf = Math.max(r.rf, 1e-4); r.rb = Math.max(r.rb, 1e-4); r.ao = clamp(r.ao, 0, 1); r.e = Math.max(r.e, 1.2); r.col = b.col && c.col ? mixc(b.col, c.col, t) : b.col; r.sk = skMix(b.sk, c.sk, t); out.push(r); } }
  out.push(R[R.length - 1]); return out;
}
// Loft a closed tube through the rings. axis 'y': rings lie in the xz-plane (rf = front, rb = back);
// axis 'z': rings lie in the xy-plane (rf = up, rb = down). o: { mat, col, colf, aof, skf, face, warp, center, capA, capB }
function loft(G, rings, seg, o = {}) { seg = Math.max(6, Math.round(seg * LODK));
  const ax = o.axis || 'y', nr = rings.length, base = G.n, Q = [], Nn = [], mat = o.mat || 0;
  for (let i = 0; i < nr; i++) { const r = rings[i], e = 2 / r.e;
    for (let j = 0; j < seg; j++) { const th = j / seg * TAU, u = sp(Math.sin(th), e), w = sp(Math.cos(th), e), a = r.rx * u, b = (w >= 0 ? r.rf : r.rb) * w;
      let p = ax === 'y' ? [r.x + a, r.y, r.z + b] : [r.x + a, r.y + b, r.z]; if (o.warp) p = o.warp(p, r, th, i) || p; Q.push(p); } }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < nr; i++) { const r = rings[i], cen = o.center || [r.x, r.y, r.z];
    for (let j = 0; j < seg; j++) { const p = Q[i * seg + j], ar = sub(Q[i * seg + (j + 1) % seg], Q[i * seg + (j + seg - 1) % seg]), al = sub(Q[Math.min(i + 1, nr - 1) * seg + j], Q[Math.max(i - 1, 0) * seg + j]);
      let n = cross(ar, al), L = Math.hypot(n[0], n[1], n[2]); const out = sub(p, cen), Lo = Math.hypot(out[0], out[1], out[2]);
      if (L < 1e-9) { n = Lo > 1e-6 ? out : (i === 0 ? [-al[0], -al[1], -al[2]] : al); L = Math.hypot(n[0], n[1], n[2]) || 1; }
      else if (Lo > 1e-6 && dot(n, out) < 0) { n = [-n[0], -n[1], -n[2]]; }
      Nn.push([n[0] / L, n[1] / L, n[2] / L]); } }
  for (let i = 0; i < nr; i++) { const r = rings[i]; for (let j = 0; j < seg; j++) { const k = i * seg + j, p = Q[k], th = j / seg * TAU;
    const col = o.colf ? o.colf(p, r, th) : (r.col || o.col), ao = o.aof ? o.aof(p, r, th) : r.ao, sk = o.skf ? o.skf(p, r, th) : r.sk;
    G.v(p, Nn[k], col, ao, sk, o.face ? o.face(p, mat) : [0, 0, -1, mat]); } }
  // winding: compare one quad's geometric normal with its vertex normal
  let flip = false; { const i = Math.min(Math.floor(nr / 2), nr - 2), a = Q[i * seg], b = Q[i * seg + 1], c = Q[(i + 1) * seg + 1], g = cross(sub(b, a), sub(c, a)); flip = dot(g, Nn[i * seg]) < 0; }
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < seg; j++) { const a = base + i * seg + j, b = base + i * seg + (j + 1) % seg, c = base + (i + 1) * seg + (j + 1) % seg, d = base + (i + 1) * seg + j; if (flip) G.I.push(a, c, b, a, d, c); else G.I.push(a, b, c, a, c, d); }
  // flat caps (openings such as cuffs and hems get a dark, slightly sunken cap so they read as the shadow inside)
  const cap = (i, cs) => { if (!cs) return; const r = rings[i], dir = i === 0 ? -1 : 1, other = rings[i === 0 ? 1 : nr - 2], av = ax === 'y' ? [0, Math.sign(r.y - other.y) || dir, 0] : [0, 0, Math.sign(r.z - other.z) || dir], ins = cs.inset || 0;
    const c0 = G.v([r.x - av[0] * ins, r.y - av[1] * ins, r.z - av[2] * ins], av, cs.col, cs.ao === undefined ? 1 : cs.ao, r.sk, [0, 0, -1, cs.mat === undefined ? mat : cs.mat]), b0 = G.n;
    for (let j = 0; j < seg; j++) { const p = Q[i * seg + j]; G.v(p, av, cs.col, cs.ao === undefined ? 1 : cs.ao, o.skf ? o.skf(p, r, j / seg * TAU) : r.sk, [0, 0, -1, cs.mat === undefined ? mat : cs.mat]); }
    const g = cross(sub(Q[i * seg + 1], Q[i * seg]), sub([r.x, r.y, r.z], Q[i * seg])), same = dot(g, av) > 0;   // orientation of (p0, p1, centre)
    for (let j = 0; j < seg; j++) { const a = b0 + j, b = b0 + (j + 1) % seg; if (same) G.I.push(a, b, c0); else G.I.push(b, a, c0); } };
  cap(0, o.capA); cap(nr - 1, o.capB);
}
function ellipsoid(G, c, r, o = {}) { const n = o.n || 6, seg = o.seg || 10, R = []; for (let k = 0; k <= n; k++) { const ph = k / n * Math.PI, s = Math.max(Math.sin(ph), 1e-3); R.push(ring(c[1] - r[1] * Math.cos(ph), r[0] * s, r[2] * s, r[2] * s, o.sk, { x: c[0], z: c[2], ao: o.ao })); }
  const rx = o.rotX || 0, cs = Math.cos(rx), sn = Math.sin(rx); loft(G, R, seg, { mat: o.mat, col: o.col, center: c, face: o.face, aof: o.aof, warp: rx ? p => { const y = p[1] - c[1], z = p[2] - c[2]; return [p[0], c[1] + y * cs - z * sn, c[2] + y * sn + z * cs]; } : null }); }

// ---------------------------------------------------------------- body tables (male; x = half width, f = front, b = back)
const TORSO = [[0.45, 0.166, 0.112, 0.116], [0.62, 0.170, 0.106, 0.113], [0.80, 0.172, 0.100, 0.114], [0.88, 0.170, 0.100, 0.117], [0.94, 0.171, 0.103, 0.118], [1.00, 0.161, 0.103, 0.104], [1.06, 0.150, 0.100, 0.093], [1.14, 0.152, 0.102, 0.096], [1.24, 0.166, 0.113, 0.108], [1.33, 0.180, 0.106, 0.112], [1.375, 0.198, 0.096, 0.104], [1.405, 0.202, 0.086, 0.098], [1.428, 0.170, 0.078, 0.092], [1.447, 0.112, 0.068, 0.082], [1.462, 0.062, 0.056, 0.064]];   // the yoke reaches out over the top of the sleeve (rows at 1.375 and 1.405), so shoulder and arm read as one shape instead of a ball beside a barrel
function torsoAt(y, f, bw) { let i = 0; while (i < TORSO.length - 2 && TORSO[i + 1][0] < y) i++; const a = TORSO[i], b = TORSO[i + 1], t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1); let rx = a[1] + (b[1] - a[1]) * t, rf = a[2] + (b[2] - a[2]) * t, rb = a[3] + (b[3] - a[3]) * t;
  if (f) { const waist = sm(0.94, 1.04, y) * (1 - sm(1.16, 1.3, y)), up = sm(1.12, 1.3, y), neck = sm(1.40, 1.46, y); rx *= 1.02 - 0.13 * waist - 0.10 * up * (1 - neck); rf += 0.022 * Math.exp(-(((y - 1.25) / 0.055) ** 2)) - 0.006 * waist; rb -= 0.006 * up * (1 - neck); }
  const k = 1 + (bw - 1) * (1 - sm(1.40, 1.46, y)); return [rx * k, rf * (1 + (bw - 1) * 1.4 * (1 - sm(1.40, 1.46, y))), rb * k]; }
const HEAD = [ // t (-1 chin .. 1 crown), z offset, half width, front, back
  [-1.00, 0.046, 0.016, 0.022, 0.026], [-0.93, 0.036, 0.034, 0.044, 0.046], [-0.80, 0.022, 0.048, 0.064, 0.060], [-0.60, 0.010, 0.058, 0.080, 0.074], [-0.35, 0.003, 0.066, 0.089, 0.088], [-0.10, 0.000, 0.072, 0.090, 0.097],
  [0.12, 0.000, 0.075, 0.091, 0.101], [0.35, -0.002, 0.075, 0.093, 0.102], [0.58, -0.006, 0.071, 0.087, 0.098], [0.78, -0.011, 0.060, 0.071, 0.085], [0.91, -0.015, 0.043, 0.050, 0.062], [0.98, -0.017, 0.022, 0.026, 0.032], [1.00, -0.018, 0.004, 0.005, 0.006]];
const HC = 1.605, HZ = 0.022, HH = 0.118;

// spec: { sex, s, bw, top: tee|shirt|jacket|hoodie|coat, bottom: pants|slim|wide|shorts|skirt|long, hair: short|crop|bob|long|tail|bun|grey, shoe: sneaker|leather,
//         cols: { top, inner, bot, skin, hair, shoe, sole, sock, bag }, pack, cap, mask }
export function buildPerson(o) { LODK = o.lod ? 0.72 : 1; LODR = o.lod ? 1 : 0;
  const G = new Geo(), f = o.sex === 'f', bw = o.bw || 1, C = o.cols, s = o.s || 1, shX = (f ? 0.166 : 0.186) * (0.6 + 0.4 * bw), hipX = LEN.hipX, lk = f ? 0.9 : 1, dark = c => mul(c, 0.25);
  const side = sx => ({ ua: sx > 0 ? B.uaL : B.uaR, fa: sx > 0 ? B.faL : B.faR, th: sx > 0 ? B.thL : B.thR, sh: sx > 0 ? B.shL : B.shR, ft: sx > 0 ? B.ftL : B.ftR });
  const kim = o.top === 'kimono', skirt = kim || o.bottom === 'skirt' || o.bottom === 'long', shorts = !kim && o.bottom === 'shorts', bare = skirt || shorts, tk = { tee: 0.006, shirt: 0.008, jacket: 0.016, hoodie: 0.021, coat: 0.018, kimono: 0.012 }[o.top] || 0.008;
  if (kim) C.bot = C.top;
  const hemY = Math.max({ tee: 0.90, shirt: 0.885, jacket: 0.86, hoodie: 0.87, coat: 0.56, kimono: 1.0 }[o.top] || 0.89, o.sit ? 0.93 : 0), shortSleeve = o.top === 'tee';   // a jacket rides up when its wearer sits down
  // ---- legs: the body (skin or tights) when the bottom leaves them bare, otherwise trouser legs
  for (const sx of [1, -1]) { const b = side(sx), x = sx * hipX, skT = [B.pel, 0.65, b.th, 0.35], sk1 = [B.pel, 0.3, b.th, 0.7], th = [b.th, 1], kn = [b.th, 0.5, b.sh, 0.5], sh = [b.sh, 1];
    const inner = (p, r, a) => r.ao * (1 - 0.32 * sm(0.55, 0.95, p[1] / 1) * Math.max(0, -sx * Math.sin(a)));   // inner thighs sit in each other's shade
    if (kim) loft(G, [ring(0.24, 0.036, 0.038, 0.042, sh, { x }), ring(0.12, 0.031, 0.034, 0.036, sh, { x }), ring(0.06, 0.032, 0.036, 0.038, [b.sh, 0.5, b.ft, 0.5], { x })], 10, { mat: CLOTH, col: [0.74, 0.73, 0.70] });
    else if (bare) { const legc = C.legs || C.skin, R = refine([ring(0.93, 0.084 * lk * bw, 0.088 * bw, 0.097 * bw, skT, { x }), ring(0.86, 0.082 * lk * bw, 0.086 * bw, 0.093 * bw, sk1, { x }), ring(0.72, 0.069 * lk * bw, 0.074 * bw, 0.076 * bw, th, { x }), ring(0.56, 0.054 * lk, 0.057, 0.055, [b.th, 0.9, b.sh, 0.1], { x }), ring(0.49, 0.049 * lk, 0.054, 0.050, kn, { x }), ring(0.43, 0.046 * lk, 0.047, 0.052, [b.th, 0.1, b.sh, 0.9], { x }), ring(0.35, 0.047 * lk, 0.044, 0.060, sh, { x }), ring(0.22, 0.038 * lk, 0.038, 0.043, sh, { x }), ring(0.12, 0.031, 0.034, 0.036, sh, { x }), ring(0.06, 0.032, 0.036, 0.038, [b.sh, 0.5, b.ft, 0.5], { x })], 3);
      loft(G, R, 14, { mat: C.legs ? CLOTH : SKIN, col: legc, aof: inner });
      if (shorts) loft(G, refine([ring(0.94, 0.086 * bw, 0.090 * bw, 0.100 * bw, skT, { x }), ring(0.86, 0.090 * bw, 0.092 * bw, 0.100 * bw, sk1, { x }), ring(0.74, 0.090 * bw, 0.092 * bw, 0.094 * bw, th, { x }), ring(0.60, 0.088 * bw, 0.090 * bw, 0.090 * bw, th, { x })], 2), 14, { mat: CLOTH, col: C.bot, aof: inner, capA: null, capB: { col: dark(C.bot), ao: 0.35, inset: 0.012 } });
    } else { const w = o.bottom === 'slim' ? [0.004, 0.049, 0.045] : o.bottom === 'wide' ? [0.016, 0.080, 0.090] : [0.008, 0.063, 0.059], e = w[0], k = w[1], h = w[2];
      const R = refine([ring(0.93, (0.082 + e) * bw, (0.088 + e) * bw, (0.096 + e) * bw, skT, { x }), ring(0.86, (0.080 + e) * bw, (0.085 + e) * bw, (0.092 + e) * bw, sk1, { x }), ring(0.76, (0.074 + e) * bw, (0.079 + e) * bw, (0.082 + e) * bw, th, { x }), ring(0.62, (0.064 + e) * bw, (0.069 + e) * bw, (0.070 + e) * bw, th, { x }), ring(0.545, k + 0.003, k + 0.007, k + 0.005, [b.th, 0.85, b.sh, 0.15], { x }), ring(0.49, k, k + 0.005, k + 0.003, kn, { x }), ring(0.435, k - 0.001, k + 0.001, k + 0.004, [b.th, 0.15, b.sh, 0.85], { x }), ring(0.36, (k + h) / 2, (k + h) / 2 - 0.001, (k + h) / 2 + 0.006, sh, { x }), ring(0.22, h, h, h + 0.004, sh, { x }), ring(0.105, h + 0.001, h + 0.004, h + 0.003, sh, { x })], 3);
      loft(G, R, 14, { mat: CLOTH, col: C.bot, aof: inner, capA: { col: dark(C.bot), ao: 0.3, inset: 0.02 } });
      // sock / ankle between the hem and the shoe
      loft(G, [ring(0.16, 0.034, 0.036, 0.038, sh, { x }), ring(0.06, 0.034, 0.038, 0.040, [b.sh, 0.5, b.ft, 0.5], { x })], 10, { mat: CLOTH, col: C.sock || C.skin }); }
    shoe(G, sx, b, o, C);
  }
  // ---- hips (trousers / shorts) or skirt
  const lr = (wTh) => (p, r, a) => { const y = p[1], w = wTh(y), sd = clamp(Math.sin(a) * 1.6, -1, 1), wc = clamp((y - 0.92) / 0.22, 0, 1), lo = clamp((0.47 - y) / 0.16, 0, 1), L = w * (0.5 + 0.5 * sd), Rr = w * (0.5 - 0.5 * sd); return [B.pel, (1 - w) * (1 - wc), B.chest, (1 - w) * wc, B.thL, L * (1 - lo), B.thR, Rr * (1 - lo), B.shL, L * lo, B.shR, Rr * lo]; };
  if (!skirt) { const sk = [B.pel, 1]; loft(G, refine([ring(0.80, 0.05, 0.042, 0.064, sk, { z: -0.012 }), ring(0.835, 0.130 * bw, 0.076 * bw, 0.098 * bw, sk, { z: -0.004 }), ring(0.88, 0.170 * bw * (f ? 1.02 : 1), 0.100 * bw, 0.117 * bw, sk), ring(0.94, 0.171 * bw * (f ? 1.02 : 1), 0.103 * bw, 0.118 * bw, sk), ring(1.00, torsoAt(1.0, f, bw)[0], 0.103 * bw, 0.104 * bw, [B.pel, 0.75, B.chest, 0.25]), ring(1.05, torsoAt(1.05, f, bw)[0], 0.100 * bw, 0.094 * bw, [B.pel, 0.5, B.chest, 0.5])], 2), 22, { mat: CLOTH, col: C.bot, capB: { col: C.bot } }); }
  else { const hem = kim ? 0.105 : o.bottom === 'long' ? 0.30 : 0.50, fl = kim ? -0.012 : o.bottom === 'long' ? 0.045 : 0.035, ys = [1.06, 1.0, 0.94, 0.86, 0.74, (0.74 + hem) / 2, hem], R = ys.map((y, i) => { const t = torsoAt(Math.max(y, 0.8), f, bw), k = sm(0.94, hem, y) * fl; return ring(y, t[0] + 0.012 + k, t[1] + 0.012 + k * 1.3, t[2] + 0.010 + k * 1.3, [B.pel, 1]); });
    loft(G, refine(R, 2), 26, { mat: kim ? KIMONO : CLOTH, col: C.bot, face: kim ? () => [0.7, s, 9, KIMONO] : null, skf: lr(y => clamp((0.90 - y) / 0.36, 0, kim ? 0.5 : 0.9)) /* a kimono is wrapped tight: it follows the legs only halfway */, capA: { col: C.bot }, capB: { col: dark(C.bot), ao: 0.3, inset: 0.05 } }); }
  // ---- torso garment
  { const ys = [hemY]; for (const t of TORSO) if (t[0] > hemY + 0.035) ys.push(t[0]); const neckTop = { tee: 1.452, shirt: 1.478, jacket: 1.474, hoodie: 1.486, coat: 1.482 }[o.top] || 1.47; if (neckTop > 1.47) ys.push(neckTop); else ys[ys.length - 1] = neckTop;
    const open = o.top === 'jacket' || o.top === 'coat' || kim ? 1 : 0, inner = kim ? [0.74, 0.73, 0.70] : C.inner || [0.6, 0.6, 0.58], TM = kim ? KIMONO : JACKET;
    const R = ys.map((y, i) => { const t = torsoAt(Math.min(y, 1.462), f, bw), fl = i === 0 ? 0.006 + (o.top === 'coat' ? 0.012 : 0) : 0, nk = sm(1.40, 1.462, y); const lo = 0.012 * (1 - sm(0.96, 1.10, y)), e = tk * (1 - 0.55 * nk) + fl + lo, wide = y < 1.455 && o.top === 'tee' ? 0.012 * sm(1.43, 1.452, y) : 0; return ring(y, t[0] + e + wide, t[1] + e + lo * 0.6 + wide, t[2] + e + wide, [B.chest, 1], { e: 2.25 - 0.25 * nk + 0.35 * (1 - sm(0.92, 1.05, y)) }); });
    const wTh = y => o.top === 'coat' ? clamp((0.86 - y) / 0.42, 0, 0.55) : 0, skf = lr(wTh);
    loft(G, refine(R, 2), 28, { mat: open ? TM : CLOTH, col: C.top, face: open ? () => [(inner[0] + inner[1] + inner[2]) / 3, s, kim ? 1.19 : hemY, TM] : null, skf: (p, r, a) => { const y = p[1]; if (y >= 1.14) return [B.chest, 1]; if (y >= 0.92) { const t = (y - 0.92) / 0.22; return [B.pel, 1 - t, B.chest, t]; } return skf(p, r, a); },
      aof: (p, r, a) => { const y = p[1], sd = Math.abs(Math.sin(a)); return 1 - 0.34 * sd * sd * sm(0.84, 1.0, y) * (1 - sm(1.36, 1.42, y)) - 0.25 * sm(1.455, 1.48, y); },
      capA: { col: dark(C.top), ao: 0.3, inset: 0.03 }, capB: { col: dark(C.top), ao: 0.35, inset: 0.012 } });
    if (kim) { const oc = C.obi || [0.5, 0.36, 0.1], y0 = f ? 1.035 : 0.975, y1 = f ? 1.215 : 1.055, ob = [y0, (y0 + y1) / 2, y1].map(y => { const t = torsoAt(y, f, bw), e = tk + 0.016; return ring(y, t[0] + e, t[1] + e, t[2] + e, [B.pel, 0.5, B.chest, 0.5], { e: 2.5 }); });
      loft(G, ob, 26, { mat: CLOTH, col: oc, skf: (p) => { const t = clamp((p[1] - 0.92) / 0.22, 0, 1); return [B.pel, 1 - t, B.chest, t]; }, capA: { col: mul(oc, 0.6) }, capB: { col: mul(oc, 0.6) } });
      if (f) loft(G, refine([ring(1.05, 0.10, 0.02, 0.05, [B.chest, 1], { z: -0.125 * bw, e: 3 }), ring(1.09, 0.135, 0.02, 0.075, [B.chest, 1], { z: -0.125 * bw, e: 4 }), ring(1.27, 0.135, 0.02, 0.080, [B.chest, 1], { z: -0.125 * bw, e: 4 }), ring(1.31, 0.10, 0.02, 0.05, [B.chest, 1], { z: -0.125 * bw, e: 3 })], 2), 14, { mat: CLOTH, col: oc, capA: { col: oc }, capB: { col: oc } }); }
    if (o.top === 'hoodie') ellipsoid(G, [0, 1.435, -0.088], [0.088 * bw, 0.062, 0.046], { sk: [B.chest, 1], col: C.top, mat: CLOTH, rotX: 0.35, n: 6, seg: 12 }); }
  // ---- arms and hands
  for (const sx of [1, -1]) { const b = side(sx), x = sx * shX, ak = (f ? 0.86 : 1) * (0.7 + 0.3 * bw), e = kim ? 0.016 : shortSleeve ? 0.007 : Math.min(tk, 0.014) * 0.55, ua = [b.ua, 1], fa = [b.fa, 1];
    // the hanging part of the sleeve drops from the upper arm under its own weight; the forearm swings out of it
    if (kim) loft(G, refine([ring(1.20, 0.014, 0.046, 0.050, ua, { x, z: -0.005 }), ring(1.08, 0.016, 0.050, 0.105, ua, { x, z: -0.01 }), ring(0.84, 0.016, 0.052, 0.120, ua, { x, z: -0.012 }), ring(0.70, 0.014, 0.050, 0.114, ua, { x, z: -0.012, e: 3 }), ring(0.685, 0.007, 0.044, 0.104, ua, { x, z: -0.012, e: 3 })], 2), 12, { mat: KIMONO, col: C.top, face: () => [0.7, s, 9, KIMONO] });
    const inner = (p, r, a) => r.ao * (1 - 0.3 * Math.max(0, -sx * Math.sin(a)) * sm(0.9, 1.05, p[1]));
    const top = [ring(1.434, 0.008, 0.010, 0.010, [B.chest, 0.6, b.ua, 0.4], { x: x - sx * 0.034 }), ring(1.428, 0.030 * ak + e, 0.034 * ak + e, 0.034 * ak + e, [B.chest, 0.5, b.ua, 0.5], { x: x - sx * 0.020 }), ring(1.410, 0.044 * ak + e, 0.048 * ak + e, 0.048 * ak + e, [B.chest, 0.35, b.ua, 0.65], { x: x - sx * 0.008 }), ring(1.375, 0.048 * ak + e, 0.052 * ak + e, 0.052 * ak + e, [B.chest, 0.15, b.ua, 0.85], { x: x - sx * 0.002 }), ring(1.32, 0.046 * ak + e, 0.050 * ak + e, 0.050 * ak + e, ua, { x })];
    if (shortSleeve) { loft(G, refine(top.concat([ring(1.26, 0.046 * ak + e, 0.049 * ak + e, 0.049 * ak + e, ua, { x }), ring(1.20, 0.047 * ak + e, 0.050 * ak + e, 0.050 * ak + e, ua, { x })]), 2), 12, { mat: CLOTH, col: C.top, aof: inner, capB: { col: dark(C.top), ao: 0.3, inset: 0.012 } });
      loft(G, refine([ring(1.23, 0.040 * ak, 0.043 * ak, 0.043 * ak, ua, { x }), ring(1.15, 0.037 * ak, 0.039 * ak, 0.040 * ak, ua, { x }), ring(1.11, 0.035 * ak, 0.036 * ak, 0.038 * ak, [b.ua, 0.5, b.fa, 0.5], { x }), ring(1.07, 0.036 * ak, 0.038 * ak, 0.038 * ak, fa, { x }), ring(1.00, 0.035 * ak, 0.037 * ak, 0.036 * ak, fa, { x }), ring(0.90, 0.027 * ak, 0.030 * ak, 0.028 * ak, fa, { x }), ring(0.855, 0.024 * ak, 0.028 * ak, 0.027 * ak, fa, { x })], 2), 10, { mat: SKIN, col: C.skin, aof: inner }); }
    else loft(G, refine(top.concat([ring(1.22, 0.043 * ak + e, 0.046 * ak + e, 0.046 * ak + e, ua, { x }), ring(1.15, 0.040 * ak + e, 0.042 * ak + e, 0.043 * ak + e, [b.ua, 0.9, b.fa, 0.1], { x }), ring(1.11, 0.039 * ak + e, 0.040 * ak + e, 0.042 * ak + e, [b.ua, 0.5, b.fa, 0.5], { x }), ring(1.07, 0.039 * ak + e, 0.041 * ak + e, 0.041 * ak + e, [b.ua, 0.1, b.fa, 0.9], { x }), ring(1.00, 0.038 * ak + e, 0.040 * ak + e, 0.039 * ak + e, fa, { x }), ring(0.88, 0.031 * ak + e * 0.7, 0.034 * ak + e * 0.7, 0.032 * ak + e * 0.7, fa, { x })]), 2), 12, { mat: CLOTH, col: C.top, aof: inner, capB: { col: dark(C.top), ao: 0.3, inset: 0.012 } });
    // hand: a relaxed mitten with the thumb forward, palm towards the thigh
    const hk = f ? 0.80 : 0.88; loft(G, refine([ring(0.862, 0.021 * hk, 0.026 * hk, 0.025 * hk, fa, { x }), ring(0.83, 0.017 * hk, 0.038 * hk, 0.036 * hk, fa, { x: x - sx * 0.002 }), ring(0.785, 0.015 * hk, 0.043 * hk, 0.040 * hk, fa, { x: x - sx * 0.004 }), ring(0.74, 0.013 * hk, 0.040 * hk, 0.037 * hk, fa, { x: x - sx * 0.009, z: 0.004 }), ring(0.70, 0.011 * hk, 0.034 * hk, 0.031 * hk, fa, { x: x - sx * 0.017, z: 0.008 }), ring(0.675, 0.008 * hk, 0.024 * hk, 0.021 * hk, fa, { x: x - sx * 0.024, z: 0.010 }), ring(0.668, 0.003, 0.008, 0.007, fa, { x: x - sx * 0.026, z: 0.010 })], 2), 10, { mat: SKIN, col: C.skin, face: p => [(p[2] - 0.004) / (0.040 * hk), (0.862 - p[1]) / 0.194, -2, SKIN] });
    ellipsoid(G, [x - sx * 0.006, 0.79, 0.040 * hk], [0.010 * hk, 0.034 * hk, 0.012 * hk], { sk: fa, col: C.skin, mat: SKIN, rotX: -0.25, n: 4, seg: 6 });
  }
  // ---- neck, head, face parts, hair
  loft(G, [ring(1.43, 0.056, 0.054, 0.060, [B.chest, 1], { z: -0.004, ao: 0.7 }), ring(1.475, 0.049 * (f ? 0.9 : 1), 0.050 * (f ? 0.9 : 1), 0.054 * (f ? 0.9 : 1), [B.chest, 0.6, B.head, 0.4], { z: 0.002, ao: 0.62 }), ring(1.51, 0.048 * (f ? 0.9 : 1), 0.050 * (f ? 0.9 : 1), 0.054 * (f ? 0.9 : 1), [B.chest, 0.2, B.head, 0.8], { z: 0.008, ao: 0.6 }), ring(1.56, 0.048 * (f ? 0.9 : 1), 0.048, 0.054, [B.head, 1], { z: 0.012, ao: 0.6 })], 12, { mat: SKIN, col: C.skin });
  const hs = f ? 0.955 : 1, hd = [B.head, 1], face = (p, mat) => [p[0] / (0.075 * hs), (p[1] - HC) / (HH * hs), (p[2] - HZ) / (0.09 * hs), mat];
  const headRings = (grow) => refine(HEAD.map(h => ring(HC + h[0] * HH * hs, (h[2] * (f && h[0] < -0.3 ? 0.94 : 1) + grow) * hs, (h[3] + grow) * hs, (h[4] + grow) * hs, hd, { z: HZ + h[1] * hs, e: 2.15 })), 2);
  loft(G, headRings(0), 22, { mat: SKIN, col: C.skin, face, aof: (p) => 1 - 0.42 * sm(-0.55, -1.0, (p[1] - HC) / (HH * hs)) });
  ellipsoid(G, [0, HC - 0.012 * hs, HZ + 0.0815 * hs], [0.0062 * hs, 0.0260 * hs, 0.0095 * hs], { sk: hd, col: C.skin, mat: SKIN, rotX: -0.30, n: 5, seg: 8, face });   // nose: bridge, tip, wings
  ellipsoid(G, [0, HC - 0.035 * hs, HZ + 0.0885 * hs], [0.0085 * hs, 0.0080 * hs, 0.0100 * hs], { sk: hd, col: C.skin, mat: SKIN, n: 5, seg: 8, face });
  for (const sx of [1, -1]) ellipsoid(G, [sx * 0.0090 * hs, HC - 0.0385 * hs, HZ + 0.0830 * hs], [0.0058 * hs, 0.0052 * hs, 0.0068 * hs], { sk: hd, col: C.skin, mat: SKIN, n: 4, seg: 6, face });
  for (const sx of [1, -1]) ellipsoid(G, [sx * 0.0765 * hs, HC - 0.006 * hs, HZ - 0.006 * hs], [0.0085 * hs, 0.029 * hs, 0.017 * hs], { sk: hd, col: mul(C.skin, 0.94), mat: SKIN, rotX: 0.2, n: 4, seg: 8 });
  if (o.mask) loft(G, refine([ring(HC - 0.108 * hs, 0.030 * hs, 0.050 * hs, 0.01, hd, { z: HZ + 0.030 }), ring(HC - 0.085 * hs, 0.058 * hs, 0.070 * hs, 0.01, hd, { z: HZ + 0.020 }), ring(HC - 0.050 * hs, 0.070 * hs, 0.080 * hs, 0.01, hd, { z: HZ + 0.018 }), ring(HC - 0.018 * hs, 0.072 * hs, 0.079 * hs, 0.01, hd, { z: HZ + 0.016 }), ring(HC - 0.004 * hs, 0.060 * hs, 0.074 * hs, 0.01, hd, { z: HZ + 0.018 })], 2), 16, { mat: CLOTH, col: [0.72, 0.74, 0.76], capA: { col: [0.7, 0.72, 0.74] }, capB: { col: [0.7, 0.72, 0.74] } });
  hair(G, o, C, hs, f);
  if (o.cap) { const cc = o.capCol || [0.05, 0.06, 0.09]; loft(G, refine(HEAD.filter(h => h[0] >= 0.30).map(h => ring(HC + h[0] * HH * hs, (h[2] + 0.014) * hs, (h[3] + 0.014) * hs, (h[4] + 0.016) * hs, hd, { z: HZ + h[1] * hs })), 2), 18, { mat: CLOTH, col: cc, capA: { col: cc } });
    loft(G, [ring(HC + 0.33 * HH * hs, 0.070 * hs, 0.16 * hs, 0.02, hd, { z: HZ + 0.03 }), ring(HC + 0.36 * HH * hs, 0.068 * hs, 0.155 * hs, 0.02, hd, { z: HZ + 0.03 })], 14, { mat: CLOTH, col: cc, capA: { col: mul(cc, 0.6) }, capB: { col: cc } }); }
  // ---- backpack
  if (o.pack) { const pc = C.bag || [0.05, 0.05, 0.055], sk = [B.chest, 1]; loft(G, refine([ring(1.02, 0.10, 0.02, 0.05, sk, { z: -0.150, e: 3 }), ring(1.06, 0.135, 0.02, 0.085, sk, { z: -0.140, e: 3.5 }), ring(1.22, 0.140, 0.02, 0.095, sk, { z: -0.135, e: 3.5 }), ring(1.36, 0.130, 0.02, 0.080, sk, { z: -0.130, e: 3.2 }), ring(1.42, 0.09, 0.02, 0.045, sk, { z: -0.125, e: 2.6 }), ring(1.435, 0.03, 0.01, 0.015, sk, { z: -0.12 })], 2), 16, { mat: CLOTH, col: pc, capA: { col: pc } });
    for (const sx of [1, -1]) loft(G, refine([ring(1.425, 0.015, 0.005, 0.005, sk, { x: sx * 0.112, z: -0.02 }), ring(1.405, 0.015, 0.005, 0.005, sk, { x: sx * 0.118, z: 0.060 * bw + tk }), ring(1.33, 0.015, 0.005, 0.005, sk, { x: sx * 0.130, z: 0.104 * bw + tk }), ring(1.22, 0.015, 0.005, 0.005, sk, { x: sx * 0.142, z: 0.094 * bw + tk }), ring(1.12, 0.014, 0.005, 0.005, sk, { x: sx * 0.150, z: 0.02 })], 2), 6, { mat: CLOTH, col: pc }); }
  // ---- finish: scale, typed arrays
  const n = G.n, pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = G.P[i] * s;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(G.N), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(G.C), 4));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(G.SI), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(G.SW), 4)); g.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(G.F), 4)); g.setIndex(G.I);
  const J = [[0, LEN.pelY, 0], [0, LEN.chestY, 0], [0, LEN.headY, 0.004], [shX, LEN.shY, 0], [shX, LEN.shY - LEN.ua, 0], [-shX, LEN.shY, 0], [-shX, LEN.shY - LEN.ua, 0], [hipX, LEN.pelY, 0], [hipX, LEN.pelY - LEN.th, 0], [hipX, LEN.ankle, 0], [-hipX, LEN.pelY, 0], [-hipX, LEN.pelY - LEN.th, 0], [-hipX, LEN.ankle, 0]].map(p => [p[0] * s, p[1] * s, p[2] * s]);
  return { geometry: g, bind: J, s, shX: shX * s };
}

function shoe(G, sx, b, o, C) { // sole slab with a foot outline, upper lofted along z; the ankle joint is the origin
  const x = sx * LEN.hipX, ft = [b.ft, 1], lea = o.shoe === 'leather', k = o.sex === 'f' ? 0.92 : 1, up = C.shoe, so = C.sole || [0.55, 0.54, 0.5], sh = (lea ? 0.011 : 0.024) * k, heelH = lea ? 0.012 * k : 0;
  const outline = (p, r, a) => { const dz = (p[2] - r.z) / (0.130 * k), nar = 1 - 0.20 * sm(0.1, -1.0, dz) - 0.10 * sm(0.55, 1.0, dz); return [r.x + (p[0] - r.x) * nar + sx * 0.006 * k * sm(-0.2, 0.8, dz), p[1] + (dz < -0.35 ? 0 : 0), p[2]]; };
  loft(G, [ring(0.0, 0.049 * k, 0.137 * k, 0.130 * k, ft, { x, z: 0.055 * k, e: 2.7, ao: 0.5 }), ring(sh * 0.5, 0.050 * k, 0.139 * k, 0.132 * k, ft, { x, z: 0.055 * k, e: 2.7, ao: 0.8 }), ring(sh, 0.049 * k, 0.137 * k, 0.130 * k, ft, { x, z: 0.055 * k, e: 2.7 })], 20, { mat: SOLE, col: so, warp: outline, capA: { col: mul(so, 0.5), ao: 0.5 }, capB: { col: so } });
  const P = lea ? [[-0.074, 0.016, 0.030], [-0.066, 0.031, 0.050], [-0.044, 0.037, 0.062], [-0.014, 0.039, 0.064], [0.022, 0.041, 0.058], [0.062, 0.044, 0.046], [0.102, 0.046, 0.038], [0.142, 0.043, 0.032], [0.170, 0.033, 0.026], [0.185, 0.016, 0.016], [0.189, 0.005, 0.006]]
    : [[-0.074, 0.016, 0.034], [-0.066, 0.031, 0.056], [-0.044, 0.038, 0.076], [-0.014, 0.041, 0.084], [0.022, 0.043, 0.078], [0.062, 0.046, 0.060], [0.102, 0.048, 0.046], [0.142, 0.046, 0.038], [0.170, 0.036, 0.031], [0.185, 0.018, 0.020], [0.189, 0.005, 0.008]];
  const R = refine(P.map(p => ({ x: x + sx * 0.006 * k * sm(0.02, 0.15, p[0]), y: sh - 0.004 + p[2] * k / 2, z: p[0] * k, rx: p[1] * k * (1 - 0.14 * sm(0.0, -0.07, p[0])), rf: p[2] * k / 2, rb: p[2] * k / 2, e: 2.6, ao: 1, sk: ft })), 2, 'z');
  loft(G, R, 12, { axis: 'z', mat: SHOE, col: up, aof: (p) => 0.6 + 0.4 * sm(sh, sh + 0.025, p[1]) });
  if (heelH) loft(G, [ring(-heelH, 0.036 * k, 0.040 * k, 0.040 * k, ft, { x, z: -0.036 * k, e: 2.6, ao: 0.5 }), ring(0.002, 0.037 * k, 0.041 * k, 0.041 * k, ft, { x, z: -0.036 * k, e: 2.6, ao: 0.7 })], 10, { mat: SOLE, col: so, capA: { col: mul(so, 0.5), ao: 0.5 } });
}

function hair(G, o, C, hs, f) {
  const st = o.hair || 'short', hd = [B.head, 1], hc = C.hair, L = { // hairline (in t) at 0, 45, 75, 100, 130, 180 degrees from the front
    short: [0.60, 0.50, 0.16, 0.02, -0.28, -0.52], crop: [0.66, 0.58, 0.30, 0.16, -0.10, -0.38], bob: [0.34, 0.20, -0.72, -0.86, -0.92, -0.95], long: [0.42, 0.26, -0.80, -0.99, -0.99, -0.99], tail: [0.56, 0.48, 0.06, -0.10, -0.42, -0.60], bun: [0.56, 0.48, 0.06, -0.10, -0.42, -0.60], grey: [0.70, 0.60, 0.20, 0.04, -0.26, -0.50] }[st] || [0.6, 0.5, 0.16, 0.02, -0.28, -0.52];
  const A = [0, 45, 75, 100, 130, 180], line = a => { const d = Math.abs(a > Math.PI ? a - TAU : a) * 180 / Math.PI; let i = 0; while (i < A.length - 2 && A[i + 1] < d) i++; const t = clamp((d - A[i]) / (A[i + 1] - A[i]), 0, 1); return L[i] + (L[i + 1] - L[i]) * (t * t * (3 - 2 * t)); };
  const vol = { short: 0.010, crop: 0.006, bob: 0.017, long: 0.016, tail: 0.011, bun: 0.011, grey: 0.008 }[st] || 0.01;
  const R = refine(HEAD.map(h => ring(HC + h[0] * HH * hs, (h[2] + vol * (0.8 + 0.5 * sm(0.0, 0.9, h[0]))) * hs, (h[3] + vol) * hs, (h[4] + vol * 1.15) * hs, hd, { z: HZ + h[1] * hs, e: 2.1 })), 3);
  loft(G, R, 26, { mat: HAIR, col: hc, warp: (p, r, a) => { const t = (p[1] - HC) / (HH * hs), ln = line(a), d = t - ln; if (d >= 0.0) return null; const k = 0.80; return [r.x + (p[0] - r.x) * k, p[1] + Math.min(0.03, -d * 0.02), r.z + (p[2] - r.z) * k]; },
    aof: (p, r, a) => { const t = (p[1] - HC) / (HH * hs), d = t - line(a); return 0.62 + 0.38 * sm(0.0, 0.35, d); } });
  if (st === 'long') { const sk = [B.head, 0.55, B.chest, 0.45]; loft(G, refine([ring(HC - 0.10, 0.074 * hs, 0.02, 0.105 * hs, hd, { z: HZ - 0.01 }), ring(1.46, 0.082, 0.015, 0.105, [B.head, 0.8, B.chest, 0.2], { z: -0.01 }), ring(1.40, 0.090, 0.01, 0.118, sk, { z: -0.01 }), ring(1.31, 0.086, 0.005, 0.128, sk, { z: -0.005 }), ring(1.24, 0.070, 0.004, 0.126, [B.chest, 1], { z: 0 }), ring(1.215, 0.03, 0.002, 0.120, [B.chest, 1], { z: 0 })], 2), 16, { mat: HAIR, col: hc, capA: { col: hc } }); }
  if (st === 'tail') loft(G, refine([ring(HC + 0.045, 0.022, 0.022, 0.022, hd, { z: HZ - 0.105 * hs }), ring(HC + 0.02, 0.030, 0.026, 0.030, hd, { z: HZ - 0.125 * hs }), ring(HC - 0.06, 0.028, 0.022, 0.030, hd, { z: HZ - 0.130 * hs }), ring(HC - 0.14, 0.022, 0.018, 0.024, hd, { z: HZ - 0.120 * hs }), ring(HC - 0.20, 0.006, 0.006, 0.008, hd, { z: HZ - 0.112 * hs })], 2), 10, { mat: HAIR, col: hc });
  if (st === 'bun') ellipsoid(G, [0, HC + 0.070 * hs, HZ - 0.095 * hs], [0.040, 0.036, 0.040], { sk: hd, col: hc, mat: HAIR, n: 5, seg: 10 });
}

// CPU skinning: bake a pose into world-space positions and normals (used for people who do not move)
export function bakePose(geo, mats /* Matrix4[NB] = world x inverse bind */) {
  const P = geo.attributes.position, N = geo.attributes.normal, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, n = P.count, op = new Float32Array(n * 3), on = new Float32Array(n * 3), v = new THREE.Vector3(), a = new THREE.Vector3(), m3 = mats.map(m => new THREE.Matrix3().setFromMatrix4(m));
  for (let i = 0; i < n; i++) { let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w <= 0) continue; const bi = SI.getComponent(i, k); v.fromBufferAttribute(P, i).applyMatrix4(mats[bi]); x += v.x * w; y += v.y * w; z += v.z * w; a.fromBufferAttribute(N, i).applyMatrix3(m3[bi]); nx += a.x * w; ny += a.y * w; nz += a.z * w; }
    const L = Math.hypot(nx, ny, nz) || 1; op[i * 3] = x; op[i * 3 + 1] = y; op[i * 3 + 2] = z; on[i * 3] = nx / L; on[i * 3 + 1] = ny / L; on[i * 3 + 2] = nz / L; }
  return { position: op, normal: on };
}

// ---------------------------------------------------------------- skeleton and poses
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _k = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), DOWN = new THREE.Vector3(0, -1, 0), XA = new THREE.Vector3(1, 0, 0), IDQ = new THREE.Quaternion();
export class Rig {
  constructor(person) { this.s = person.s; this.shX = person.shX; this.bind = person.bind; this.bones = []; const inv = [];
    for (let i = 0; i < NB; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; this.bones.push(b); const J = person.bind[i]; inv.push(new THREE.Matrix4().makeTranslation(-J[0], -J[1], -J[2])); }
    this.skeleton = new THREE.Skeleton(this.bones, inv); this.qYaw = new THREE.Quaternion(); this.x = this.y = this.z = 0; this.cy = 1; this.sy = 0; this.qP = new THREE.Quaternion(); this.qC = new THREE.Quaternion(); this.pv = new THREE.Vector3(); this.cv = new THREE.Vector3(); }
  root(x, y, z, yaw) { this.x = x; this.y = y; this.z = z; this.cy = Math.cos(yaw); this.sy = Math.sin(yaw); this.qYaw.setFromAxisAngle(_p.set(0, 1, 0), yaw); }
  _set(i, l, q) { _p.set(this.x + l.x * this.cy + l.z * this.sy, this.y + l.y, this.z - l.x * this.sy + l.z * this.cy); _q.copy(this.qYaw).multiply(q); this.bones[i].matrixWorld.compose(_p, _q, ONE); }
  _limb(i, a, b) { _d.copy(b).sub(a).normalize(); _q2.setFromUnitVectors(DOWN, _d); this._set(i, a, _q2); }
  // two-bone IK: joint position between a and b with segment lengths l1, l2, bending towards pole
  _ik(a, b, l1, l2, pole, out) { _d.copy(b).sub(a); let L = _d.length(); const mx = l1 + l2 - 0.003; if (L > mx) { b.copy(a).addScaledVector(_d, mx / L); L = mx; _d.copy(b).sub(a); } _d.multiplyScalar(1 / L);
    const al = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - al * al)); _n.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_n.lengthSq() < 1e-8) _n.set(0, 0, 1); _n.normalize(); return out.copy(a).addScaledVector(_d, al).addScaledVector(_n, h); }
  // torso: pelvis position (local) with rotations of the pelvis and chest; returns nothing, fills hips/shoulders
  _torso(px, py, pz, qP, qC, turn, nod) { const s = this.s, L = LEN; this.qP.copy(qP); this.qC.copy(qC); this.pv.set(px, py, pz); this._set(B.pel, this.pv, qP);
    this.cv.set(0, (L.chestY - L.pelY) * s, 0).applyQuaternion(qP).add(this.pv); this._set(B.chest, this.cv, qC);
    _k.set(0, (L.headY - L.chestY) * s, 0.004 * s).applyQuaternion(qC).add(this.cv); _e.set(nod || 0, turn || 0, 0, 'YXZ'); _q2.setFromEuler(_e); this._set(B.head, _k, _q2); }
  _hip(sx, out) { return out.set(sx * LEN.hipX * this.s, 0, 0).applyQuaternion(this.qP).add(this.pv); }
  _shoulder(sx, out) { return out.set(sx * this.shX, (LEN.shY - LEN.chestY) * this.s, 0).applyQuaternion(this.qC).add(this.cv); }
  _leg(sx, ankle, pitch, pole) { const s = this.s, th = sx > 0 ? B.thL : B.thR, H = this._hip(sx, this._a || (this._a = new THREE.Vector3())), K = this._ik(H, ankle, LEN.th * s, LEN.sh * s, pole, this._b || (this._b = new THREE.Vector3()));
    this._limb(th, H, K); this._limb(th + 1, K, ankle); _q2.setFromAxisAngle(XA, -pitch); this._set(th + 2, ankle, _q2); }
  _arm(sx, elbow, wrist) { const ua = sx > 0 ? B.uaL : B.uaR, S = this._shoulder(sx, this._c || (this._c = new THREE.Vector3())); this._limb(ua, S, elbow); this._limb(ua + 1, elbow, wrist); }
  // one frame of the walking or jogging cycle. ph = phase (2 pi per stride), v = speed, T = stride period
  walk(ph, v, T, jog, o = {}) {
    const s = this.s, L = LEN, st = jog ? 0.38 : 0.60, stride = v * st * T, A = L.ankle * s, hl = 0.06 * s, bl = 0.13 * s;
    const bobA = (jog ? 0.038 : 0.017) * s, bob = -bobA * Math.cos(2 * (ph - TAU * (jog ? 0.19 : 0.05))), hipY = (jog ? 0.86 : 0.88) * s + bob, lean = jog ? 0.16 : 0.035, tw = (jog ? 0.10 : 0.07) * Math.cos(ph), sway = (jog ? 0.008 : 0.014) * s * Math.sin(ph);
    _e.set(0, -tw, (jog ? 0.03 : 0.035) * Math.sin(ph), 'YXZ'); const qP = this._qp || (this._qp = new THREE.Quaternion()); qP.setFromEuler(_e); _e.set(lean, tw * 0.9, 0, 'YXZ'); const qC = this._qc || (this._qc = new THREE.Quaternion()); qC.setFromEuler(_e);
    this._torso(sway, hipY, jog ? 0.02 * s : 0, qP, qC, o.turn || 0, (o.nod || 0) + (jog ? 0.02 : 0));
    const pole = this._pole || (this._pole = new THREE.Vector3()), an = this._an || (this._an = new THREE.Vector3()), el = this._el || (this._el = new THREE.Vector3()), wr = this._wr || (this._wr = new THREE.Vector3());
    const p0 = -0.9, p1 = jog ? 0.12 : 0.30, zF = 0.41 * stride, zB = -0.59 * stride, fx = (jog ? 0.035 : 0.05) * s;
    const heel = (zg, p, out) => out.set(0, hl * Math.sin(p) + A * Math.cos(p), zg - hl + hl * Math.cos(p) - A * Math.sin(p)), ball = (zg, p, out) => out.set(0, -bl * Math.sin(p) + A * Math.cos(p), zg + bl - bl * Math.cos(p) - A * Math.sin(p));
    for (const sx of [1, -1]) { const u = (((ph / TAU + (sx > 0 ? 0 : 0.5)) % 1) + 1) % 1; let pitch;
      if (u < st) { const q = u / st, zg = zF + (zB - zF) * q; if (q < 0.14) { pitch = p1 * (1 - q / 0.14); heel(zg, pitch, an); } else if (q < 0.55) { pitch = 0; an.set(0, A, zg); } else { pitch = p0 * Math.pow((q - 0.55) / 0.45, 1.3); ball(zg, pitch, an); } }
      else { const k = (u - st) / (1 - st), e = k * k * (3 - 2 * k), a0 = ball(zB, p0, this._t0 || (this._t0 = new THREE.Vector3())), a1 = heel(zF, p1, this._t1 || (this._t1 = new THREE.Vector3()));
        pitch = k < 0.4 ? p0 + (-0.3 - p0) * (k / 0.4) : -0.3 + (p1 + 0.3) * ((k - 0.4) / 0.6); an.set(0, a0.y + (a1.y - a0.y) * e + (jog ? 0.30 : 0.06) * s * Math.sin(Math.PI * Math.pow(k, jog ? 0.55 : 0.65)), a0.z + (a1.z - a0.z) * (jog ? e : k * 0.35 + e * 0.65)); }
      an.x = sx * fx; this._leg(sx, an, pitch, pole.set(sx * 0.06, 0, 1));
      // arms swing against the legs
      const a = (jog ? 0.75 : 0.36) * (o.arm === undefined ? 1 : o.arm) * (sx > 0 ? -1 : 1) * Math.cos(ph), be = jog ? 1.5 : 0.22 + 0.20 * Math.max(0, (sx > 0 ? -1 : 1) * Math.cos(ph)) + (o.bend || 0), S = this._shoulder(sx, this._c || (this._c = new THREE.Vector3())), out = jog ? 0.10 : 0.075;
      _d.set(sx * out, -Math.cos(a), Math.sin(a)).applyQuaternion(qC).normalize(); el.copy(S).addScaledVector(_d, L.ua * s); _d.set(sx * (jog ? -0.12 : 0.035), -Math.cos(a + be), Math.sin(a + be)).applyQuaternion(qC).normalize(); wr.copy(el).addScaledVector(_d, L.fa * s); this._arm(sx, el, wr); }
  }
  // sitting on the ground or on a ledge. feet: [[x, y, z] left, right] in local coordinates (ankle height is added here); mode 0 = hands on knees, 1 = leaning back on the hands
  sit(feet, o = {}) {
    const s = this.s, L = LEN, mode = o.mode || 0, lean = o.lean === undefined ? (mode ? -0.32 : 0.16) : o.lean, qP = this._qp || (this._qp = new THREE.Quaternion()), qC = this._qc || (this._qc = new THREE.Quaternion());
    _e.set(mode ? -0.30 : -0.12, 0, 0, 'YXZ'); qP.setFromEuler(_e); _e.set(lean, o.twist || 0, 0, 'YXZ'); qC.setFromEuler(_e); this._torso(0, 0.095 * s, 0, qP, qC, o.turn || 0, o.nod === undefined ? (mode ? 0.25 : 0.02) : o.nod);
    const pole = this._pole || (this._pole = new THREE.Vector3()), an = this._an || (this._an = new THREE.Vector3()), el = this._el || (this._el = new THREE.Vector3()), wr = this._wr || (this._wr = new THREE.Vector3()), kn = [];
    for (const sx of [1, -1]) { const f = feet[sx > 0 ? 0 : 1]; an.set(f[0], f[1] + L.ankle * s, f[2]); this._leg(sx, an, o.pitch || 0, pole.set(sx * 0.15, 1, 0.6)); kn.push(this._b.clone()); }
    for (const sx of [1, -1]) { const S = this._shoulder(sx, this._c || (this._c = new THREE.Vector3())).clone(), K = kn[sx > 0 ? 0 : 1];
      if (mode) wr.set(sx * 0.27 * s, 0.035 * s, -0.30 * s); else { const H = this._hip(sx, _k); wr.copy(H).lerp(K, 0.60); wr.x *= 0.9; wr.y += 0.082 * s; }
      this._ik(S, wr, L.ua * s, L.fa * s, pole.set(sx * 0.9, mode ? 0.2 : -0.2, -1), el); const ua = sx > 0 ? B.uaL : B.uaR; this._limb(ua, S, el); this._limb(ua + 1, el, wr); }
  }
  stand(o = {}) { const s = this.s, L = LEN, qP = this._qp || (this._qp = new THREE.Quaternion()), qC = this._qc || (this._qc = new THREE.Quaternion()), sh = o.shift || 0; _e.set(0, 0, sh * 0.06, 'YXZ'); qP.setFromEuler(_e); _e.set(o.lean || 0.02, o.twist || 0, -sh * 0.05, 'YXZ'); qC.setFromEuler(_e);   // weight on one leg: the hips tip a little, the shoulders tip back
    this._torso(sh * 0.025 * s, 0.903 * s, 0, qP, qC, o.turn || 0, o.nod || 0); const pole = this._pole || (this._pole = new THREE.Vector3()), an = this._an || (this._an = new THREE.Vector3()), el = this._el || (this._el = new THREE.Vector3()), wr = this._wr || (this._wr = new THREE.Vector3());
    for (const sx of [1, -1]) { an.set(sx * 0.095 * s, L.ankle * s, sx * 0.03 * s); this._leg(sx, an, 0, pole.set(sx * 0.1, 0, 1)); const S = this._shoulder(sx, this._c || (this._c = new THREE.Vector3())), up = o.phone && sx < 0;
      if (up) { _d.set(sx * 0.10, -0.92, 0.38).normalize(); el.copy(S).addScaledVector(_d, L.ua * s); _d.set(-sx * 0.35, 0.72, 0.60).normalize(); wr.copy(el).addScaledVector(_d, L.fa * s); }
      else { _d.set(sx * 0.085, -1, 0.02).normalize(); el.copy(S).addScaledVector(_d, L.ua * s); _d.set(sx * 0.03, -1, 0.16).normalize(); wr.copy(el).addScaledVector(_d, L.fa * s); } this._arm(sx, el, wr); } }
  bindPose() { for (let i = 0; i < NB; i++) { const J = this.bind[i]; this._set(i, _k.set(J[0], J[1], J[2]), IDQ); } }
  matrices() { return this.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, this.skeleton.boneInverses[i])); }
}

// ---------------------------------------------------------------- wardrobe
const TOPC = [[0.78, 0.77, 0.74], [0.70, 0.66, 0.56], [0.50, 0.50, 0.50], [0.20, 0.20, 0.21], [0.025, 0.025, 0.03], [0.025, 0.025, 0.03], [0.03, 0.045, 0.10], [0.50, 0.42, 0.30], [0.16, 0.17, 0.09], [0.10, 0.17, 0.30], [0.40, 0.52, 0.66], [0.25, 0.04, 0.05], [0.52, 0.36, 0.08], [0.20, 0.11, 0.06], [0.05, 0.13, 0.08], [0.60, 0.38, 0.36]];
const BOTC = [[0.025, 0.025, 0.03], [0.025, 0.025, 0.03], [0.06, 0.06, 0.07], [0.03, 0.045, 0.10], [0.04, 0.07, 0.16], [0.04, 0.07, 0.16], [0.20, 0.30, 0.45], [0.48, 0.40, 0.28], [0.25, 0.23, 0.14], [0.24, 0.24, 0.25], [0.20, 0.12, 0.07]];
const SKINC = [[0.60, 0.42, 0.32], [0.66, 0.48, 0.38], [0.56, 0.38, 0.28], [0.70, 0.54, 0.44], [0.63, 0.45, 0.35]];
const SPORT = [[0.60, 0.72, 0.08], [0.60, 0.06, 0.05], [0.78, 0.77, 0.74], [0.20, 0.50, 0.75], [0.85, 0.35, 0.05], [0.03, 0.03, 0.035]];
export function randomSpec(rnd, kind) {
  const pick = a => a[(rnd() * a.length) | 0], rr = (a, b) => a + (b - a) * rnd(), f = rnd() < 0.5, old = rnd() < 0.16, o = { sex: f ? 'f' : 'm', s: f ? rr(0.885, 0.975) : rr(0.955, 1.055), bw: rr(0.90, 1.13) * (old ? 1.04 : 1), cols: {} }, C = o.cols;
  C.skin = pick(SKINC); C.hair = old ? (rnd() < 0.6 ? [0.42, 0.42, 0.42] : [0.16, 0.16, 0.16]) : (rnd() < 0.2 ? [0.10, 0.055, 0.03] : rnd() < 0.5 ? [0.016, 0.014, 0.013] : [0.03, 0.022, 0.018]);
  if (kind === 'kimono') { o.top = 'kimono'; o.bottom = 'kimono'; o.s *= 0.99; o.bw = Math.min(o.bw, 1.04); o.shoe = 'leather'; C.shoe = [0.74, 0.73, 0.70]; C.sole = f ? pick([[0.30, 0.05, 0.05], [0.05, 0.05, 0.05], [0.45, 0.35, 0.2]]) : [0.05, 0.05, 0.05]; o.hair = f ? pick(['bun', 'bun', 'tail', 'bob']) : pick(['short', 'crop']);
    C.top = f ? pick([[0.62, 0.36, 0.38], [0.38, 0.50, 0.62], [0.70, 0.64, 0.50], [0.45, 0.38, 0.55], [0.50, 0.06, 0.07], [0.05, 0.08, 0.20], [0.72, 0.70, 0.66], [0.20, 0.42, 0.36]]) : pick([[0.04, 0.06, 0.13], [0.10, 0.10, 0.11], [0.20, 0.17, 0.13], [0.05, 0.12, 0.10]]);
    C.obi = f ? pick([[0.55, 0.40, 0.10], [0.50, 0.05, 0.05], [0.05, 0.14, 0.08], [0.20, 0.07, 0.22], [0.72, 0.70, 0.62], [0.05, 0.07, 0.16], [0.62, 0.30, 0.10]]) : pick([[0.03, 0.03, 0.035], [0.25, 0.20, 0.12], [0.10, 0.10, 0.11]]); return o; }
  if (kind === 'jog') { o.top = 'tee'; o.bottom = rnd() < 0.75 ? 'shorts' : 'slim'; C.top = pick(SPORT); C.bot = rnd() < 0.7 ? [0.025, 0.025, 0.03] : [0.03, 0.045, 0.10]; o.shoe = 'sneaker'; C.shoe = pick(SPORT); C.sole = [0.7, 0.7, 0.68]; C.sock = rnd() < 0.5 ? [0.7, 0.7, 0.68] : [0.03, 0.03, 0.03]; o.cap = rnd() < 0.45; o.capCol = pick([[0.03, 0.03, 0.035], [0.7, 0.7, 0.68], [0.05, 0.07, 0.14]]); o.hair = f ? 'tail' : pick(['short', 'crop']); o.bw *= 0.94; return o; }
  o.top = pick(f ? ['shirt', 'shirt', 'jacket', 'hoodie', 'coat', 'coat', 'tee'] : ['shirt', 'shirt', 'jacket', 'jacket', 'hoodie', 'hoodie', 'tee', 'coat']);
  o.bottom = f ? pick(['pants', 'slim', 'wide', 'wide', 'skirt', 'long', 'long']) : pick(['pants', 'pants', 'slim', 'wide', rnd() < 0.3 ? 'shorts' : 'pants']);
  C.top = pick(TOPC); C.bot = pick(BOTC); if (o.bottom === 'skirt' || o.bottom === 'long') C.bot = pick([[0.025, 0.025, 0.03], [0.50, 0.42, 0.30], [0.66, 0.64, 0.58], [0.05, 0.07, 0.14], [0.16, 0.17, 0.09], [0.30, 0.10, 0.09], [0.22, 0.22, 0.23]]);
  if (Math.abs(C.top[0] - C.bot[0]) + Math.abs(C.top[1] - C.bot[1]) + Math.abs(C.top[2] - C.bot[2]) < 0.05 && rnd() < 0.7) C.top = pick(TOPC.slice(0, 4));   // avoid most single-colour outfits
  C.inner = pick([[0.74, 0.73, 0.70], [0.74, 0.73, 0.70], [0.45, 0.45, 0.45], [0.05, 0.05, 0.055], [0.40, 0.52, 0.66]]);
  if (o.bottom === 'skirt' && rnd() < 0.5) C.legs = [0.03, 0.03, 0.035];
  o.shoe = rnd() < (old ? 0.6 : 0.3) ? 'leather' : 'sneaker'; if (o.shoe === 'leather') { C.shoe = rnd() < 0.6 ? [0.02, 0.02, 0.022] : [0.14, 0.07, 0.035]; C.sole = [0.03, 0.03, 0.03]; } else { C.shoe = pick([[0.72, 0.72, 0.70], [0.72, 0.72, 0.70], [0.03, 0.03, 0.035], [0.03, 0.03, 0.035], [0.30, 0.30, 0.31], [0.05, 0.07, 0.14], [0.45, 0.07, 0.06]]); C.sole = [0.72, 0.72, 0.69]; }
  C.sock = pick([[0.7, 0.7, 0.68], [0.03, 0.03, 0.03], [0.03, 0.03, 0.03], [0.25, 0.25, 0.26]]);
  o.hair = old ? (f ? pick(['bob', 'grey']) : 'grey') : f ? pick(['bob', 'bob', 'long', 'long', 'tail', 'bun']) : pick(['short', 'short', 'short', 'crop']);
  if (kind === 'sit') { o.sit = true; if (o.top === 'coat') o.top = 'jacket'; } o.pack = kind !== 'sit' && rnd() < 0.28; C.bag = pick([[0.03, 0.03, 0.035], [0.03, 0.03, 0.035], [0.05, 0.07, 0.14], [0.30, 0.24, 0.14], [0.20, 0.05, 0.05]]); o.mask = rnd() < 0.10; return o;
}
