// City life generated in code: people (walkers, joggers, couples sitting along the Kamo) and traffic.
// People are modelled in human.js (one skinned mesh per walker, one merged static mesh for everyone who stays put); the pigeons treat walkers as approaching threats.
import * as THREE from './three.module.min.js';
import { cityMaterial } from './world.js';
import { clamp, lerp, rng, TAU, damp, dampAng } from './util.js';
import { buildPerson, Rig, randomSpec, bakePose, B } from './human.js';
import { U } from './world.js';
import { Avatar } from './avatar.js';

const IDENT = new THREE.Matrix4();
// Walking routes are traced from the nav grid, so nobody walks through a house or on the river.
// The riverside terrace: the flat strip 1.5-3.6 m above the water on the west bank (it drifts west as the river widens to the north).
function traceTerrace(nav) { const slope = (x, z) => Math.hypot(nav.ground(x + 0.7, z) - nav.ground(x - 0.7, z), nav.ground(x, z + 0.7) - nav.ground(x, z - 0.7)) / 1.4, rows = []; let prev = -63, wy = -2.3;
  for (let z = -190; z <= 200; z += 6) { for (let x = -62; x < 10; x += 1) { const w = nav.waterY(x, z); if (w > -300) { wy = w; break; } }
    let best = null, run = null; const close = () => { if (run && run[1] - run[0] >= 3) { const d = Math.max(run[0] - prev, prev - run[1], 0); if (!best || d < best.d) best = { lo: run[0], hi: run[1], d }; } run = null; };
    for (let x = -100; x <= -40; x += 0.5) { const h = nav.ground(x, z) - wy, ok = nav.cls(x, z) === 0 && nav.furn(x, z) < -900 && nav.roof(x, z) < -900 && h > 1.5 && h < 3.6 && slope(x, z) < 0.16; if (ok) { if (!run) run = [x, x]; else run[1] = x; } else close(); } close();
    if (!best || best.d > 4) { if (rows.length > 4) break; continue; } prev = (best.lo + best.hi) / 2; rows.push({ x: prev, z, lo: best.lo, hi: best.hi }); }
  return rows; }
// a street: follow the LOD3 road cells nearest to the previous centre
function traceRoad(nav, alongX, a0, a1, step, guess, b0, b1) { const rows = []; let prev = guess;
  for (let a = a0; a <= a1; a += step) { let best = null, run = null; const close = () => { if (run) { const d = Math.max(run[0] - prev, prev - run[1], 0); if (!best || d < best.d) best = { lo: run[0], hi: run[1], d }; } run = null; };
    for (let b = b0; b <= b1; b += 0.25) { const c = alongX ? nav.cls(a, b) : nav.cls(b, a); if (c === 2) { if (!run) run = [b, b]; else run[1] = b; } else close(); } close();
    if (!best || best.d > 3) continue; const c = best.hi - best.lo > 6 ? clamp(prev, best.lo + 1.5, best.hi - 1.5) : (best.lo + best.hi) / 2; prev = c; rows.push(alongX ? { x: a, z: c, lo: best.lo, hi: best.hi } : { x: c, z: a, lo: best.lo, hi: best.hi }); }
  return rows; }
function makePath(rows, alongX, margin, maxW, o) { const k = alongX ? 'z' : 'x'; for (let p = 0; p < 2; p++) { const t = rows.map(r => r[k]); for (let i = 1; i < rows.length - 1; i++) rows[i][k] = (t[i - 1] + t[i] * 2 + t[i + 1]) / 4; }
  const L = [0]; for (let i = 1; i < rows.length; i++) L.push(L[i - 1] + Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z)); for (const r of rows) r.w = clamp(Math.min(r[k] - r.lo, r.hi - r[k]) - margin, 0.1, maxW);
  return Object.assign({ rows, L, len: L[L.length - 1] || 1, at(t, out) { const sLen = clamp(t, 0, 1) * this.len; let i = 1; while (i < rows.length - 1 && L[i] < sLen) i++; const a = rows[i - 1], b = rows[i], d = Math.max(L[i] - L[i - 1], 1e-6), f = (sLen - L[i - 1]) / d; out.x = lerp(a.x, b.x, f); out.z = lerp(a.z, b.z, f); out.ux = (b.x - a.x) / d; out.uz = (b.z - a.z) / d; out.w = lerp(a.w, b.w, f); return out; } }, o); }
export class People {
  constructor(app, opts = {}) {
    const { scene, world, Q } = app; this.app = app; this.nav = world.nav; this.rnd = rng(77123); const rnd = this.rnd, rr = (a, b) => a + (b - a) * rnd(), nav = this.nav;
    this.mat = cityMaterial('cloth', Q, { rough: 0.9 }); const lod = Q.tier === 'low' ? 1 : 0; this.H = []; this.threats = []; this._v = new THREE.Vector3(); this._fr = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sp = new THREE.Sphere();
    // walkers go back and forth along the traced routes (Kamo west terrace, Pontocho, Gion Shimbashi-dori)
    // people from data (opts.avatars, see avatar.js) take the place of the generated ones wherever a recorded motion exists: walkers, sitters, standers. Joggers and people in kimono stay generated.
    const AV = opts.avatars && opts.avatars.length ? opts.avatars : null, avOf = (sex, k) => { const c = AV.filter(a => a.sex === sex); return c[k % c.length]; }, stat = sex => sex === 'f' ? rr(1.50, 1.66) : rr(1.63, 1.80); let avK = 0; this.AV = []; this.scene = scene; this._sh = Q.tier !== 'low';
    const nW = opts.walkers ?? 14, terr = traceTerrace(nav), paths = [
      makePath(terr.map(r => ({ ...r })), false, 1.0, 3.2, { n: Math.round(nW * 0.5), jog: 0.3, kim: 0.08, kimAt: [5] }),
      makePath(traceRoad(nav, false, -156, 128, 4, -103, -112, -96), false, 0.35, 0.6, { n: Math.round(nW * 0.25), jog: 0, kim: 0.3, kimAt: [1] }),
      makePath(traceRoad(nav, true, 62, 268, 4, -74, -86, -52), true, 0.7, 1.5, { n: Math.round(nW * 0.25), jog: 0, kim: 0.5, kimAt: [0, 3] }),   // Gion: visitors in rented kimono are part of the street
    ].filter(p => p.rows.length > 3); this.paths = paths; const Pt = this._pt = {};
    // a few walkers are always in kimono (kimAt), whatever the dice say; their outfit comes from its own generator so everyone else stays the same
    for (const p of paths) for (let k = 0; k < p.n; k++) { const jog = rnd() < p.jog, dice = !jog && rnd() < p.kim, base = randomSpec(rnd, jog ? 'jog' : dice ? 'kimono' : 'walk'), force = !jog && !dice && (p.kimAt || []).includes(k), kim = dice || force;
      if (AV && !jog && !kim) { const A = avOf(base.sex, avK++), st = stat(base.sex), av = new Avatar(A, st); scene.add(av.root); scene.add(av.mesh); av.mesh.castShadow = this._sh; const dir = rnd() < 0.5 ? 1 : -1, h = { i: this.H.length, walk: true, path: p, t: rnd(), dir, off: rr(-1, 1), jog: false, kim: false, v: rr(1.05, 1.45) * Math.sqrt(st / 1.72), ph: 0, u: rnd(), s: st / 1.72, av, mesh: av.mesh, clip: rnd() < 0.5 ? 'walk' : 'walk2', yaw: null, x: 0, y: 0, z: 0, turn: 0, turnT: rr(2, 9) }; this.H.push(h); this.AV.push(h); continue; }
      const P = buildPerson(Object.assign(force ? randomSpec(rng(9100 + paths.indexOf(p) * 16 + k), 'kimono') : base, { lod })), rig = new Rig(P), g = P.geometry; g.setAttribute('aBind', g.attributes.position);
      const mesh = new THREE.SkinnedMesh(g, this.mat); mesh.bind(rig.skeleton, IDENT); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.castShadow = Q.tier !== 'low'; mesh.receiveShadow = true; scene.add(mesh);
      const dir = rnd() < 0.5 ? 1 : -1; this.H.push({ i: this.H.length, walk: true, path: p, t: rnd(), dir, off: rr(-1, 1), jog, kim, v: (jog ? rr(2.6, 3.1) : kim ? rr(0.78, 0.95) : rr(1.05, 1.45)) * Math.sqrt(P.s), ph: rr(0, TAU), s: P.s, rig, mesh, yaw: null, x: 0, y: 0, z: 0, turn: 0, turnT: rr(2, 9) }); }
    // people who do not move are posed once, baked on the CPU and merged into one static mesh
    const parts = [], still = (spec, x, y, z, yaw, pose) => { spec.lod = lod; const P = buildPerson(spec), rig = new Rig(P); rig.root(x, y, z, yaw); pose(rig, P.s); const b = bakePose(P.geometry, rig.matrices()); parts.push({ g: P.geometry, b }); const h = { i: this.H.length, x, y, z, yaw, s: P.s, rig }; this.H.push(h); return h; };
    // couples sitting at equal intervals on the west bank (a well-known Kamo sight)
    const nC = opts.couples ?? 9; let z = -78, nc = 0; const edgeAt = zz => { let r = null; for (const q of terr) if (!r || Math.abs(q.z - zz) < Math.abs(r.z - zz)) r = q; return r && Math.abs(r.z - zz) < 6 ? r.hi : null; };
    for (; nc < nC && z < 190; z += 7.2) { const e = edgeAt(z); if (e === null) continue; let xe = null; for (let x = e - 1.5; x < e + 3; x += 0.25) { const g0 = nav.ground(x, z), g1 = nav.ground(x + 1.4, z); if (g0 - g1 > 0.38 && nav.cls(x, z) === 0) { xe = x; break; } } if (xe === null && nav.cls(e + 0.3, z) === 0 && nav.ground(e, z) - nav.ground(e + 2.2, z) > 0.25) xe = e + 0.3;   // no clear step: sit at the top of the slope
      if (xe === null) continue; nc++; const solo = rnd() < 0.18;
      for (let m = 0; m < (solo ? 1 : 2); m++) { const dz = solo ? 0 : (m ? 0.30 : -0.30), x = xe + 0.05, zz = z + dz, y = nav.ground(x, zz), yaw = Math.PI / 2 + (solo ? rr(-0.2, 0.2) : (m ? 0.14 : -0.14)), turn = solo ? rr(-0.3, 0.3) : (m ? 0.5 : -0.5) * rr(0.2, 1), mode = rnd() < 0.3 ? 1 : 0;
        if (AV) { const sex = rnd() < 0.5 ? 'f' : 'm', A = avOf(sex, avK++), st = stat(sex), av = new Avatar(A, st), fx = x + Math.sin(yaw) * 0.42, fz = zz + Math.cos(yaw) * 0.42; this._still(av, { x, y, z: zz, yaw: yaw + turn * 0.3, s: st / 1.72, sit: true, ground: true, reach: rr(0.50, 0.64), clip: 'sit', u: rnd(), rate: 0.5 / A.clips.sit.dur }); continue; }   // the recorded pose sits at chair height: the seat goes on the edge of the terrace, the feet down the bank
        const h = still(randomSpec(rnd, 'sit'), x, y, zz, yaw, (rig, s) => { const c = Math.cos(yaw), sn = Math.sin(yaw), feet = []; for (const sx of [1, -1]) { const lx = sx * 0.10 * s; let fz = (mode ? 0.66 : 0.52) * s, wx = x + lx * c + fz * sn, wz = zz - lx * sn + fz * c, fy = nav.ground(wx, wz) - y;
          if (fy < -0.30 * s) { fz = 0.44 * s; fy = Math.max(nav.ground(x + lx * c + fz * sn, zz - lx * sn + fz * c) - y, -0.40 * s); } feet.push([lx, fy, fz]); } rig.sit(feet, { mode, turn, lean: mode ? rr(-0.38, -0.25) : rr(0.08, 0.26) }); }); h.sit = true; } }
    // a few people who have stopped to look at the river or their phone
    const nS = opts.standing ?? 6, spots = [], at = (pi, t, sd, face) => { const p = paths[pi]; if (!p) return; const Q = p.at(t, Pt), x = Q.x - Q.uz * sd * (Q.w + 0.3), zz = Q.z + Q.ux * sd * (Q.w + 0.3); spots.push([x, zz, face === null ? Math.atan2(-Q.uz * sd, Q.ux * sd) + Math.PI : face]); };
    at(0, 0.10, -1, 1.57); at(0, 0.42, -1, 1.57); at(0, 0.66, -1, 1.57); at(0, 0.90, -1, 1.57); at(1, 0.38, 1, null); at(2, 0.30, -1, null); at(1, 0.74, -1, null); at(2, 0.78, 1, null);   // on the terrace they face the river
    for (let k = 0; k < Math.min(nS, spots.length); k++) { const sp = spots[k]; if (nav.cls(sp[0], sp[1]) === 1 || nav.cls(sp[0], sp[1]) === 3) continue; const phone = rnd() < 0.5, yaw = sp[2] + rr(-0.25, 0.25);
      if (AV) { const sex = rnd() < 0.5 ? 'f' : 'm', A = avOf(sex, avK++), st = stat(sex), av = new Avatar(A, st), clip = phone ? 'phone' : rnd() < 0.5 ? 'idle' : 'look'; this._still(av, { x: sp[0], y: nav.ground(sp[0], sp[1]), z: sp[1], yaw, s: st / 1.72, stand: true, clip, u: rnd(), rate: 0.5 / A.clips[clip].dur }); continue; }
      const h = still(randomSpec(rnd, 'walk'), sp[0], nav.ground(sp[0], sp[1]), sp[1], yaw, rig => rig.stand({ phone, turn: phone ? 0 : rr(-0.5, 0.5), nod: phone ? 0.42 : rr(-0.05, 0.12), shift: rr(-1, 1), lean: phone ? 0.05 : 0.02 })); h.stand = true; }
    if (parts.length) { let nv = 0, ni = 0; for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index.count; } const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 4), F = new Float32Array(nv * 4), Bd = new Float32Array(nv * 3), I = new Uint32Array(ni); let vo = 0, io = 0;
      for (const p of parts) { const n = p.g.attributes.position.count; P.set(p.b.position, vo * 3); N.set(p.b.normal, vo * 3); C.set(p.g.attributes.color.array, vo * 4); F.set(p.g.attributes.aFace.array, vo * 4); Bd.set(p.g.attributes.position.array, vo * 3); const ix = p.g.index.array; for (let k = 0; k < ix.length; k++) I[io + k] = ix[k] + vo; vo += n; io += ix.length; p.g.dispose(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 4)); g.setAttribute('aFace', new THREE.BufferAttribute(F, 4)); g.setAttribute('aBind', new THREE.BufferAttribute(Bd, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere();
      this.still = new THREE.Mesh(g, this.mat); this.still.castShadow = Q.tier !== 'low'; this.still.receiveShadow = true; this.still.matrixAutoUpdate = false; scene.add(this.still); }
    this.n = this.H.length;
    // ---- where a shoe meets the ground: a soft dark patch under every foot (and under whoever sits), the first thing a pigeon's eye sees of a person.
    // The sun's shadow alone leaves feet looking as if they hover; real contact always has this small core of occlusion.
    { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const nD = this.H.length * 2 + this.H.filter(h => h.sit).length;
      // the frame buffer keeps the view depth in its alpha channel (for the depth of field): the patch darkens the colour and leaves alpha alone
      this.dMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, uniforms: { uA: { value: 0.5 } },
        vertexShader: `varying vec2 vU; void main(){ vU = position.xz * 2.0; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `precision highp float; varying vec2 vU; uniform float uA; void main(){ float r = length(vU), a = 1.0 - smoothstep(0.15, 1.0, r); gl_FragColor = vec4(vec3(0.0), a * uA); }` });
      const dm = this.decal = new THREE.InstancedMesh(g, this.dMat, nD); dm.frustumCulled = false; dm.matrixAutoUpdate = false; dm.renderOrder = 2; dm.castShadow = false; dm.receiveShadow = false; scene.add(dm);
      this._dq = new THREE.Quaternion(); this._ds = new THREE.Vector3(); this._dp = new THREE.Vector3(); this._dm = new THREE.Matrix4(); this._up = new THREE.Vector3(0, 1, 0); let k = 0;
      for (const h of this.H) { h.d0 = k; k += 2; if (h.sit) { h.dS = k++; } if (!h.walk) { this._feet(h); h.rig = null; } }
      dm.instanceMatrix.needsUpdate = true; this._dSave = dm.instanceMatrix.array.slice(); this._sv = true; }
    // people who stay put are obstacles for the pigeons (they walk round them, they are not scared by them)
    this.statics = this.H.filter(h => !h.walk).map(h => ({ x: h.x + Math.sin(h.yaw) * (h.sit ? 0.3 : 0), z: h.z + Math.cos(h.yaw) * (h.sit ? 0.3 : 0), y: h.y, r: h.sit ? 0.65 : 0.45, still: true }));
  }
  // movement and the list of threats for the flock; the figures themselves are posed in pose(), after the camera has moved
  update(dt, hour) { const T = this.threats; T.length = 0; const out = hour > 6.5 && hour < 22.5, nav = this.nav;
    { const sv = hour > 7.5 && hour < 22.8; this._on = sv; this._dt = dt; if (this.still) this.still.visible = sv; if (sv) for (const st of this.statics) T.push(st); }
    for (const h of this.H) { if (!h.walk) continue; h.hidden = !out || (h.jog && (hour < 6 || hour > 19.5)); if (h.hidden) continue;
      const p = h.path, len = p.len, s = h.s, Q = p.at(h.t += h.dir * h.v * dt / len, this._pt); if (h.t > 1) { h.t = 1; h.dir = -1; } if (h.t < 0) { h.t = 0; h.dir = 1; }
      const ux = Q.ux, uz = Q.uz, turn = clamp(Math.min(h.t, 1 - h.t) * len / 2.5, 0, 1), side = h.off * Q.w * (0.35 + 0.65 * turn) * h.dir; // keep to one side, and cross over near the ends to turn around
      h.x = Q.x - uz * side; h.z = Q.z + ux * side; h.y = nav.ground(h.x, h.z); const want = Math.atan2(ux * h.dir, uz * h.dir); h.yaw = h.yaw === null ? want : dampAng(h.yaw, want, 5, dt);
      // the time of one stride follows from the speed: cadence grows with about the 0.42 power of speed, anchored at 119.5 steps a minute at 1.48 m/s (measured on Japanese adults); so a slow walker takes fewer and shorter steps and nobody shares one rhythm. Joggers keep about 164 steps a minute; a kimono shortens the step
      if (h.av) h.u = (h.u + h.v * dt / (h.av.A.clips[h.clip].travel * h.av.k)) % 1;   /* the recorded stride covers a known distance: advancing it by the distance walked keeps the feet from sliding at any speed */
      const Tc = h.jog ? 0.73 : 120 / (119.5 * Math.pow(h.v / Math.sqrt(s) / 1.48, 0.42)) * Math.sqrt(s) * (h.kim ? 0.88 : 1); h.ph += dt / Tc * TAU; T.push({ x: h.x, z: h.z, y: h.y, r: h.jog ? 3.0 : 1.5, run: h.jog });
      // now and then a walker looks aside (at the river, at a shop front)
      h.turnT -= dt; if (h.turnT <= 0) { h.turnT = 3 + 8 * this.rnd(); h.look = h.jog || this.rnd() < 0.45 ? 0 : (this.rnd() - 0.5) * 1.5; } h.turn = damp(h.turn, h.look || 0, 2.5, dt); h.T = Tc; }
    return T; }
  // the two patches of one person, from where the ankle bones are now; a lifted foot casts a wider, fainter one
  _still(av, h) { h.i = this.H.length; h.av = av; h.mesh = av.mesh; av.mesh.castShadow = this._sh; this.scene.add(av.root); this.scene.add(av.mesh); av.place(h.x, h.y, h.z, h.yaw); av.pose(h.clip, h.u);
    if (h.ground) { const A = av.A, nav = this.nav, sy = Math.sin(h.yaw), cy = Math.cos(h.yaw), fwd = h.fwd = new THREE.Vector3(sy, 0, cy), P = new THREE.Vector3(); h.feet = []; let ty = 0, ay = 0;   /* seated on the bank, not on a chair: the hips come down to the ground and the feet are set where the slope is, a little way in front */
      for (let k = 0; k < 2; k++) { const f = av.bones[k ? A.footR : A.footL]; ty += P.setFromMatrixPosition(f.parent.parent.matrixWorld).y - h.y; ay += P.setFromMatrixPosition(f.matrixWorld).y - h.y; } ty /= 2; ay /= 2;
      h.y = nav.ground(h.x, h.z) + 0.105 * av.k - ty; av.place(h.x, h.y, h.z, h.yaw); av.pose(h.clip, h.u);
      for (let k = 0; k < 2; k++) { const f = av.bones[k ? A.footR : A.footL]; P.setFromMatrixPosition(f.parent.parent.matrixWorld); const d = h.reach * av.k * (k ? 1 : 0.94), x = P.x + sy * d + cy * (k ? -0.02 : 0.02), z = P.z + cy * d - sy * (k ? -0.02 : 0.02); h.feet.push(new THREE.Vector3(x, Math.max(nav.ground(x, z), nav.ground(h.x, h.z) - 0.42 * av.k) + ay, z)); }
      av.sitGround(h.feet, fwd); h.y = nav.ground(h.x, h.z); }
    this.H.push(h); this.AV.push(h); return h; }
  _feet(h) { const dm = this.decal, nav = this.nav, s = h.s, hide = h.av ? !h.mesh.visible || h.hidden : h.walk && (h.hidden || !h.mesh.visible), cy = h.av ? Math.cos(h.yaw || 0) : 0, sy = h.av ? Math.sin(h.yaw || 0) : 0;
    for (let k = 0; k < 2; k++) { const e = (h.av ? h.av.bones[k ? h.av.A.footR : h.av.A.footL] : h.rig.bones[k ? B.ftR : B.ftL]).matrixWorld.elements, fx = h.av ? sy : e[8], fz = h.av ? cy : e[10], fl = Math.hypot(fx, fz) || 1, x = e[12] + fx / fl * 0.055 * s, z = e[14] + fz / fl * 0.055 * s, gy = nav.ground(x, z), lift = clamp((e[13] - gy - (h.av ? 0.11 : 0.07) * s) / (0.16 * s), 0, 1), w = hide ? 0 : (0.34 + 0.20 * lift) * s * (1 - 0.8 * lift);
      this._dq.setFromAxisAngle(this._up, Math.atan2(fx, fz)); this._dm.compose(this._dp.set(x, gy + 0.012, z), this._dq, this._ds.set(w, 1, w * 1.55)); dm.setMatrixAt(h.d0 + k, this._dm); }
    if (h.sit) { const x = h.x - Math.sin(h.yaw) * 0.02, z = h.z - Math.cos(h.yaw) * 0.02; this._dq.setFromAxisAngle(this._up, h.yaw); this._dm.compose(this._dp.set(x, nav.ground(x, z) + 0.012, z), this._dq, this._ds.set(0.95 * s, 1, 0.80 * s)); dm.setMatrixAt(h.dS, this._dm); } }
  pose() { const app = this.app, cam = app.camera, pano = !!app.pano;
    if (!pano) { cam.updateMatrixWorld(); this._pm.multiplyMatrices(cam.projectionMatrix, this._pm.copy(cam.matrixWorld).invert()); this._fr.setFromProjectionMatrix(this._pm); }
    for (const h of this.H) { if (!h.walk) continue; if (h.hidden || h.yaw === null) { h.mesh.visible = false; continue; }
      const d = this._v.set(h.x - cam.position.x, h.y + 0.9 - cam.position.y, h.z - cam.position.z).length(); let vis = d < 420; if (vis && !pano) { this._sp.center.set(h.x, h.y + 0.9, h.z); this._sp.radius = 4; vis = this._fr.intersectsSphere(this._sp); }
      h.mesh.visible = vis; if (!vis) continue; if (h.av) { h.av.place(h.x, h.y, h.z, h.yaw); h.av.pose(h.clip, h.u); continue; } h.rig.root(h.x, h.y, h.z, h.yaw); h.rig.walk(h.ph, h.v, h.T, h.jog, { turn: h.turn, nod: h.jog ? 0 : 0.03, arm: h.kim ? 0.3 : 1, bend: h.kim ? 0.25 : 0 }); }
    // the data people who stay put breathe, shift and look about: their clip runs forward and back, slowly; out of view they are left as they are
    for (const h of this.AV) { if (h.walk) continue; let vis = this._on !== false; if (vis) { const d = this._v.set(h.x - cam.position.x, h.y + 0.9 - cam.position.y, h.z - cam.position.z).length(); vis = d < 320; if (vis && !pano) { this._sp.center.set(h.x, h.y + 0.9, h.z); this._sp.radius = 3; vis = this._fr.intersectsSphere(this._sp) || d < 6; } }
      h.mesh.visible = this._on !== false; h.hidden = this._on === false; if (!vis) continue; h.u = (h.u + (this._dt || 0) * h.rate) % 1; h.av.pose(h.clip, 1 - Math.abs(2 * h.u - 1)); if (h.ground) h.av.sitGround(h.feet, h.fwd); }
    if (this.decal) { for (const h of this.H) if ((h.walk && h.rig) || h.av) this._feet(h); this.decal.instanceMatrix.needsUpdate = true; const sv = this._on !== false; if (sv !== this._sv) { this._sv = sv; const a = this.decal.instanceMatrix.array; for (const h of this.H) if (!h.walk && !h.av) { const n = h.sit ? 3 : 2; for (let i = h.d0 * 16; i < (h.d0 + n) * 16; i++) a[i] = sv ? this._dSave[i] : 0; } }   /* the people who stay put go home at night, and their patches with them */
      this.dMat.uniforms.uA.value = 0.72 * (1 - 0.45 * U.uNight.value); } }
}

// ------------------------------------------------------------------ traffic
function carGeometry(bus) {
  const P = [], N = [], C = [], I = []; let nv = 0;
  const box = (x0, y0, z0, x1, y1, z1, r, g, b, a = 0) => { const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], F = [[0, 3, 2, 1, 0, 0, -1], [4, 5, 6, 7, 0, 0, 1], [0, 4, 7, 3, -1, 0, 0], [1, 2, 6, 5, 1, 0, 0], [3, 7, 6, 2, 0, 1, 0], [0, 1, 5, 4, 0, -1, 0]]; for (const f of F) { for (let k = 0; k < 4; k++) { P.push(...c[f[k]]); N.push(f[4], f[5], f[6]); C.push(r, g, b, a); } I.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4; } };
  // a tube along z: each ring is a superellipse of half width hw between heights y0 and y1; col(y, z, up) picks the vertex colour
  const loft = (R, seg, col, id = 0) => { const b0 = nv, nr = R.length, Q = [];
    for (const r of R) { const e = 2 / r[4]; for (let j = 0; j < seg; j++) { const t = j / seg * TAU, u = Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** e, w = Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** e; Q.push([r[1] * u, (r[2] + r[3]) / 2 + (r[3] - r[2]) / 2 * w, r[0], Math.cos(t)]); } }
    for (let i = 0; i < nr; i++) for (let j = 0; j < seg; j++) { const p = Q[i * seg + j], a = Q[i * seg + (j + 1) % seg], b = Q[i * seg + (j + seg - 1) % seg], c = Q[Math.min(i + 1, nr - 1) * seg + j], d = Q[Math.max(i - 1, 0) * seg + j], ax = a[0] - b[0], ay = a[1] - b[1], az = a[2] - b[2], bx = c[0] - d[0], by = c[1] - d[1], bz = c[2] - d[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const cy = (R[i][2] + R[i][3]) / 2; if (nx * p[0] + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; nz = -nz; } const L = Math.hypot(nx, ny, nz) || 1, k = col(p[1], p[2], p[3], p[0]); P.push(p[0], p[1], p[2]); N.push(nx / L, ny / L, nz / L); C.push(k[0], k[1], k[2], k[3] === undefined ? id : k[3]); nv++; }
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < seg; j++) { const a = b0 + i * seg + j, b = b0 + i * seg + (j + 1) % seg, c = b0 + (i + 1) * seg + (j + 1) % seg, d = b0 + (i + 1) * seg + j; I.push(a, c, b, a, d, c); }
    for (const e of [0, nr - 1]) { const r = R[e], nz = e ? 1 : -1, c0 = nv, k = col((r[2] + r[3]) / 2, r[0], 0, 0); P.push(0, (r[2] + r[3]) / 2, r[0]); N.push(0, 0, nz); C.push(k[0], k[1], k[2], k[3] === undefined ? id : k[3]); nv++; for (let j = 0; j < seg; j++) { const p = Q[e * seg + j], kk = col(p[1], p[2], 0, p[0]); P.push(p[0], p[1], p[2]); N.push(0, 0, nz); C.push(kk[0], kk[1], kk[2], kk[3] === undefined ? id : kk[3]); nv++; } for (let j = 0; j < seg; j++) { const a = c0 + 1 + j, b = c0 + 1 + (j + 1) % seg; if (e) I.push(c0, b, a); else I.push(c0, a, b); } } };
  const wheel = (xc, zc, r, w) => { const n = 16, b0 = nv; for (let s = 0; s < 2; s++) for (let k = 0; k < n; k++) { const t = k / n * TAU; P.push(xc + (s ? w : -w), r + Math.cos(t) * r, zc + Math.sin(t) * r); N.push(0, Math.cos(t), Math.sin(t)); C.push(0.022, 0.022, 0.025, 0.08); nv++; } for (let k = 0; k < n; k++) { const a = b0 + k, b = b0 + (k + 1) % n; I.push(a, b, a + n, b, b + n, a + n); }
    for (let s = 0; s < 2; s++) { const c0 = nv; P.push(xc + (s ? w : -w) * 0.8, r, zc); N.push(s ? 1 : -1, 0, 0); C.push(0.16, 0.16, 0.17, 0.08); nv++; for (let q = 0; q < 2; q++) for (let k = 0; k < n; k++) { const t = k / n * TAU, rr = q ? r : r * 0.64, g = q ? 0.022 : 0.30; P.push(xc + (s ? w : -w) * (q ? 1 : 0.86), r + Math.cos(t) * rr, zc + Math.sin(t) * rr); N.push(s ? 1 : -1, 0, 0); C.push(g, g, g * 1.04, 0.08); nv++; }
      for (let k = 0; k < n; k++) { const a = c0 + 1 + k, b = c0 + 1 + (k + 1) % n; if (s) I.push(c0, a, b, a, a + n, b + n, a, b + n, b); else I.push(c0, b, a, a, b + n, a + n, a, b, b + n); } } };
  // dark arch behind each wheel so the body reads as cut out around it
  const arch = (xs, zc, r) => { const n = 12, c0 = nv; P.push(xs, r * 0.8, zc); N.push(Math.sign(xs), 0, 0); C.push(0.015, 0.015, 0.017, 0.08); nv++; for (let k = 0; k <= n; k++) { const t = -Math.PI / 2 + k / n * Math.PI; P.push(xs, r * 0.8 + Math.cos(t) * r, zc + Math.sin(t) * r); N.push(Math.sign(xs), 0, 0); C.push(0.015, 0.015, 0.017, 0.08); nv++; } for (let k = 0; k < n; k++) { if (xs > 0) I.push(c0, c0 + 1 + k, c0 + 2 + k); else I.push(c0, c0 + 2 + k, c0 + 1 + k); } };
  const paint = [1, 1, 1, 0], glass = [0.040, 0.050, 0.060, 0.08], trim = [0.03, 0.03, 0.033, 0.08];
  if (!bus) {
    loft([[-2.15, 0.60, 0.36, 0.80, 4.2], [-2.07, 0.80, 0.24, 0.88, 4.5], [-1.70, 0.845, 0.20, 0.92, 4.8], [-0.60, 0.86, 0.19, 0.93, 4.8], [0.50, 0.86, 0.19, 0.92, 4.8], [1.10, 0.85, 0.20, 0.86, 4.6], [1.75, 0.82, 0.22, 0.75, 4.4], [2.05, 0.76, 0.26, 0.67, 4.2], [2.15, 0.56, 0.33, 0.58, 3.6]], 22, (y) => y < 0.33 ? trim : paint);
    loft([[-1.97, 0.64, 0.84, 0.90, 3.0], [-1.47, 0.70, 0.84, 1.33, 3.2], [-0.92, 0.72, 0.84, 1.43, 3.4], [-0.47, 0.72, 0.84, 1.445, 3.4], [-0.42, 0.725, 0.84, 1.445, 3.4], [-0.37, 0.72, 0.84, 1.445, 3.4], [0.12, 0.72, 0.84, 1.44, 3.4], [0.55, 0.70, 0.84, 1.37, 3.2], [1.22, 0.65, 0.84, 0.90, 3.0]], 22, (y, z, up) => (up > 0.78 && y > 1.2) || Math.abs(z + 0.42) < 0.02 ? paint : glass);
    for (const sx of [-1, 1]) { box(sx * 0.57 - 0.17, 0.585, 2.085, sx * 0.57 + 0.17, 0.70, 2.125, 1, 0.97, 0.88, 0.5); box(sx * 0.60 - 0.17, 0.66, -2.125, sx * 0.60 + 0.17, 0.79, -2.085, 0.6, 0.03, 0.03, 1.0); for (const zc of [1.32, -1.30]) { wheel(sx * 0.78, zc, 0.32, 0.11); arch(sx * 0.862, zc, 0.40); } }
    box(-0.17, 0.40, 2.150, 0.17, 0.50, 2.158, 0.85, 0.85, 0.82, 0.08); box(-0.17, 0.52, -2.158, 0.17, 0.62, -2.150, 0.85, 0.85, 0.82, 0.08);
  } else { // the livery (windows, stripes, destination sign) is drawn by the shader from the body-local position: id 0.15
    loft([[-5.32, 1.14, 0.46, 2.94, 5], [-5.22, 1.22, 0.36, 3.02, 7], [5.12, 1.22, 0.36, 3.02, 7], [5.30, 1.16, 0.44, 2.95, 5]], 28, () => [1, 1, 1, 0.15]);
    for (const sx of [-1, 1]) { box(sx * 0.85 - 0.2, 0.62, 5.30, sx * 0.85 + 0.2, 0.80, 5.33, 1, 0.97, 0.88, 0.5); box(sx * 0.9 - 0.18, 0.72, -5.345, sx * 0.9 + 0.18, 1.0, -5.32, 0.6, 0.03, 0.03, 1.0); for (const zc of [3.5, -3.2]) { wheel(sx * 1.15, zc, 0.48, 0.13); arch(sx * 1.226, zc, 0.58); } }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 4)); g.setIndex(I); return g;
}
const PAINT = [[0.80, 0.80, 0.80], [0.80, 0.80, 0.80], [0.45, 0.46, 0.48], [0.03, 0.03, 0.035], [0.03, 0.03, 0.035], [0.12, 0.12, 0.13], [0.05, 0.07, 0.14], [0.40, 0.04, 0.04], [0.55, 0.50, 0.40]];
export class Traffic {
  constructor(app, deckY, opts = {}) {
    const { scene, world, Q } = app, nav = world.nav, rnd = rng(4242), rr = (a, b) => a + (b - a) * rnd(); this.nav = nav; this.deckY = deckY;
    this.edge = z => nav.roadEdge(z);   // Kawabata-dori follows the east bank; the ground shader paints the same lanes
    const nK = opts.kawabata ?? 12, nS = opts.shijo ?? 7; this.cars = [];
    for (let k = 0; k < nK; k++) { const north = k % 2 === 0, lane = (k >> 1) % 2; this.cars.push({ road: 0, dir: north ? -1 : 1, off: north ? (lane ? 9.6 : 6.4) : (lane ? 13.4 : 16.6), s: rr(-235, 195), v: rr(8.5, 12.5), bus: false, kei: rnd() < 0.3 }); }
    for (let k = 0; k < nS; k++) { const east = k % 2 === 0, lane = (k >> 1) % 2; this.cars.push({ road: 1, dir: east ? 1 : -1, off: east ? (lane ? 151.35 : 148.15) : (lane ? 155.15 : 158.35), s: rr(-195, 110), v: rr(6.5, 9.5), bus: k < 2, kei: false }); }
    const mat = cityMaterial('car', Q, { rough: 0.32, env: 1.0 }), nc = this.cars.filter(c => !c.bus).length, nb = this.cars.length - nc;
    this.mc = new THREE.InstancedMesh(carGeometry(false), mat, Math.max(1, nc)); this.mb = new THREE.InstancedMesh(carGeometry(true), mat, Math.max(1, nb)); const col = new THREE.Color(); let ic = 0, ib = 0;
    for (const c of this.cars) { if (c.bus) { c.i = ib++; this.mb.setColorAt(c.i, col.setRGB(0.62, 0.78, 0.60)); } else { c.i = ic++; const p = PAINT[(rnd() * PAINT.length) | 0]; this.mc.setColorAt(c.i, col.setRGB(p[0], p[1], p[2])); } }
    for (const m of [this.mc, this.mb]) { m.frustumCulled = false; m.castShadow = Q.tier === 'high'; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  update(dt) {
    const nav = this.nav; // keep a gap to the car ahead in the same lane
    for (const c of this.cars) { let gap = 1e9; for (const o of this.cars) if (o !== c && o.road === c.road && o.off === c.off) { let d = (o.s - c.s) * c.dir; const span = c.road ? 310 : 435; if (d < 0) d += span; if (d < gap) gap = d; } const vt = gap < 9 ? 0 : gap < 22 ? c.v * (gap - 9) / 13 : c.v; c.cv = c.cv === undefined ? vt : c.cv + clamp(vt - c.cv, -6 * dt, 2.5 * dt); c.s += c.dir * c.cv * dt;
      let x, y, z, yaw; if (c.road === 0) { if (c.s > 198) c.s -= 435; if (c.s < -237) c.s += 435; z = c.s; x = this.edge(z) + c.off; const x2 = this.edge(z + c.dir * 4) + c.off; yaw = Math.atan2(x2 - x, c.dir * 4); y = nav.ground(x, clamp(z, -225, 175)); }
      else { if (c.s > 112) c.s -= 310; if (c.s < -198) c.s += 310; x = c.s; z = c.off; yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; const dy = this.deckY ? this.deckY(x) : null; y = dy !== null && dy !== undefined ? dy : nav.ground(x, z); }
      c.x = x; c.z = z; this._e.set(0, yaw, 0); this._q.setFromEuler(this._e); const k = c.kei ? [0.86, 1.16, 0.80] : [1, 1, 1]; this._m.compose(this._p.set(x, y + 0.02, z), this._q, this._s.set(k[0], k[1], k[2])); (c.bus ? this.mb : this.mc).setMatrixAt(c.i, this._m); }
    this.mc.instanceMatrix.needsUpdate = true; this.mb.instanceMatrix.needsUpdate = true;
  }
}
