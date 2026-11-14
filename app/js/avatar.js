// People from data: rigged, textured figures with recorded motion (Microsoft Rocketbox avatar library, MIT licence),
// converted beforehand by tools/avatar_export.py into p/<id>.txt (geometry, skeleton, clips) and p/<id>_<part>_<kind>.webp.
// Used when the page is opened with ?people=asset; the procedural people of human.js remain the default.
import * as THREE from './three.module.min.js';
import { cityMaterial } from './world.js';
import { b64bytes, inflateRaw } from './util.js';

const IDENT = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
const V3 = () => new THREE.Vector3(), Q4 = () => new THREE.Quaternion(), _A = V3(), _B = V3(), _C = V3(), _K = V3(), _T = V3(), _u = V3(), _w = V3(), _dir = V3(), _pp = V3(), _pole = V3(), _h0 = V3(), _a0 = V3(), _k0 = V3(), _ht = V3(), _pq = Q4(), _d = Q4(), _d1 = Q4(), _d2 = Q4(), _tot = Q4(), _dl = Q4(), _dt = Q4();
const tl = new THREE.TextureLoader(), texture = (url, srgb, aniso) => new Promise(ok => tl.load(url, t => { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; ok(t); }, undefined, () => ok(null)));

export async function loadAvatar(id, Q, base = './p/') {
  const buf = await inflateRaw(b64bytes(new Uint8Array(await (await fetch(base + id + '.txt')).arrayBuffer()))), dv = new DataView(buf), jl = dv.getUint32(4, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl))), o = 8 + jl;
  const F32 = a => new Float32Array(buf.slice(o + a[0], o + a[0] + a[1] * 4)), g = new THREE.BufferGeometry(), nor = new Int8Array(buf, o + J.nor[0], J.nor[1]);
  g.setAttribute('position', new THREE.BufferAttribute(F32(J.pos), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(nor), 3, true)); g.setAttribute('uv', new THREE.BufferAttribute(F32(J.uv), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf.slice(o + J.si[0], o + J.si[0] + J.si[1])), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf.slice(o + J.sw[0], o + J.sw[0] + J.sw[1])), 4, true));
  { const W = g.attributes.skinWeight.array; for (let i = 0; i < W.length; i += 4) { let k = i, t = 0; for (let j = i; j < i + 4; j++) { t += W[j]; if (W[j] > W[k]) k = j; } W[k] += 255 - t; } }   // the weights of a vertex must add up to exactly one: skinning is done in world coordinates, so a sum one step off (1/255) would pull the vertex 0.4 % of the way to the world origin, a quarter of a metre by the river
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf.slice(o + J.idx[0], o + J.idx[0] + J.idx[1] * 2)), 1));
  const parts = ['body', 'head', 'opacity'], mats = [], an = Q.tier === 'low' ? 1 : 4;
  for (const p of parts) { if (!J.groups.some(gr => gr.part === p)) { mats.push(mats[0]); continue; }   /* some figures have no hair cards: nothing to fetch, and the slot is never drawn */
    const map = await texture(base + id + '_' + p + '_color.webp', true, an), nm = p === 'opacity' || Q.tier === 'low' ? null : await texture(base + id + '_' + p + '_normal.webp', false, an);
    const params = { vertexColors: false, map }; if (nm && Q.pbr) params.normalMap = nm; if (p === 'opacity') { params.alphaTest = 0.5; params.side = THREE.DoubleSide; }
    mats.push(cityMaterial('avatar', Q, { rough: p === 'head' ? 0.58 : 0.8, env: 0.35, params })); }
  for (const gr of J.groups) g.addGroup(gr.start, gr.count, parts.indexOf(gr.part));
  let y0 = 1e9, y1 = -1e9; { const P = g.attributes.position.array; for (let i = 1; i < P.length; i += 3) { if (P[i] < y0) y0 = P[i]; if (P[i] > y1) y1 = P[i]; } }
  const inv = F32(J.inv), clips = {}; for (const c of J.clips) clips[c.name] = { dur: c.dur, nf: c.nf, travel: Math.hypot(c.travel[0], c.travel[1]) / 100, q: new Int16Array(buf.slice(o + c.q[0], o + c.q[0] + c.q[1] * 2)), h: F32(c.h) };
  return { id, sex: id[0], geometry: g, mats, bones: J.bones, rootM: J.rootM, inv, clips, height: (y1 - y0) / 100, hip: J.bones.findIndex(b => b.n === 'Bip01'), footL: J.bones.findIndex(b => b.n === 'Bip01_L_Foot'), footR: J.bones.findIndex(b => b.n === 'Bip01_R_Foot'), handL: J.bones.findIndex(b => b.n === 'Bip01_L_Hand'), handR: J.bones.findIndex(b => b.n === 'Bip01_R_Hand') };
}

// one person: own skeleton, shared geometry and materials
export class Avatar {
  constructor(A, stature) { this.A = A; this.k = (stature || A.height) / A.height; const nb = A.bones.length; this.root = new THREE.Group(); this.root.matrixAutoUpdate = false; const hold = new THREE.Group(); if (A.rootM) { hold.matrixAutoUpdate = false; hold.matrix.fromArray(A.rootM); } this.root.add(hold);
    this.bones = A.bones.map(d => { const b = new THREE.Bone(); b.position.fromArray(d.t); b.quaternion.fromArray(d.q); b.scale.fromArray(d.s); return b; }); A.bones.forEach((d, i) => (d.p < 0 ? hold : this.bones[d.p]).add(this.bones[i]));
    const invs = []; for (let i = 0; i < nb; i++) invs.push(new THREE.Matrix4().fromArray(A.inv, i * 16)); this.skeleton = new THREE.Skeleton(this.bones, invs);
    const m = this.mesh = new THREE.SkinnedMesh(A.geometry, A.mats); m.bind(this.skeleton, IDENT); m.frustumCulled = false; m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); }
  place(x, y, z, yaw) { const s = 0.01 * this.k; this.root.matrix.compose(this._p.set(x, y, z), this._q.setFromAxisAngle(this._up, yaw), this._s.set(s, s, s)); }
  // pose from a clip at u in [0, 1): rotations for every bone, the hip's height and sway (its travel along the path is taken out: the walker's place comes from the simulation)
  pose(name, u, o = {}) { const c = this.A.clips[name], nb = this.bones.length, f = u * (c.nf - 1), f0 = Math.min(c.nf - 1, Math.floor(f)), f1 = Math.min(c.nf - 1, f0 + 1), t = f - f0, Q = c.q;
    for (let i = 0; i < nb; i++) { const a = (f0 * nb + i) * 4, b = (f1 * nb + i) * 4; _q0.set(Q[a], Q[a + 1], Q[a + 2], Q[a + 3]).normalize(); _q1.set(Q[b], Q[b + 1], Q[b + 2], Q[b + 3]).normalize(); this.bones[i].quaternion.copy(_q0).slerp(_q1, t); }
    const H = c.h, hb = this.bones[this.A.hip], l = 1 - t, hx = H[f0 * 3] * l + H[f1 * 3] * t, hy = H[f0 * 3 + 1] * l + H[f1 * 3 + 1] * t, hz = H[f0 * 3 + 2] * l + H[f1 * 3 + 2] * t, e = (c.nf - 1) * 3;
    hb.position.set(hx - (H[0] + (H[e] - H[0]) * u) * (o.keepX ? 0 : 1) + (o.keepX ? 0 : H[0]), hy + (o.dy || 0), hz - (H[2] + (H[e + 2] - H[2]) * u) + H[2]);
    this.root.updateMatrixWorld(true); }
  // turn a bone by a rotation given in world space
  _turn(b, D) { b.parent.getWorldQuaternion(_pq); b.quaternion.premultiply(_dt.copy(_pq).invert().multiply(D).multiply(_pq)); b.updateMatrixWorld(true); }
  // two-bone reach: the chain a-b-c (thigh, calf, foot) is turned so that c arrives at T, bending towards the pole; returns the rotation c has picked up on the way (in _tot)
  _reach(c, T, pole) { const b = c.parent, a = b.parent, A = _A.setFromMatrixPosition(a.matrixWorld), B = _B.setFromMatrixPosition(b.matrixWorld), C = _C.setFromMatrixPosition(c.matrixWorld), la = A.distanceTo(B), lb = B.distanceTo(C);
    const dir = _dir.subVectors(T, A), d = Math.min(Math.max(dir.length(), Math.abs(la - lb) + 1e-3), (la + lb) * 0.985); dir.normalize(); const x = (la * la - lb * lb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, la * la - x * x));
    const pp = _pp.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize(), K = _K.copy(A).addScaledVector(dir, x).addScaledVector(pp, hh);
    _d1.setFromUnitVectors(_u.subVectors(B, A).normalize(), _w.subVectors(K, A).normalize()); this._turn(a, _d1);
    C.setFromMatrixPosition(c.matrixWorld); B.setFromMatrixPosition(b.matrixWorld); _T.copy(A).addScaledVector(dir, d);
    _d2.setFromUnitVectors(_u.subVectors(C, B).normalize(), _w.subVectors(_T, B).normalize()); this._turn(b, _d2); _tot.copy(_d2).multiply(_d1); return _d1; }
  // sitting on the ground from a clip recorded on a chair: the feet go to the given places (world), knees up; the hands stay on the thighs. Call after pose().
  sitGround(feet, fwd) { const A = this.A, up = this._up;
    for (let k = 0; k < 2; k++) { const foot = this.bones[k ? A.footR : A.footL], hand = this.bones[k ? A.handR : A.handL], thigh = foot.parent.parent;
      _h0.setFromMatrixPosition(hand.matrixWorld); _a0.setFromMatrixPosition(thigh.matrixWorld); _k0.setFromMatrixPosition(foot.parent.matrixWorld);   // where the hand lies along the thigh before the leg moves
      const tl = _k0.sub(_a0), L = tl.length(), along = Math.min(1, Math.max(0, _h0.clone().sub(_a0).dot(tl) / (L * L))), rest = _h0.sub(_a0).addScaledVector(tl, -along);   // offset of the hand from the thigh's axis
      const d1 = this._reach(foot, feet[k], _pole.copy(up).addScaledVector(fwd, 0.15)); _dl.copy(d1); this._turn(foot, _d.copy(_tot).invert());   // the foot stays flat
      _a0.setFromMatrixPosition(thigh.matrixWorld); _k0.setFromMatrixPosition(foot.parent.matrixWorld).sub(_a0); _ht.copy(_a0).addScaledVector(_k0, along).add(rest.applyQuaternion(_dl));
      if (along > 0.02 && rest.length() < 0.36 * this.k) { this._reach(hand, _ht, _pole.copy(up).multiplyScalar(-1).addScaledVector(fwd, -0.45)); this._turn(hand, _d.copy(_tot).invert().premultiply(_dl)); } } }
}
