// Pigeon behaviour (ethology-driven state machine + boids flight) and procedural animation -> poses.
import * as THREE from './three.module.min.js';
import { newPose } from './birds.js';
import { RIG } from './birdgeo.js';
import { clamp, lerp, smooth, damp, dampAng, angDiff, TAU, rr, R } from './util.js';

export const MORPHS = [
  { n: '灰二引(野生型)', p: 0.27, a: [0.205, 0.228, 0.262, 0], b: [0.44, 0.46, 0.495, 0] },
  { n: '灰胡麻', p: 0.33, a: [0.172, 0.190, 0.220, 1], b: [0.365, 0.385, 0.42, 0] },
  { n: '黒胡麻', p: 0.20, a: [0.098, 0.106, 0.122, 2], b: [0.20, 0.21, 0.23, 0] },
  { n: '黒', p: 0.05, a: [0.043, 0.045, 0.050, 3], b: [0.06, 0.06, 0.066, 0] },
  { n: '栗', p: 0.05, a: [0.30, 0.165, 0.115, 0], b: [0.50, 0.375, 0.30, 0] },
  { n: 'モザイク(白斑)', p: 0.10, a: [0.18, 0.20, 0.23, 1], b: [0.38, 0.40, 0.43, 0.42] },
];
const STAND_H = 0.094, STEP = 0.066;
const _v = new THREE.Vector3();

export class Flock {
  constructor(app, birds) {
    this.app = app; this.r = birds; this.nav = app.world.nav; this.meta = app.world.meta; this.n = birds.n; this.B = []; this.food = []; this.events = []; this.t = 0; this.hour = app.hour;
    this._sites();
    for (let i = 0; i < this.n; i++) this.B.push(this._spawn(i));
    this.threats = []; // {x,z,r,t}
  }
  // ---------------------------------------------------------------- environment knowledge
  _sites() {
    const nav = this.nav, c = nav.core, S = [], perches = [], shore = [], decks = [];
    const ok = (x, z) => nav.walkable(x, z) && nav.cls(x, z) !== 1;
    const add = (x, z, r, n, w) => { if (ok(x, z)) S.push({ x, z, r, n, w, y: nav.ground(x, z) }); };
    for (const z of [-28, 22, -78, 70, -130, 118, -185]) add(-66 + (z < -100 ? 2 : 0), z, 7, '鴨川 西岸の河川敷', 3);
    for (const z of [-150, -60, 40, 110]) add(-14, z, 3, '鴨川 東岸', 1);
    // LOD3 streets: sample road cells
    const road = []; for (let j = 4; j < c.h; j += 8) for (let i = 4; i < c.w; i += 8) if (nav.C[j * c.w + i] === 2) road.push([c.x0 + (i + 0.5) * c.res, c.z0 + (j + 0.5) * c.res]);
    this.road = road; let lastP = null; road.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [x, z] of road) { if (S.every(s => Math.hypot(s.x - x, s.z - z) > 34)) add(x, z, 2.2, x < 0 ? '先斗町通' : '祇園白川', 2); }
    this.sites = S;
    // perches: roof edges (building top next to a lower cell), decks / fences (furniture tops)
    for (let j = 3; j < c.h - 3; j += 3) for (let i = 3; i < c.w - 3; i += 3) { const k = j * c.w + i, t = nav.T[k]; const x = c.x0 + (i + 0.5) * c.res, z = c.z0 + (j + 0.5) * c.res;
      if (t !== -32768) { const y = t / 100, g = nav.G[k] / 100; if (y - g < 3.5 || y - g > 22) continue; let edge = false; for (const [a, b] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const q = nav.T[(j + b) * c.w + i + a]; if (q === -32768 || q / 100 < y - 2.5) { edge = true; break; } } if (edge && Math.random() < 0.5) perches.push({ x, y, z }); }
      else { const f = nav.F[k]; if (f !== -32768) { const y = f / 100, g = nav.G[k] / 100; if (y - g > 0.9 && y - g < 6 && Math.random() < 0.35) decks.push({ x, y, z }); } }
      if (nav.C[k] === 1 && nav.W[k] / 100 - nav.G[k] / 100 < 0.06 && x < -40 && Math.random() < 0.3) shore.push({ x, z, y: nav.W[k] / 100 }); }
    this.perches = perches; this.decks = decks; this.shore = shore;
    for (const s of S) { s.perch = perches.filter(p => Math.hypot(p.x - s.x, p.z - s.z) < 75).concat(decks.filter(p => Math.hypot(p.x - s.x, p.z - s.z) < 60)); if (!s.perch.length) s.perch = perches.slice(0, 50); }
    for (const s of S) for (let k = 0; k < 22 * s.w; k++) this._crumb(s);
  }
  _crumb(s, r) { const a = R() * TAU, d = Math.sqrt(R()) * (r || s.r), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (this.nav.walkable(x, z) && this.nav.cls(x, z) !== 1) { this.food.push({ x, z, y: this.nav.ground(x, z) }); this.foodDirty = true; } if (this.food.length > 900) this.food.splice(0, 60); }
  _groundPoint(s, r) { for (let k = 0; k < 24; k++) { const a = R() * TAU, d = Math.sqrt(R()) * (r || s.r), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (this.nav.walkable(x, z) && this.nav.cls(x, z) !== 1 && !(this.threats && this.threats.some(t => t.still && Math.hypot(t.x - x, t.z - z) < t.r))) return { x, z, y: this.nav.ground(x, z) }; } return { x: s.x, z: s.z, y: this.nav.ground(s.x, s.z) }; }
  _spawn(i) {
    let r = R(), mi = 0; for (let k = 0; k < MORPHS.length; k++) { if ((r -= MORPHS[k].p) < 0) { mi = k; break; } } const m = MORPHS[mi];
    const jit = (a, s) => a.map((v, k) => k < 3 ? v * (1 + rr(-s, s)) : v); this.r.setMorph(i, jit(m.a, 0.08), jit(m.b, 0.06));
    const site = this.sites[i < 14 ? 0 : (R() * this.sites.length) | 0] || this.sites[0], g = this._groundPoint(site, i < 14 ? 3.2 : site.r);
    const b = { i, morph: m, male: i % 2 === 0, mate: i ^ 1, x: g.x, y: g.y, z: g.z, yaw: R() * TAU, v: 0, vx: 0, vy: 0, vz: 0, air: false, st: 'forage', sub: 'rest', t: 0, think: R() * 0.5, site, fav: site, hunger: rr(0.4, 0.9), thirst: rr(0.0, 0.6), cd: rr(15, 240),
      bodyH: STAND_H, pitch: 0.48, roll: 0, fold: 1, wph: R() * 6, flapAmp: 0, tailSpread: 0.08, tailPitch: 0.1, puff: 0, neckPuff: 0, crouch: 0,
      gait: { ph: 0, side: 0, L: { x: 0, y: 0, z: 0 }, R: { x: 0, y: 0, z: 0 }, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, lift: 0, init: false },
      head: { x: 0, y: 0, z: 0, hold: null, yaw: 0, pitch: -0.2, tilt: 0, tyaw: 0, tpitch: -0.2, ttilt: 0, sac: R() * 1.5, ok: false }, peck: 0, peckT: null, wyaw: R() * TAU, wt: 0, pause: 0, evade: 0, alarmIn: 0, nf: 0, pose: newPose(), lag: rr(0, 0.5), bank: 0, fpitch: 0, legOut: 0, landT: 0, speed: 0, perch: null, home: null };
    if (i >= 14 && R() < 0.45 && site.perch.length) { const p = site.perch[(R() * site.perch.length) | 0]; b.x = p.x; b.y = p.y; b.z = p.z; b.st = 'loaf'; b.hunger = rr(0.1, 0.45); b.perch = p; }
    return b;
  }
  // ---------------------------------------------------------------- decisions
  chooseSite(b) { if (R() < 0.4) return b.fav; const m = this.B[b.mate]; if (m && m.st === 'forage' && R() < 0.5) return m.site; let best = null, bn = 0; for (const s of this.sites) { let n = 0; for (const q of this.B) if (q.site === s && q.st === 'forage') n++; n *= s.w; if (n > bn) { bn = n; best = s; } } return best && R() < 0.6 ? best : this.sites[(R() * this.sites.length) | 0]; }
  flyTo(b, x, y, z, next, alarm) { if (!b.air) { b.takeoff = 0; this.events.push({ t: 'takeoff', b, alarm: !!alarm }); } b.st = 'fly'; b.t = 0; b.dest = { x, y, z }; b.next = next; b.alarm = !!alarm; b.air = true; b.peck = 0; b.peckT = null; b.food = null; b.perch = null; if (Math.hypot(b.vx, b.vz) < 1) { b.vx = Math.sin(b.yaw) * 1.5; b.vz = Math.cos(b.yaw) * 1.5; b.vy = 2.4; } }
  goForage(b, s) { b.site = s; const g = this._groundPoint(s, s.r * 0.7); this.flyTo(b, g.x, g.y, g.z, 'forage'); }
  goPerch(b, s) { const L = (s || b.site).perch, p = L[(R() * L.length) | 0]; if (!p) return; if (p.low) { this.flyTo(b, p.x, p.y, p.z, 'loaf'); b.dest.low = true; b.perchT = p; return; } const ox = rr(-0.25, 0.25), oz = rr(-0.25, 0.25), y = Math.max(this.nav.top(p.x + ox, p.z + oz), p.y - 0.4); this.flyTo(b, p.x + ox, y, p.z + oz, 'loaf'); b.perchT = p; }
  scare(x, z, r, strong) { const wx = clamp(x + rr(-70, 70), -180, 280), wz = clamp(z + rr(-70, 70), -200, 160), wy = Math.max(this.nav.top(wx, wz), 6) + rr(14, 26); let n = 0;
    for (const q of this.B) { if (q.air || q.manual || q.alarmIn > 0) continue; const d = Math.hypot(q.x - x, q.z - z); if (d > r) continue; if (R() < 0.9) { q.alarmIn = rr(0.02, 0.25) + d * 0.03; q.aw = { x: wx + rr(-3, 3), y: wy + rr(-2, 2), z: wz + rr(-3, 3) }; n++; } }
    if (n >= 4) this.events.push({ t: 'flush', x, z, n }); return n; }
  think(b, dtT) {
    const nav = this.nav, hour = this.hour, night = hour < 5.8 || hour > 17.7;
    if (night) { if (b.st !== 'roost') { const rs = this.roosts, h = b.home || (b.home = (rs && rs.length && b.i % 5 < 3) ? rs[(b.i * 7) % rs.length] : this.perches[(b.i * 37) % this.perches.length]); this.flyTo(b, h.x, h.y, h.z, 'roost'); if (h.low) b.dest.low = true; } return; }
    if (b.st === 'roost') { if (hour > 5.8 + b.lag) this.goForage(b, this.chooseSite(b)); return; }
    for (const th of this.threats) { const d = Math.hypot(b.x - th.x, b.z - th.z); if (d < th.r && Math.abs(b.y - th.y) < 3) { if (!th.still && (th.run || d < th.r * 0.35)) { this.scare(b.x, b.z, 5.5); return; } b.wyaw = Math.atan2(b.x - th.x, b.z - th.z); b.wt = 1.2; b.evade = 0.9; b.food = null; b.pause = 0; } }
    if (b.st === 'court' || b.st === 'drink' || b.st === 'bathe') return;
    if (b.thirst > 0.8 && this.shore.length) { let w = null, wd = 1e9; for (let k = 0; k < 12; k++) { const s = this.shore[(R() * this.shore.length) | 0], d = Math.hypot(s.x - b.x, s.z - b.z); if (d < wd) { wd = d; w = s; } } this.flyTo(b, w.x, w.y, w.z, R() < 0.3 ? 'bathe' : 'drink'); return; }
    if (b.male && b.cd <= 0 && R() < 0.15) { for (const q of this.B) if (!q.male && !q.air && (q.st === 'loaf' || q.st === 'forage') && Math.abs(q.y - b.y) < 0.2 && Math.hypot(q.x - b.x, q.z - b.z) < 2.5) { b.prev = b.st; b.st = 'court'; b.tg = q; b.t = 0; b.cd = rr(150, 330); b.cdir = R() < 0.5 ? 1 : -1; b.cooT = 0.4; q.pause = 1.5; return; } b.cd = 4; }
    if (b.st === 'forage') {
      if (b.hunger < 0.1) { this.goPerch(b); return; }
      let best = null, bd = 36; for (const f of this.food) { const d = (f.x - b.x) ** 2 + (f.z - b.z) ** 2; if (d < bd && Math.abs(f.y - b.y) < 0.6) { bd = d; best = f; } } b.food = best;
      if (!best) { b.nf += dtT; if (b.nf > (b.nfMax || (b.nfMax = rr(70, 170)))) { b.nf = 0; b.nfMax = 0; let s = this.chooseSite(b); if (s === b.site) s = this.sites[(R() * this.sites.length) | 0]; this.goForage(b, s); } } else b.nf = 0;
    } else if (b.st === 'loaf') {
      if (b.hunger > 0.55) { const s = this.chooseSite(b); for (const q of this.B) if (q !== b && q.st === 'loaf' && q.hunger > 0.3 && Math.hypot(q.x - b.x, q.z - b.z) < 9 && Math.abs(q.y - b.y) < 4) this.goForage(q, s); this.goForage(b, s); }
    }
  }
  canStep(b, x, z) { const nav = this.nav; if (b.y - nav.ground(b.x, b.z) > 0.6) { return Math.abs(nav.top(x, z) - b.y) < 0.25; } return nav.walkable(x, z) && Math.abs(nav.ground(x, z) - b.y) < 0.35; }
  // ---------------------------------------------------------------- ground behaviour
  ground(b, dt) {
    b.t += dt; const nav = this.nav;
    if (b.peck > 0) { b.v = 0; return; }
    if (b.st === 'forage') {
      if (b.pause > 0) { b.pause -= dt; b.v = damp(b.v, 0, 12, dt); return; }
      let want, v;
      if (b.food && !b.food.dead) { const dx = b.food.x - b.x, dz = b.food.z - b.z, d = Math.hypot(dx, dz); want = Math.atan2(dx, dz); v = d > 1.4 ? 0.58 : 0.34; if (d < 0.105) { const a = Math.abs(angDiff(b.yaw, want)); if (a < 0.5) { this.peckAt(b, b.food); return; } v = 0.05; } }
      else { b.wt -= dt; if (b.wt <= 0) { b.wt = rr(1, 3.2); b.wyaw = b.yaw + rr(-1.3, 1.3); const q = R(); if (q < 0.3) b.pause = rr(0.5, 1.8); else if (q < 0.55) { this.peckAt(b, null); return; } } want = b.wyaw; v = 0.30; }
      if (b.evade > 0) { b.evade -= dt; v = 0.85; want = b.wyaw; }
      b.yaw = dampAng(b.yaw, want, 7, dt); const nx = b.x + Math.sin(b.yaw) * v * dt, nz = b.z + Math.cos(b.yaw) * v * dt;
      if (this.canStep(b, nx, nz)) { b.x = nx; b.z = nz; b.v = damp(b.v, v, 10, dt); } else { b.wyaw = b.yaw + Math.PI * rr(0.6, 1.4); b.wt = 1; b.food = null; b.v = damp(b.v, 0, 12, dt); }
      if (b.y - nav.ground(b.x, b.z) < 0.6) b.y = nav.ground(b.x, b.z);
    } else if (b.st === 'loaf' || b.st === 'roost') {
      b.v = damp(b.v, 0, 12, dt); b.subT = (b.subT || 0) - dt;
      if (b.st === 'roost') b.sub = 'sleep'; else if (b.subT <= 0) { const sunny = this.hour > 9 && this.hour < 15, q = R(); b.sub = q < 0.42 ? 'preen' : (q < 0.56 && sunny ? 'sun' : (q < 0.66 ? 'sleep' : 'rest')); b.subT = rr(6, 16); b.side = R() < 0.5 ? 1 : -1; b.pv = R(); }
    } else if (b.st === 'court') {
      const q = b.tg; if (b.t > 12 || q.air) { b.st = b.prev || 'forage'; b.t = 0; return; }
      const d = Math.hypot(b.x - q.x, b.z - q.z); let nx, nz;
      if (d > 0.42) { const a = Math.atan2(q.x - b.x, q.z - b.z); nx = b.x + Math.sin(a) * 0.5 * dt; nz = b.z + Math.cos(a) * 0.5 * dt; } else { const a = Math.atan2(b.x - q.x, b.z - q.z) + dt * 1.5 * b.cdir; nx = q.x + Math.sin(a) * 0.30; nz = q.z + Math.cos(a) * 0.30; }
      if (this.canStep(b, nx, nz)) { b.v = damp(b.v, Math.hypot(nx - b.x, nz - b.z) / Math.max(dt, 1e-3), 8, dt); b.x = nx; b.z = nz; } else b.v = 0;
      b.yaw = dampAng(b.yaw, Math.atan2(q.x - b.x, q.z - b.z), 8, dt); b.cooT -= dt; if (b.cooT <= 0) { b.cooT = 2.2; this.events.push({ t: 'coo', b }); }
    } else if (b.st === 'drink') { b.v = 0; if (b.t > 4.2) { b.thirst = 0; b.st = 'forage'; b.t = 0; }
    } else if (b.st === 'bathe') { b.v = 0; if (b.t > 7) { b.thirst = 0; b.wet = 1; this.goPerch(b); } if (R() < dt * 5) this.events.push({ t: 'splash', b });
    } else b.v = 0;
  }
  peckAt(b, f) { b.peck = 1e-4; b.v = 0; if (f && !f.dead) { b.peckT = { x: f.x, y: f.y, z: f.z }; f.dead = true; const k = this.food.indexOf(f); if (k >= 0) this.food.splice(k, 1); this.foodDirty = true; b.hunger = Math.max(0, b.hunger - 0.05); } else { const d = 0.10; b.peckT = { x: b.x + Math.sin(b.yaw) * d, y: b.y, z: b.z + Math.cos(b.yaw) * d }; b.hunger = Math.max(0, b.hunger - 0.012); } b.food = null; this.events.push({ t: 'peck', b }); }
  // ---------------------------------------------------------------- flight (boids + terrain following)
  fly(b, dt) {
    b.t += dt; const nav = this.nav, d = b.dest, tx = d.x - b.x, ty = d.y - b.y, tz = d.z - b.z, dH = Math.hypot(tx, tz), sp = Math.hypot(b.vx, b.vz) || 0.01, fx = b.vx / sp, fz = b.vz / sp;
    let cruise = b.alarm ? 15.5 : 12.5, want = dH > 16 ? cruise : Math.max(1.6, dH * 0.85 + 0.6);
    // steer toward target
    let ax = tx / (dH || 1) * want - b.vx, az = tz / (dH || 1) * want - b.vz;
    // flockmates: separation + mild alignment/cohesion
    if (dH > 5) { let cx = 0, cz = 0, vx = 0, vz = 0, n = 0; for (const q of this.B) { if (q === b || !q.air) continue; const ox = q.x - b.x, oy = q.y - b.y, oz = q.z - b.z, dd = ox * ox + oy * oy + oz * oz; if (dd > 64) continue; const dq = Math.sqrt(dd) + 1e-3; if (dq < 1.1) { ax -= ox / dq * (1.1 - dq) * 14; az -= oz / dq * (1.1 - dq) * 14; b.vy -= oy / dq * (1.1 - dq) * 6 * dt; } cx += ox; cz += oz; vx += q.vx; vz += q.vz; n++; } if (n) { ax += (vx / n - b.vx) * 0.5 + cx / n * 0.25; az += (vz / n - b.vz) * 0.5 + cz / n * 0.25; } }
    // obstacle look-ahead
    const h0 = nav.top(b.x, b.z), h1 = nav.top(b.x + fx * 4, b.z + fz * 4), h2 = nav.top(b.x + fx * 11, b.z + fz * 11); let needY;
    if (d.low && dH < 22) needY = d.y + 0.25 + dH * 0.03;
    else if (dH < 7) needY = Math.max(d.y + dH * 0.32, h0 > d.y + 0.5 && dH > 1.2 ? h0 + 0.5 : d.y);
    else { needY = Math.max(h0, h1, h2) + 2.2; needY = Math.max(needY, d.y + Math.min(dH * 0.28, 22)); if (h1 > b.y + 0.5) { ax -= fx * 22; az -= fz * 22; if (h1 > b.y + 8) { ax += -fz * 14; az += fx * 14; } } }
    const lim = b.alarm ? 26 : 16, al = Math.hypot(ax, az); if (al > lim) { ax *= lim / al; az *= lim / al; }
    b.vx += ax * dt; b.vz += az * dt; const tvy = clamp((needY - b.y) * 2.4, -5.5, 6.5); b.vy = damp(b.vy, tvy, 5, dt);
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; const fl = nav.solidTop(b.x, b.z); if (b.y < fl + 0.02) { b.y = fl + 0.02; if (b.vy < 0) b.vy = 0; }
    const nyaw = Math.atan2(b.vx, b.vz), turn = angDiff(b.yaw, nyaw); b.yaw = dampAng(b.yaw, nyaw, 10, dt); b.bank = damp(b.bank, clamp(turn / Math.max(dt, 1e-3) * 0.12, -0.9, 0.9), 5, dt); b.speed = Math.hypot(b.vx, b.vy, b.vz);
    b.landing = dH < 6 ? 1 - dH / 6 : 0;
    if ((dH < 0.3 && Math.abs(ty) < 0.5) || b.t > 160) this.land(b);
  }
  land(b) {
    const d = b.dest; b.x = d.x; b.z = d.z; b.y = d.y;
    if (b.next === 'return') { const s = b.site; if (R() < 0.35) this.goPerch(b, s); else { const g = this._groundPoint(s, 6); this.flyTo(b, g.x, g.y, g.z, 'forage'); } return; }
    b.air = false; b.vx = b.vy = b.vz = 0; b.v = 0; b.bank = 0; b.st = b.next; b.t = 0; b.sub = 'rest'; b.subT = rr(2, 6); b.landT = 0.5; b.nf = 0; b.alarm = false; b.gait.init = false; b.head.hold = null; if (b.perchT) { b.perch = b.perchT; b.perchT = null; } this.events.push({ t: 'land', b });
  }
  // ---------------------------------------------------------------- main update
  update(dt, hour) {
    this.t += dt; this.hour = hour; const dh = dt * (this.app.timeScale || 0) / 3600 + dt / 3600 * 60, peak = (hour > 6.0 && hour < 9.0) || (hour > 14.6 && hour < 17.2) ? 2.3 : 0.62;
    this.fT = (this.fT || 0) - dt; if (this.fT <= 0) { this.fT = 0.3; const s = this.sites[(R() * this.sites.length) | 0]; if (s) this._crumb(s); }
    for (const b of this.B) {
      b.hunger = Math.min(1, b.hunger + dh * 0.12 * peak); b.thirst = Math.min(1, b.thirst + dh * 0.035); b.cd -= dt;
      if (b.alarmIn > 0 && !b.air && !b.manual) { b.alarmIn -= dt; if (b.alarmIn <= 0) { this.flyTo(b, b.aw.x, b.aw.y, b.aw.z, 'return', true); } }
      if (b.manual) { if (this.manualStep) this.manualStep(b, dt); }
      else if (b.st === 'fly') this.fly(b, dt);
      else { b.think -= dt; if (b.think <= 0) { const tt = rr(0.25, 0.45); b.think = tt; this.think(b, tt); } if (b.st !== 'fly') this.ground(b, dt); }
      this.animate(b, dt); this.r.write(b.i, b.pose);
    }
    this.r.commit();
  }
  // ---------------------------------------------------------------- procedural animation
  animate(b, dt) {
    const p = b.pose, nav = this.nav, sy = Math.sin(b.yaw), cy = Math.cos(b.yaw), H = b.head, g = b.gait;
    let tH = STAND_H, tPitch = 0.46, tRoll = 0, tFold = 1, tTailS = 0.08, tTailP = 0.08, tPuff = 0, tNeck = 0, hOff = [0, 0.108, 0.064], hp = -0.18, lookFree = true, legMode = 'ik', wingMode = 'fold';
    const walking = !b.air && b.v > 0.03;
    if (b.air) {
      const slow = Math.max(b.landing || 0, b.takeoff !== undefined && b.takeoff < 0.7 ? 1 - b.takeoff / 0.7 : 0); if (b.takeoff !== undefined) b.takeoff += dt;
      wingMode = 'flap'; tFold = 0; tPitch = lerp(0.10, 0.85, slow) + clamp(b.vy * 0.05, -0.25, 0.3); tRoll = b.bank; tTailS = lerp(0.12, 1.0, slow); tTailP = lerp(0.0, -0.45, slow); hOff = [0, lerp(0.040, 0.085, slow), lerp(0.152, 0.10, slow)]; hp = lerp(-0.05, -0.3, slow); lookFree = false; legMode = (b.landing || 0) > 0.35 ? 'reach' : (b.takeoff !== undefined && b.takeoff < 0.35 ? 'trail' : 'tuck'); b.slow = slow; tH = STAND_H;
    } else {
      b.takeoff = undefined; b.landing = 0;
      if (walking) { tPitch = 0.36; hOff = [0, 0.100, 0.078]; hp = -0.22; }
      if (b.st === 'loaf' || b.st === 'roost') {
        if (b.sub === 'sleep') { tH = 0.060; tPitch = 0.22; tPuff = 1; hOff = [0, 0.060, 0.050]; hp = -0.1; lookFree = false; }
        else if (b.sub === 'sun') { tH = 0.050; tPitch = 0.1; tRoll = 0.55 * b.side; tTailS = 0.9; lookFree = true; hOff = [0, 0.085, 0.07]; }
        else if (b.sub === 'preen') { lookFree = false; tPuff = 0.35; }
        else { tPuff = 0.15; }
      }
      if (b.st === 'court') { tNeck = 1; tPuff = 0.3; tTailS = 0.95; tTailP = -0.35; tH = 0.092; lookFree = false; }
      if (b.st === 'bathe') { tH = 0.050; tPuff = 0.6; tPitch = 0.2; }
      if (b.landT > 0) { b.landT -= dt; tH -= 0.02 * (b.landT / 0.5); }
    }
    // ---- peck / drink timeline (overrides head target)
    let peckK = 0; if (b.peck > 0) { b.peck += dt / 0.36; const t = b.peck; peckK = t < 0.38 ? smooth(0, 0.38, t) : (t < 0.52 ? 1 : 1 - smooth(0.52, 1.0, t)); if (t >= 1) { b.peck = 0; b.peckT = null; } }
    if (b.st === 'drink') { const t = b.t; peckK = t < 0.4 ? smooth(0, 0.4, t) : (t < 3.6 ? 1 : 1 - smooth(3.6, 4.2, t)); if (!b.peckT) b.peckT = { x: b.x + sy * 0.10, y: nav.waterY(b.x + sy * 0.12, b.z + cy * 0.12) > -300 ? Math.max(b.y, nav.waterY(b.x + sy * 0.12, b.z + cy * 0.12)) : b.y, z: b.z + cy * 0.10 }; }
    if (peckK > 0) { tPitch = lerp(tPitch, -0.10, peckK); tH = lerp(tH, 0.094, peckK); tTailP = lerp(tTailP, 0.3, peckK); }
    // ---- smooth body parameters
    const kb = b.air ? 7 : 11; b.bodyH = damp(b.bodyH, tH, kb, dt); b.pitch = damp(b.pitch, tPitch, kb, dt); b.roll = damp(b.roll, tRoll, 6, dt); b.fold = damp(b.fold, tFold, b.air ? 14 : 9, dt); b.tailSpread = damp(b.tailSpread, tTailS, 8, dt); b.tailPitch = damp(b.tailPitch, tTailP, 8, dt); b.puff = damp(b.puff, tPuff, 2.5, dt); b.neckPuff = damp(b.neckPuff, tNeck, 4, dt);
    // ---- gait: planted feet, alternate steps
    const rx = cy, rz = -sy; // bird's left vector in world (x = left)
    const rest = (side, o) => { const s = side === 0 ? 1 : -1; o.x = b.x + rx * 0.024 * s; o.z = b.z + rz * 0.024 * s; o.y = b.air ? b.y : (b.y - nav.ground(b.x, b.z) > 0.6 ? b.y : nav.ground(o.x, o.z)); return o; };
    if (!g.init) { rest(0, g.L); rest(1, g.R); g.init = true; g.ph = 0; g.lift = 0; }
    let bob = 0, sway = 0, stepK = 0;
    if (!b.air) {
      if (walking) { g.ph += dt * b.v / STEP; if (g.ph >= 1 || !g.moving) { g.ph = g.moving ? g.ph - 1 : 0; g.moving = true; g.side = 1 - g.side; const f = g.side === 0 ? g.L : g.R; g.from.x = f.x; g.from.y = f.y; g.from.z = f.z; rest(g.side, g.to); const lead = STEP * 0.95; g.to.x += sy * lead; g.to.z += cy * lead; g.to.y = b.y - nav.ground(b.x, b.z) > 0.6 ? b.y : nav.ground(g.to.x, g.to.z); }
        const sw = clamp(g.ph / 0.62, 0, 1), e = sw * sw * (3 - 2 * sw), f = g.side === 0 ? g.L : g.R; f.x = lerp(g.from.x, g.to.x, e); f.z = lerp(g.from.z, g.to.z, e); f.y = lerp(g.from.y, g.to.y, e) + Math.sin(sw * Math.PI) * 0.014; g.lift = Math.sin(sw * Math.PI); stepK = sw;
        bob = Math.sin(g.ph * Math.PI) * 0.0035; sway = (g.side === 0 ? -1 : 1) * Math.sin(Math.min(1, g.ph / 0.62) * Math.PI) * 0.004;
      } else { if (g.moving) { g.moving = false; } g.lift = damp(g.lift, 0, 10, dt);
        // settle feet under the body when standing
        for (let s = 0; s < 2; s++) { const f = s === 0 ? g.L : g.R, o = rest(s, _v); const dd = Math.hypot(f.x - o.x, f.z - o.z); if (dd > 0.03 || Math.abs(f.y - o.y) > 0.02) { f.x = damp(f.x, o.x, 14, dt); f.z = damp(f.z, o.z, 14, dt); f.y = damp(f.y, o.y, 14, dt); } } }
    }
    // ---- body centre
    const cxw = b.x + rx * sway, czw = b.z + rz * sway, cyw = b.y + b.bodyH + bob + (b.air ? -0.012 * Math.cos(b.wph) * (b.flapAmp || 0) : 0);
    p.x = cxw; p.y = cyw; p.z = czw; p.yaw = b.yaw; p.pitch = b.pitch + (b.st === 'court' ? 0.22 * Math.sin(b.t * 5.2) - 0.18 : 0); p.roll = b.roll; p.tailSpread = b.tailSpread; p.tailPitch = b.tailPitch; p.puff = b.puff; p.neckPuff = b.neckPuff; p.tailYaw = b.air ? -b.bank * 0.25 : 0;
    // ---- head: world-stabilised target
    const toModel = (wx, wy, wz, o) => { const dx = wx - cxw, dz = wz - czw; o[0] = dx * cy - dz * sy; o[1] = wy - cyw; o[2] = dx * sy + dz * cy; return o; };
    let dHx = cxw + rx * hOff[0] + sy * hOff[2], dHy = cyw + hOff[1], dHz = czw + rz * hOff[0] + cy * hOff[2];
    if (b.st === 'court') { const k = 0.5 + 0.5 * Math.sin(b.t * 5.2); dHy -= 0.05 * k; dHx += sy * 0.02 * k; dHz += cy * 0.02 * k; hp = -0.2 - 0.9 * k; }
    if (b.st === 'loaf' && b.sub === 'preen') { const k = 0.5 + 0.5 * Math.sin(b.t * 9), back = b.pv < 0.6; const ox = back ? 0.030 * b.side : 0.004 * b.side, oy = back ? 0.050 + 0.01 * k : 0.012 + 0.008 * k, oz = back ? -0.012 : 0.070; dHx = cxw + rx * ox + sy * oz; dHy = cyw + oy; dHz = czw + rz * ox + cy * oz; H.tyaw = back ? 2.4 * b.side : 0.3 * b.side; H.tpitch = back ? -0.5 - 0.2 * k : -1.5 - 0.15 * k; H.ttilt = 0.3 * b.side; }
    if (peckK > 0 && b.peckT) { const T = b.peckT; const bx = T.x - sy * 0.012, bz = T.z - cy * 0.012, by = T.y + 0.030; dHx = lerp(dHx, bx, peckK); dHy = lerp(dHy, by, peckK); dHz = lerp(dHz, bz, peckK); hp = lerp(hp, -1.42, peckK); lookFree = false; H.tyaw = 0; H.ttilt = 0; }
    if (!H.ok) { H.x = dHx; H.y = dHy; H.z = dHz; H.ok = true; }
    if (walking && peckK === 0 && b.v < 0.72) { // hold & thrust head-bob
      if (g.ph < 0.60) { if (!H.hold) H.hold = { x: H.x, y: dHy, z: H.z }; H.x = damp(H.x, H.hold.x, 40, dt); H.z = damp(H.z, H.hold.z, 40, dt); H.y = damp(H.y, dHy, 20, dt); }
      else { H.hold = null; const lead = 0.034, k = smooth(0.60, 1.0, g.ph), tx = dHx + sy * lead, tz = dHz + cy * lead; H.x = lerp(H.x, tx, clamp(k * 1.4 * dt * 34, 0, 1)); H.z = lerp(H.z, tz, clamp(k * 1.4 * dt * 34, 0, 1)); H.y = damp(H.y, dHy + 0.004, 20, dt); }
    } else { H.hold = null; const k = b.air ? 30 : (peckK > 0 ? 38 : 16); H.x = damp(H.x, dHx, k, dt); H.y = damp(H.y, dHy, k, dt); H.z = damp(H.z, dHz, k, dt); }
    const hm = toModel(H.x, H.y, H.z, this._hm || (this._hm = [0, 0, 0]));
    // keep the neck within its anatomical length
    { const nbx = 0, nby = RIG.neckBase.y * Math.cos(p.pitch) + RIG.neckBase.z * Math.sin(p.pitch), nbz = -RIG.neckBase.y * Math.sin(p.pitch) + RIG.neckBase.z * Math.cos(p.pitch); let dx = hm[0] - nbx, dy = hm[1] - nby, dz = hm[2] - nbz; const L = Math.hypot(dx, dy, dz), mx = 0.118, mn = 0.035; if (L > mx || L < mn) { const s = (L > mx ? mx : mn) / (L || 1); hm[0] = nbx + dx * s; hm[1] = nby + dy * s; hm[2] = nbz + dz * s; const wx = cxw + rx * hm[0] + sy * hm[2], wz = czw + rz * hm[0] + cy * hm[2]; H.x = wx; H.z = wz; H.y = cyw + hm[1]; } }
    p.hx = hm[0]; p.hy = hm[1]; p.hz = hm[2];
    // saccadic head movements
    if (lookFree) { H.sac -= dt; if (H.sac <= 0) { H.sac = walking ? rr(0.5, 1.6) : rr(0.35, 2.4); H.tyaw = rr(-1.0, 1.0) * (R() < 0.3 ? 1.6 : 0.6); H.tpitch = hp + rr(-0.25, 0.3); H.ttilt = R() < 0.3 ? rr(-0.5, 0.5) : rr(-0.08, 0.08); } }
    else if (!(b.st === 'loaf' && b.sub === 'preen')) { H.tyaw = 0; H.tpitch = hp; H.ttilt = 0; }
    if (b.lookAt) { const a = Math.atan2(b.lookAt.x - H.x, b.lookAt.z - H.z); H.tyaw = clamp(angDiff(b.yaw, a), -1.8, 1.8); }
    H.yaw = damp(H.yaw, H.tyaw, 26, dt); H.pitch = damp(H.pitch, lookFree ? H.tpitch : (b.st === 'loaf' && b.sub === 'preen' ? H.tpitch : hp), 26, dt); H.tilt = damp(H.tilt, H.ttilt, 22, dt);
    p.hYaw = H.yaw; p.hPitch = H.pitch - (b.air ? 0 : 0) ; p.hTilt = H.tilt - (b.air ? b.roll * 0.0 : 0);
    // ---- wings
    const W0 = p.wing[0], W1 = p.wing[1];
    if (wingMode === 'flap') { const slow = b.slow || 0, f = lerp(6.3, 9.0, slow) * (b.alarm ? 1.12 : 1), A = lerp(0.80, 1.22, slow), gl = b.glide ? 1 : 0; b.flapAmp = damp(b.flapAmp, gl ? 0 : 1, 6, dt); b.wph += dt * f * TAU * (0.25 + 0.75 * b.flapAmp);
      const th = b.wph, ds = Math.max(0, Math.sin(th)), us = Math.max(0, -Math.sin(th)), fa = b.flapAmp;
      for (let s = 0; s < 2; s++) { const w = p.wing[s], side = s === 0 ? 1 : -1, bankK = 1 + side * b.bank * 0.25; w.flap = lerp(0.24, 0.20 + A * Math.cos(th) * bankK, fa); w.fold = Math.max(b.fold, lerp(0.07, 0.03 + lerp(0.34, 0.46, slow) * us, fa)); w.twist = lerp(0.04, -0.16 * ds + 0.40 * us, fa) + slow * 0.25; w.sweep = lerp(0.05, -0.20 * ds + 0.22 * us, fa) - slow * 0.15; w.wrist = fa * 0.30 * Math.sin(th - 1.1) * (0.6 + 0.4 * us); }
    } else { b.flapAmp = 0; let fl = [0, 0], fo = [b.fold, b.fold], tw = [0, 0];
      if (b.st === 'loaf' && b.sub === 'sun') { const s = b.side > 0 ? 1 : 0; fo[s] = Math.min(b.fold, 0.12); fl[s] = 0.5; }
      if (b.st === 'loaf' && b.sub === 'preen' && b.pv < 0.6) { const s = b.side > 0 ? 0 : 1; fo[s] = Math.min(b.fold, 0.78); fl[s] = 0.25; }
      if (b.st === 'bathe') { const k = 0.5 + 0.5 * Math.sin(b.t * 22); fo[0] = fo[1] = 0.55 + 0.3 * k; fl[0] = fl[1] = 0.3 * k; }
      if (b.landT > 0) { fo[0] = fo[1] = Math.min(fo[0], 1 - 0.5 * (b.landT / 0.5)); }
      for (let s = 0; s < 2; s++) { const w = p.wing[s]; w.fold = damp(w.fold, fo[s], 12, dt); w.flap = damp(w.flap, fl[s], 12, dt); w.twist = damp(w.twist, 0, 12, dt); w.sweep = damp(w.sweep, 0, 12, dt); w.wrist = damp(w.wrist, 0, 12, dt); } }
    // ---- legs (targets in model space)
    b.legOut = damp(b.legOut, legMode === 'reach' ? 1 : (legMode === 'trail' ? 0.5 : 0), 9, dt);
    for (let s = 0; s < 2; s++) { const L = p.leg[s], sx = s === 0 ? 1 : -1;
      if (b.air) { const k = b.legOut, pc = Math.cos(p.pitch), ps = Math.sin(p.pitch); // tucked (body frame) -> reach forward/down for landing
        const ty = lerp(-0.040, -0.074, k), tz = lerp(-0.046, 0.022, k), bx = sx * lerp(0.020, 0.026, k); L.x = bx; L.y = ty * pc + tz * ps; L.z = -ty * ps + tz * pc; if (k > 0.75) { L.y = lerp(L.y, -0.108, (k - 0.75) * 4); L.z = lerp(L.z, 0.02, (k - 0.75) * 4); } L.curl = lerp(1.1, -0.25, k); }
      else { const f = s === 0 ? g.L : g.R, m = toModel(f.x, f.y + 0.0045, f.z, this._fm || (this._fm = [0, 0, 0])); L.x = m[0]; L.y = m[1]; L.z = m[2]; const sw = (walking && g.side === s) ? g.lift : 0; L.curl = sw * 0.5; if (b.st === 'loaf' && (b.sub === 'sleep' || b.sub === 'sun') || b.st === 'bathe') { L.y = Math.max(L.y, -b.bodyH + 0.004); } }
      L.yaw = 0; }
  }
}
