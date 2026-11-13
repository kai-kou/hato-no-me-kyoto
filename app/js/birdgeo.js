// Procedural rock pigeon: one indexed geometry with 2-bone skin weights, feather sweep data and pattern coordinates.
// Body frame: +Z forward, +Y up, +X = bird's left. Units: metres. Bind pose = wings spread (flight), neck half raised.
import * as THREE from './three.module.min.js';

export const BONE = { body: 0, head: 1, armL: 2, foreL: 3, handL: 4, armR: 5, foreR: 6, handR: 7, tail: 8, tibL: 9, tarL: 10, footL: 11, tibR: 12, tarR: 13, footR: 14 };
export const NB = 15;
const V = (x, y, z) => new THREE.Vector3(x, y, z), nrm = a => V(a[0], a[1], a[2]).normalize();
export const RIG = (() => {
  const R = { neckBase: V(0, 0.018, 0.074), head: V(0, 0.084, 0.122), shoulder: V(0.043, 0.030, 0.045), tail: V(0, 0.010, -0.104), hip: V(0.026, -0.032, -0.012), tib: 0.050, tar: 0.032, armLen: 0.045, foreLen: 0.058, handLen: 0.050 };
  R.armDir = nrm([0.8, 0, -0.6]); R.foreDir = nrm([0.8, 0, 0.6]); R.handDir = nrm([0.97, 0, -0.25]);
  R.elbow = R.shoulder.clone().addScaledVector(R.armDir, R.armLen); R.wrist = R.elbow.clone().addScaledVector(R.foreDir, R.foreLen); R.tip = R.wrist.clone().addScaledVector(R.handDir, R.handLen);
  R.ankle = R.hip.clone().add(V(0, -R.tib, 0)); R.foot = R.ankle.clone().add(V(0, -R.tar, 0));
  // folded-wing frames (left wing): rotation taking the bind bone frame to the folded frame
  const frameQ = (dB, dF, nF) => { const e1 = dB.clone(), e2 = V(0, 1, 0), e3 = e1.clone().cross(e2); const f1 = dF.clone().normalize(), f2 = nF.clone().addScaledVector(f1, -nF.dot(f1)).normalize(), f3 = f1.clone().cross(f2);
    const A = new THREE.Matrix4().makeBasis(e1, e2, e3), Bm = new THREE.Matrix4().makeBasis(f1, f2, f3); return new THREE.Quaternion().setFromRotationMatrix(Bm.multiply(A.transpose())); };
  const nF = nrm([0.93, 0.36, 0.02]);
  R.foldArm = frameQ(R.armDir, nrm([0.12, -0.34, -0.93]), nF); R.foldFore = frameQ(R.foreDir, nrm([0.06, 0.30, 0.95]), nF); R.foldHand = frameQ(R.handDir, nrm([0.03, -0.20, -0.98]), nF);
  return R;
})();
export const mirrorQ = q => new THREE.Quaternion(q.x, -q.y, -q.z, q.w);

const PROF = [[-0.118, 0.010, 0.009, 0.009, 0.010], [-0.100, 0.026, 0.021, 0.022, 0.008], [-0.075, 0.038, 0.031, 0.035, 0.004], [-0.045, 0.045, 0.039, 0.044, 0.001], [-0.012, 0.048, 0.043, 0.050, -0.001], [0.020, 0.048, 0.044, 0.053, -0.003], [0.048, 0.044, 0.041, 0.051, -0.002], [0.070, 0.037, 0.036, 0.044, 0.004], [0.088, 0.028, 0.029, 0.033, 0.012], [0.100, 0.017, 0.019, 0.020, 0.019]];
function crRow(i, t, k) { const P = PROF, n = P.length, p0 = P[Math.max(0, i - 1)][k], p1 = P[i][k], p2 = P[Math.min(n - 1, i + 1)][k], p3 = P[Math.min(n - 1, i + 2)][k]; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); }
function bodyAt(z) { const P = PROF, n = P.length; if (z <= P[0][0]) return { rx: P[0][1], ryT: P[0][2], ryB: P[0][3], cy: P[0][4] }; for (let i = 0; i < n - 1; i++) if (z <= P[i + 1][0]) { const t = (z - P[i][0]) / (P[i + 1][0] - P[i][0]); return { rx: crRow(i, t, 1), ryT: crRow(i, t, 2), ryB: crRow(i, t, 3), cy: crRow(i, t, 4) }; } const e = P[n - 1]; return { rx: e[1], ryT: e[2], ryB: e[3], cy: e[4] }; }
export function buildPigeonGeometry() {
  const P = [], S = [], F = [], T = [], I = [];
  const vtx = (p, skin, fea, pat) => { P.push(p.x, p.y, p.z); S.push(skin[0], skin[1], skin[2]); F.push(fea[0], fea[1], fea[2]); T.push(pat[0], pat[1], pat[2], pat[3]); return P.length / 3 - 1; };
  const quad = (a, b, c, d) => { I.push(a, b, c, a, c, d); };
  const NOF = [0, 0, 0];
  const SEAM = []; // pairs of vertices at the same place on either side of a pattern seam; their normals are joined after the normals are computed
  // generic loft: rings[i] = {c:Vector3, ax:Vector3 (ring normal), up:Vector3, rx, ryT, ryB, skin, u}; closes both ends with caps
  function loft(rings, segs, region, puff, capA = true, capB = true) {
    const base = P.length / 3; const n = rings.length, W = segs + 1;
    for (let i = 0; i < n; i++) { const r = rings[i], ax = r.ax.clone().normalize(), side = r.up.clone().cross(ax).normalize(), up = ax.clone().cross(side).normalize();
      for (let k = 0; k <= segs; k++) { const th = (k % segs) / segs * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th); const p = r.c.clone().addScaledVector(side, sn * r.rx).addScaledVector(up, cs * (cs > 0 ? r.ryT : r.ryB)); const id = vtx(p, r.skin, NOF, [r.u, k / segs, region, puff]); if (k === segs) SEAM.push(id - segs, id); } }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < segs; k++) { const a = base + i * W + k, b = a + 1, c = base + (i + 1) * W + k + 1, d = base + (i + 1) * W + k; quad(a, d, c, b); }
    const cap = (i, flip) => { const r = rings[i], cI = vtx(r.c.clone().addScaledVector(r.ax.clone().normalize(), (flip ? -1 : 1) * Math.min(r.rx, r.ryT) * 0.55), r.skin, NOF, [r.u, 0.5, region, puff]); for (let k = 0; k < segs; k++) { const a = base + i * W + k, b = a + 1; if (flip) I.push(cI, a, b); else I.push(cI, b, a); } };
    if (capA) cap(0, true); if (capB) cap(n - 1, false);
  }
  const Z = V(0, 0, 1), Y = V(0, 1, 0), X = V(1, 0, 0), sk = (b0, b1 = b0, w = 0) => [b0, b1, w];
  // ---- torso (tail end -> breast)
  { const prof = PROF, rings = [], n = prof.length;
    for (let i = 0; i < n; i++) for (let h = 0; h < (i < n - 1 ? 2 : 1); h++) { const z = h ? (prof[i][0] + prof[i + 1][0]) / 2 : prof[i][0], B = bodyAt(z); rings.push({ c: V(0, B.cy, z), ax: Z, up: Y, rx: B.rx, ryT: B.ryT, ryB: B.ryB, skin: sk(0), u: (i + h * 0.5) / (n - 1) }); }
    loft(rings, 24, 0, 1); }
  // ---- neck (blend body -> head)
  { const A = RIG.neckBase, Bh = RIG.head, n = 10, rings = []; const dir = Bh.clone().sub(A).normalize();
    for (let i = 0; i < n; i++) { const t = i / (n - 1), c = A.clone().lerp(Bh, t * 0.93).add(V(0, -0.006 * Math.sin(t * Math.PI), 0.010 * Math.sin(t * Math.PI))); const r = 0.034 * (1 - t) ** 1.25 + 0.0165 * (1 - (1 - t) ** 1.25); const w = t * t * (3 - 2 * t);
      rings.push({ c, ax: dir.clone().lerp(Z, 0.25 * (1 - t)).normalize(), up: Y, rx: r, ryT: r * 0.96, ryB: r * 1.05, skin: sk(0, 1, w), u: t }); }
    loft(rings, 18, 1, 1, false, false); }
  // ---- head
  { const H = RIG.head, la = 12, lo = 20, base = P.length / 3;
    for (let i = 0; i <= la; i++) { const ph = i / la * Math.PI; for (let k = 0; k <= lo; k++) { const th = (k % lo) / lo * Math.PI * 2; let x = Math.sin(ph) * Math.sin(th), y = Math.sin(ph) * Math.cos(th), z = Math.cos(ph);
      const fz = z > 0 ? 1.0 + 0.10 * z : 1.0; const yy = y > 0 ? y * (1.0 - 0.10 * Math.max(0, z)) : y; const id = vtx(V(H.x + x * 0.0168, H.y + yy * 0.0172 + 0.002 * Math.max(0, -z), H.z + z * 0.0205 * fz), sk(1), NOF, [1 - i / la, k / lo, 2, 0.35]); if (k === lo) SEAM.push(id - lo, id); } }
    for (let i = 0; i < la; i++) for (let k = 0; k < lo; k++) { const a = base + i * (lo + 1) + k, b = a + 1, c = base + (i + 1) * (lo + 1) + k + 1, d = base + (i + 1) * (lo + 1) + k; quad(a, b, c, d); }
    // beak: upper + lower mandible
    const beak = (y0, len, r0, droop, reg) => { const rings = []; for (let i = 0; i < 9; i++) { const t = i / 8; rings.push({ c: V(H.x, H.y + y0 - droop * t * t, H.z + 0.0165 + len * t), ax: Z, up: Y, rx: r0 * (1 - t) ** 0.8 + 0.0006, ryT: r0 * 0.8 * (1 - t) ** 0.9 + 0.0005, ryB: r0 * 0.45 * (1 - t) + 0.0004, skin: sk(1), u: t }); } loft(rings, 16, reg, 0, false, true); };
    beak(-0.0015, 0.0215, 0.0050, 0.0035, 3); beak(-0.0052, 0.0165, 0.0036, 0.0005, 3);
    // cere (two pale swellings over the nostrils)
    for (const sx of [-1, 1]) { const rings = []; for (let i = 0; i < 4; i++) { const t = i / 3; const r = 0.0034 * Math.sin((t * 0.86 + 0.07) * Math.PI); rings.push({ c: V(H.x + sx * 0.0022, H.y + 0.0030 - 0.002 * t, H.z + 0.0155 + 0.009 * t), ax: Z, up: Y, rx: r, ryT: r, ryB: r * 0.6, skin: sk(1), u: t }); } loft(rings, 6, 4, 0); }
    // eyes: small spheres, u = angle from the outward axis (pupil / iris / ring in the shader)
    for (const sx of [-1, 1]) { const c = V(H.x + sx * 0.0143, H.y + 0.0030, H.z + 0.0082), b0 = P.length / 3, r = 0.0050, n1 = 6, n2 = 10;
      for (let i = 0; i <= n1; i++) { const ph = i / n1 * Math.PI * 0.62; for (let k = 0; k < n2; k++) { const th = k / n2 * Math.PI * 2; vtx(V(c.x + sx * Math.cos(ph) * r * 0.62, c.y + Math.sin(ph) * Math.cos(th) * r, c.z + Math.sin(ph) * Math.sin(th) * r), sk(1), NOF, [i / n1, k / n2, 5, 0]); } }
      for (let i = 0; i < n1; i++) for (let k = 0; k < n2; k++) { const a = b0 + i * n2 + k, b = b0 + i * n2 + (k + 1) % n2, cc = b0 + (i + 1) * n2 + (k + 1) % n2, d = b0 + (i + 1) * n2 + k; if (sx > 0) quad(a, d, cc, b); else quad(a, b, cc, d); } }
  }
  // ---- wings (build left, mirror to right)
  const wingStart = P.length / 3, wingIdxStart = I.length;
  { const Sh = RIG.shoulder, E = RIG.elbow, W = RIG.wrist, Tp = RIG.tip, bones = [BONE.armL, BONE.foreL, BONE.handL], pts = [Sh, E, W, Tp];
    const angXZ = v => Math.atan2(v.x, v.z);
    const foldAng = (dB, Dworld, qFold) => { const dl = Dworld.clone().normalize().applyQuaternion(qFold.clone().invert()); let a = angXZ(dl) - angXZ(dB); while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    // one feather: tapered strip in the wing plane
    const feather = (root, dir, L, wMax, bone, region, fi, yOff, ang, camber, tipRound = 0.75) => { const perp = V(dir.z, 0, -dir.x), n = 5, ids = [];
      for (let k = 0; k <= n; k++) { const t = k / n, w = wMax * (0.42 + 0.58 * Math.sin(Math.min(1, t / 0.35) * Math.PI / 2)) * (t < tipRound ? 1 : Math.sqrt(Math.max(0, 1 - ((t - tipRound) / (1 - tipRound)) ** 2))), c = root.clone().addScaledVector(dir, L * t); c.y += yOff - camber * t * t;
        if (k === n) { ids.push([vtx(c, sk(bone), [root.x, root.z, ang], [1, 0, region, fi])]); break; }
        ids.push([vtx(c.clone().addScaledVector(perp, w * 0.58).add(V(0, -0.0018 * t, 0)), sk(bone), [root.x, root.z, ang], [t, -1, region, fi]), vtx(c.clone(), sk(bone), [root.x, root.z, ang], [t, 0, region, fi]), vtx(c.clone().addScaledVector(perp, -w * 0.42).add(V(0, -0.0012 * t, 0)), sk(bone), [root.x, root.z, ang], [t, 1, region, fi])]); }
      for (let k = 0; k < n - 1; k++) { quad(ids[k][0], ids[k][1], ids[k + 1][1], ids[k + 1][0]); quad(ids[k][1], ids[k][2], ids[k + 1][2], ids[k + 1][1]); }
      const l = ids[n - 1], tp = ids[n][0]; I.push(l[0], l[1], tp, l[1], l[2], tp); };
    // primaries on the hand
    for (let i = 0; i < 10; i++) { const t = i / 9, root = W.clone().lerp(Tp, 0.08 + 0.92 * t), a = (-78 + 70 * Math.pow(t, 0.85)) * Math.PI / 180; // angle from hand axis toward trailing side
      const hd = RIG.handDir, dir = V(hd.x * Math.cos(a) - hd.z * Math.sin(a) * -1, 0, hd.z * Math.cos(a) + hd.x * Math.sin(a) * 1).normalize(); // rotate hand axis about +Y by a (negative = toward -Z)
      const L = [0.118, 0.124, 0.131, 0.138, 0.146, 0.153, 0.160, 0.165, 0.166, 0.156][i];
      const D = V(0.03 - 0.002 * i, -0.15 - 0.012 * i, -0.985); feather(root, dir, L, 0.034 - 0.009 * t, BONE.handL, 7, 0.3 * i / 9, -0.0016 - 0.0009 * i, foldAng(dir, D, RIG.foldHand), 0.012, 0.80); }   // 3.4 cm vanes at the wrist, 2.5 cm at the tip: each covers most of the next, as on the bird, so the edge of the wing is one line and not a saw
    // secondaries on the forearm
    for (let i = 0; i < 10; i++) { const t = i / 9, root = W.clone().lerp(E, 0.04 + 0.96 * t), dir = V(-0.10 + 0.07 * t, 0, -1).normalize(), L = 0.108 - 0.012 * t;
      const D = V(0.02, -0.40 - 0.06 * t, -0.90); feather(root, dir, L, 0.038, BONE.foreL, 7, 0.4 + 0.3 * i / 9, -0.0006 * i - 0.0105, foldAng(dir, D, RIG.foldFore), 0.013, 0.86); }
    // tertials / humerals on the arm
    for (let i = 0; i < 6; i++) { const t = i / 5, root = E.clone().lerp(Sh, 0.06 + 0.88 * t), dir = V(-0.05 - 0.30 * t * t, 0, -1).normalize(), L = 0.098 - 0.020 * t;
      const D = V(-0.20, 0.10, -0.97); feather(root, dir, L, 0.042, BONE.armL, 7, 0.85, -0.0165 - 0.0006 * i, foldAng(dir, D, RIG.foldArm), 0.009, 0.84); }
    // covert sheet over the bones (upper + lower surface)
    { const NS = 13, NCh = 4, rowsT = [], rowsB = [], total = RIG.armLen + RIG.foreLen + RIG.handLen, j1 = RIG.armLen / total, j2 = (RIG.armLen + RIG.foreLen) / total;
      const at = s => { if (s < j1) return [Sh.clone().lerp(E, s / j1), 0]; if (s < j2) return [E.clone().lerp(W, (s - j1) / (j2 - j1)), 1]; return [W.clone().lerp(Tp, (s - j2) / (1 - j2)), 2]; };
      const ss = t => t * t * (3 - 2 * t);
      for (let i = 0; i <= NS; i++) { const s = i / NS, [c, seg] = at(s); const chord = s < j2 ? 0.080 - 0.016 * s / j2 : 0.064 * (1 - (s - j2) / (1 - j2)) ** 0.8 + 0.012; let skin;
        if (seg === 0) skin = sk(bones[0], bones[1], ss(Math.min(1, Math.max(0, (s - (j1 - 0.07)) / 0.14)))); else if (seg === 1) skin = s < j1 + 0.07 ? sk(bones[0], bones[1], ss(Math.min(1, Math.max(0, (s - (j1 - 0.07)) / 0.14)))) : sk(bones[1], bones[2], ss(Math.min(1, Math.max(0, (s - (j2 - 0.07)) / 0.14)))); else skin = sk(bones[1], bones[2], ss(Math.min(1, Math.max(0, (s - (j2 - 0.07)) / 0.14))));
        const rt = [], rb = []; for (let j = 0; j <= NCh; j++) { const v = j / NCh, th = 0.0085 * Math.sin(Math.min(1, v * 1.6 + 0.12) * Math.PI) * (1 - 0.6 * s); const p = c.clone().add(V(0, 0, 0.010 - chord * v)); rt.push(vtx(p.clone().add(V(0, th + 0.001, 0)), skin, NOF, [s, v, 6, 0.5])); rb.push(vtx(p.clone().add(V(0, -th * 0.5 - 0.0125 * v, 0)), skin, NOF, [s, v, 6, 0.0])); }
        rowsT.push(rt); rowsB.push(rb); }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NCh; j++) { quad(rowsT[i][j], rowsT[i + 1][j], rowsT[i + 1][j + 1], rowsT[i][j + 1]); quad(rowsB[i][j], rowsB[i][j + 1], rowsB[i + 1][j + 1], rowsB[i + 1][j]); }
      for (let i = 0; i < NS; i++) quad(rowsT[i][0], rowsB[i][0], rowsB[i + 1][0], rowsT[i + 1][0]); }
  }
  // mirror the left wing
  { const n0 = wingStart, n1 = P.length / 3, map = { [BONE.armL]: BONE.armR, [BONE.foreL]: BONE.foreR, [BONE.handL]: BONE.handR };
    for (let v = n0; v < n1; v++) { P.push(-P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); S.push(map[S[v * 3]], map[S[v * 3 + 1]], S[v * 3 + 2]); F.push(-F[v * 3], F[v * 3 + 1], -F[v * 3 + 2]); T.push(T[v * 4], T[v * 4 + 1], T[v * 4 + 2], T[v * 4 + 3]); }
    const iEnd = I.length; for (let k = wingIdxStart; k < iEnd; k += 3) I.push(I[k] - n0 + n1, I[k + 2] - n0 + n1, I[k + 1] - n0 + n1); }
  // ---- folded wing shields: sculpted closed wings lying on the flanks (shown when fold -> 1)
  for (const sx of [1, -1]) { const NA = 14, NH = 7, grid = [], sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i <= NA; i++) { const a = i / NA, z = 0.066 - 0.250 * a, row = [];
      for (let j = 0; j <= NH; j++) { let h = j / NH; const round = Math.sin(Math.min(1, a / 0.16) * Math.PI / 2); h = 0.5 + (h - 0.5) * (0.22 + 0.78 * round);
        const thT = 0.20 + 0.34 * a, thB = 1.98 - 0.50 * a, th = thT + (thB - thT) * h, Bq = bodyAt(Math.max(z, -0.108)), off = 0.0050 + 0.0045 * Math.sin(Math.PI * Math.min(1, a * 1.25)) * Math.sin(Math.PI * (0.15 + 0.7 * h));
        let x = Math.sin(th) * (Bq.rx + off), y = Bq.cy + Math.cos(th) * ((Math.cos(th) > 0 ? Bq.ryT : Bq.ryB) + off);
        const k = sm(0.60, 1.0, a), tx = 0.022 - 0.014 * a + 0.005 * (1 - h), ty = 0.022 - 0.018 * h - 0.006 * a; x = x + (tx - x) * k; y = y + (ty - y) * k;
        row.push(vtx(V(x * sx, y, z), sk(0), NOF, [a, h, 11, 0])); } grid.push(row); }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NH; j++) { const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1]; if (sx > 0) quad(a, d, c, b); else quad(a, b, c, d); } }
  // ---- tail: 12 rectrices fanning about the tail pivot. The middle pair lies on top and each feather outward sits a little lower, so the closed tail is arched; every tip is rounded on its own.
  { const Tb = RIG.tail, TS = [0, 0.28, 0.55, 0.76, 0.88, 0.95, 0.985, 1];
    for (let i = 0; i < 12; i++) { const k = (i - 5.5) / 5.5, a0 = k * 0.07, root = V(Tb.x + k * 0.012, Tb.y - Math.abs(k) * 0.004, Tb.z + 0.012), dir = V(Math.sin(a0), 0, -Math.cos(a0)), L = 0.118 - Math.abs(k) * 0.010, perp = V(dir.z, 0, -dir.x), ids = [], fea = [Tb.x, Tb.z + 0.02, k * 0.62];
      for (const t of TS) { const w = 0.0125 * (0.55 + 0.45 * Math.min(1, t * 3)) * (t > 0.76 ? Math.sqrt(Math.max(0, 1 - ((t - 0.76) / 0.24) ** 2)) : 1), c = root.clone().addScaledVector(dir, L * t); c.y += -0.004 * t * t - Math.abs(k) * 0.0012 - k * k * 0.0045 * (0.4 + 0.6 * t) + (i - 5.5) * 0.00012;
        ids.push([vtx(c.clone().addScaledVector(perp, w), sk(BONE.tail), fea, [t, -1, 8, i / 11]), vtx(c.clone().addScaledVector(perp, -w), sk(BONE.tail), fea, [t, 1, 8, i / 11])]); }
      for (let q = 0; q < TS.length - 1; q++) quad(ids[q][0], ids[q][1], ids[q + 1][1], ids[q + 1][0]); } }
  // ---- legs
  for (const sx of [1, -1]) { const bT = sx > 0 ? BONE.tibL : BONE.tibR, bA = sx > 0 ? BONE.tarL : BONE.tarR, bF = sx > 0 ? BONE.footL : BONE.footR; const hip = V(RIG.hip.x * sx, RIG.hip.y, RIG.hip.z), ank = V(hip.x, RIG.ankle.y, hip.z), ft = V(hip.x, RIG.foot.y, hip.z), D = V(0, -1, 0);
    loft([0, 0.3, 0.62, 1].map(t => ({ c: hip.clone().lerp(ank, t), ax: D, up: Z, rx: 0.016 * (1 - t) ** 1.6 + 0.0040, ryT: 0.020 * (1 - t) ** 1.6 + 0.0040, ryB: 0.020 * (1 - t) ** 1.6 + 0.0040, skin: sk(bT), u: t })), 8, 0, 0.6, true, true);
    loft([0, 0.5, 1].map(t => ({ c: ank.clone().lerp(ft, t), ax: D, up: Z, rx: 0.0031, ryT: 0.0034, ryB: 0.0034, skin: sk(bA), u: t })), 6, 9, 0, true, true);
    const toes = [[-0.42, 0.027], [0, 0.034], [0.42, 0.027], [Math.PI, 0.015]];
    for (const [a, L] of toes) { const dir = V(Math.sin(a) * sx, 0, Math.cos(a)), rings = []; for (let i = 0; i < 4; i++) { const t = i / 3; rings.push({ c: ft.clone().addScaledVector(dir, L * t).add(V(0, -0.0012 - 0.0008 * t, 0)), ax: dir, up: Y, rx: 0.0029 * (1 - 0.35 * t), ryT: 0.0026 * (1 - 0.3 * t), ryB: 0.0022, skin: sk(bF), u: 0.5 + 0.5 * t }); } loft(rings, 6, 9, 0, true, false);
      const tip = ft.clone().addScaledVector(dir, L).add(V(0, -0.002, 0)); loft([0, 1].map(t => ({ c: tip.clone().addScaledVector(dir, 0.006 * t).add(V(0, -0.0012 * t, 0)), ax: dir, up: Y, rx: 0.0016 * (1 - t) + 0.0003, ryT: 0.0018 * (1 - t) + 0.0003, ryB: 0.001, skin: sk(bF), u: t })), 5, 10, 0, false, true); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aSkin', new THREE.Float32BufferAttribute(S, 3)); g.setAttribute('aFeather', new THREE.Float32BufferAttribute(F, 3)); g.setAttribute('aPat', new THREE.Float32BufferAttribute(T, 4));
  g.setIndex(I); g.computeVertexNormals();
  { const N = g.attributes.normal; for (let k = 0; k < SEAM.length; k += 2) { const a = SEAM[k], b = SEAM[k + 1]; let x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b); const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; N.setXYZ(a, x, y, z); N.setXYZ(b, x, y, z); } }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.6); g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.5, -0.3, -0.5), new THREE.Vector3(0.5, 0.3, 0.5));
  return g;
}
