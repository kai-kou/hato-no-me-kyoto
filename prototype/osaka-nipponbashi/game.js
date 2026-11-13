import * as THREE from './three.module.js';

const $ = id => document.getElementById(id);
window.addEventListener('error', e => { $('err').textContent = 'エラー: ' + e.message; });
let seed = 20261112;
const srnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const sr = (a, b) => a + (b - a) * srnd();
const R = Math.random, rr = (a, b) => a + (b - a) * R();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

// ================= 都市骨格 (原点: 北緯34.6620 東経135.5062, x=東 z=南, 単位m) =================
const Wd = { x0: -366, x1: 420, z0: -800, z1: 832 };
const NS = [
  { x: -330, w: 12, n: ['なんば南海通', 'パークス通'] },
  { x: -250, w: 6, n: ['千日前道具屋筋', '難波中の裏通り'], ped: [1, 0] },
  { x: -175, w: 6, n: ['難波千日前の路地', '日本橋西の路地'] },
  { x: -100, w: 7, n: ['千日前の裏通り', 'オタロード'], ped: [0, 1] },
  { x: 0, w: 22, n: ['堺筋', '堺筋・でんでんタウン'] },
  { x: 92, w: 6, n: ['黒門市場', '日本橋東の裏通り'], ped: [1, 0] },
  { x: 165, w: 6, n: ['日本橋の路地', '日本橋東の路地'] },
  { x: 235, w: 6, n: ['高津の路地', '日本橋東の路地'] },
  { x: 310, w: 6, n: ['高津の路地', '下寺の路地'] },
  { x: 400, w: 18, n: ['松屋町筋', '松屋町筋'] },
];
const EW = [-700, -640, -577, -505, -433, -361, -289, -217, -150, -89, -20, 50, 120, 190, 260, 330, 400, 470, 540, 610, 680, 788].map(z => ({ z, w: 6, n: '' }));
const setEW = (z, o) => Object.assign(EW.find(e => e.z === z), o);
setEW(-700, { w: 8, n: '道頓堀', ped: 1 }); setEW(-577, { w: 30, n: '千日前通・阪神高速の高架下' }); setEW(-433, { n: '黒門市場の東西筋' });
setEW(-89, { w: 14, n: 'なんさん通り' }); setEW(788, { w: 16, n: '恵美須町交差点の通り' });
const RIVER = { z: -743, w: 30, river: 1 };
const PARKS = [[128, 155, '日本橋公園'], [272, -325, '高津の小公園'], [-137, 575, '日本橋西の児童遊園']];
const LMS = [[-50, 50, '高島屋東別館', 32, 2], [272, -541, '国立文楽劇場', 26, 3], [-212, -608, 'ビックカメラなんば店', 42, 1], [-290, -325, 'なんばグランド花月', 30, 2], [-50, 225, 'Joshinスーパーキッズランド', 34, 2], [200, 365, 'タワーマンション', 118, 14], [355, -120, 'タワーマンション', 96, 14]];
const FAR = [[-400, 40, 40, 40, 149, 0x9fb0bd], [-450, -255, 46, 46, 147, 0xc9c2b4], [9, 1054, 16, 16, 103, 0xb9b3a6], [705, 1797, 72, 60, 300, 0xa9c0d2]];
const PAL = [0xb9b4a8, 0xd8d2c4, 0x9a9a98, 0xc9c0b0, 0x8f8a84, 0xe4e0d8, 0xa89684, 0x7d8690, 0xbfae98, 0x6f6a66];
const B = [], pads = [], parks = [];
{
  const xs = [{ x: Wd.x0, w: 0 }, ...NS, { x: Wd.x1, w: 0 }];
  const zs = [{ z: Wd.z0, w: 0 }, RIVER, ...EW, { z: Wd.z1, w: 0 }];
  const sw = l => (l.w >= 14 && !l.river) ? 3.5 : 0;
  const inside = (p, x0, x1, z0, z1) => p[0] > x0 && p[0] < x1 && p[1] > z0 && p[1] < z1;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const a = xs[i], b = xs[i + 1], c = zs[j], d = zs[j + 1];
    const x0 = a.x + a.w / 2, x1 = b.x - b.w / 2, z0 = c.z + c.w / 2, z1 = d.z - d.w / 2;
    if (x1 - x0 < 6 || z1 - z0 < 6) continue;
    pads.push([x0 - sw(a), x1 + sw(b), z0 - sw(c), z1 + sw(d)]);
    const pk = PARKS.find(p => inside(p, x0, x1, z0, z1));
    if (pk) { parks.push({ x0, x1, z0, z1, n: pk[2], cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 }); continue; }
    const lm = LMS.find(p => inside(p, x0, x1, z0, z1));
    if (lm) { const m = lm[4]; B.push({ x0: x0 + m, x1: x1 - m, z0: z0 + m, z1: z1 - m, h: lm[3], c: 0xcfc8b8, n: lm[2] }); continue; }
    const D = z1 - z0;
    const rows = D < 28 ? [[z0, z1, c.w >= 14 || d.w >= 14]] : [[z0, z0 + D * sr(0.4, 0.5), c.w >= 14], [z1 - D * sr(0.4, 0.5), z1, d.w >= 14]];
    for (const [ra, rb, wide] of rows) {
      let cx = x0;
      while (cx < x1 - 4) {
        let w = sr(6, 15); if (x1 - (cx + w) < 5) w = x1 - cx;
        const edge = (cx === x0 && a.w >= 14) || (cx + w >= x1 - 0.01 && b.w >= 14);
        if (srnd() > 0.05) {
          let fl = (wide || edge) ? 5 + Math.floor(srnd() * 8) : 2 + Math.floor(srnd() * srnd() * 7);
          if (w > 10 && srnd() < 0.015) fl = 22 + Math.floor(srnd() * 14);
          B.push({ x0: cx + 0.15, x1: cx + w - 0.15, z0: ra, z1: rb, h: fl * 3.1 + 1, c: PAL[Math.floor(srnd() * PAL.length)] });
        }
        cx += w;
      }
    }
  }
  B.push({ x0: Wd.x0, x1: Wd.x1, z0: -586, z1: -568, h: 12.6, deck: 1, n: '阪神高速1号環状線' });
}
const GC = 16, GW = Math.ceil((Wd.x1 - Wd.x0) / GC), GH = Math.ceil((Wd.z1 - Wd.z0) / GC);
const grid = Array.from({ length: GW * GH }, () => []);
const gi = (v, o) => Math.floor((v - o) / GC);
B.forEach((b, i) => { for (let gx = Math.max(0, gi(b.x0, Wd.x0)); gx <= Math.min(GW - 1, gi(b.x1, Wd.x0)); gx++) for (let gz = Math.max(0, gi(b.z0, Wd.z0)); gz <= Math.min(GH - 1, gi(b.z1, Wd.z0)); gz++) grid[gx + gz * GW].push(i); });
function bAt(x, z) {
  if (x < Wd.x0 || x >= Wd.x1 || z < Wd.z0 || z >= Wd.z1) return null;
  const g = grid[gi(x, Wd.x0) + gi(z, Wd.z0) * GW];
  for (let k = 0; k < g.length; k++) { const b = B[g[k]]; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b; }
  return null;
}
const roofAt = (x, z) => { const b = bAt(x, z); return b ? b.h : 0; };
const inWorld = (x, z) => x > Wd.x0 + 3 && x < Wd.x1 - 3 && z > Wd.z0 + 3 && z < Wd.z1 - 3;
const isWater = z => Math.abs(z - RIVER.z) < RIVER.w / 2;
const blocked = (x, z) => !inWorld(x, z) || isWater(z) || !!bAt(x, z);
function placeName(x, z) {
  const b = bAt(x, z); if (b && b.n) return b.n;
  for (const p of parks) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.n;
  if (isWater(z)) return '道頓堀川';
  let best = '', bd = 1e9;
  for (const l of NS) { const d = Math.abs(x - l.x) - l.w / 2; if (d < bd) { bd = d; best = l.n[z < -89 ? 0 : 1]; } }
  for (const l of EW) { const d = Math.abs(z - l.z) - l.w / 2; if (d < bd && l.n) { bd = d; best = l.n; } }
  const area = z < -728 ? '宗右衛門町' : z < -577 ? (x < 0 ? '千日前' : '日本橋1丁目') : z < -89 ? (x < -100 ? '難波千日前' : '日本橋2丁目') : x < -175 ? '難波中' : x < 0 ? ('日本橋' + (z < 190 ? 3 : z < 470 ? 4 : 5) + '丁目') : ('日本橋東' + (z < 190 ? 1 : z < 470 ? 2 : 3) + '丁目');
  return bd < 2 ? best : area + (b ? 'のビル屋上' : '');
}

// ================= three.js =================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
const skyC = new THREE.Color(0x8fc1e8);
scene.background = skyC; scene.fog = new THREE.Fog(0x8fc1e8, 140, 2100);
const cam = new THREE.PerspectiveCamera(72, 1, 0.012, 4000);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b6558, 1.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); scene.add(sun);

function quadGeo(build) {
  const pos = [], nor = [], col = [], uv = [], idx = [];
  const quad = (p, n, u, c) => { const s = pos.length / 3; for (let k = 0; k < 12; k++) pos.push(p[k]); for (let k = 0; k < 4; k++) { nor.push(n[0], n[1], n[2]); col.push(c.r, c.g, c.b); } for (let k = 0; k < 8; k++) uv.push(u[k]); idx.push(s, s + 1, s + 2, s, s + 2, s + 3); };
  build(quad);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
const U0 = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
const flat = (quad, x0, x1, z0, z1, y, c) => quad([x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0], [0, 1, 0], U0, c);
function winTex(lit) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = lit ? '#000' : '#fff'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (lit) { if (srnd() < 0.42) { c.fillStyle = srnd() < 0.7 ? '#ffd58a' : '#cfe6ff'; c.fillRect(i * 64 + 10, j * 64 + 14, 44, 34); } }
    else { c.fillStyle = '#3c4958'; c.fillRect(i * 64 + 10, j * 64 + 14, 44, 34); c.fillStyle = '#5c6d80'; c.fillRect(i * 64 + 10, j * 64 + 14, 44, 9); c.fillStyle = '#d9d9d9'; c.fillRect(i * 64 + 31, j * 64 + 14, 2, 34); }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const bldMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true, map: winTex(false), emissive: 0xffffff, emissiveMap: winTex(true), emissiveIntensity: 0 });
{
  const c = new THREE.Color(), rc = new THREE.Color();
  const box = (quad, b, tex) => {
    const { x0, x1, z0, z1, h } = b; const y0 = b.y0 || 0, U = tex ? (x1 - x0) / 10 : 0.01, U2 = tex ? (z1 - z0) / 10 : 0.01, V = tex ? (h - y0) / 12.4 : 0.01, u0 = tex ? 0 : 0.01;
    c.set(b.c); rc.copy(c).multiplyScalar(0.55);
    flat(quad, x0, x1, z0, z1, h, rc);
    quad([x0, y0, z1, x1, y0, z1, x1, h, z1, x0, h, z1], [0, 0, 1], [u0, u0, U, u0, U, V, u0, V], c);
    quad([x1, y0, z0, x0, y0, z0, x0, h, z0, x1, h, z0], [0, 0, -1], [u0, u0, U, u0, U, V, u0, V], c);
    quad([x1, y0, z1, x1, y0, z0, x1, h, z0, x1, h, z1], [1, 0, 0], [u0, u0, U2, u0, U2, V, u0, V], c);
    quad([x0, y0, z0, x0, y0, z1, x0, h, z1, x0, h, z0], [-1, 0, 0], [u0, u0, U2, u0, U2, V, u0, V], c);
    if (y0 > 0) quad([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], [0, -1, 0], U0, rc);
  };
  scene.add(new THREE.Mesh(quadGeo(quad => {
    for (const b of B) if (!b.deck) box(quad, b, true);
    for (const f of FAR) box(quad, { x0: f[0] - f[2] / 2, x1: f[0] + f[2] / 2, z0: f[1] - f[3] / 2, z1: f[1] + f[3] / 2, h: f[4], c: f[5] }, true);
  }), bldMat));
  // 高架・橋脚・地面レイヤ
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(quadGeo(quad => {
    box(quad, { x0: Wd.x0 - 300, x1: Wd.x1 + 300, z0: -586, z1: -568, y0: 11.4, h: 12.6, c: 0x8d8f92 }, false);
    for (let x = -340; x <= 400; x += 40) { box(quad, { x0: x - 1.2, x1: x + 1.2, z0: -578.2, z1: -575.8, h: 10.2, c: 0x9a9b9c }, false); box(quad, { x0: x - 1.3, x1: x + 1.3, z0: -588, z1: -566, y0: 10.2, h: 11.4, c: 0x9a9b9c }, false); }
  }), plain));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 7000, 100, 116), new THREE.MeshLambertMaterial({ color: 0x3a3c40, side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const layer = (off, build) => { const m = new THREE.Mesh(quadGeo(build), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -off * 10 })); scene.add(m); };
  layer(1, quad => { c.set(0x8b8a84); for (const p of pads) flat(quad, p[0], p[1], p[2], p[3], 0.01, c); });
  layer(2, quad => {
    c.set(0x2c5a69); flat(quad, Wd.x0 - 400, Wd.x1 + 400, RIVER.z - 15, RIVER.z + 15, 0.02, c);
    c.set(0x55585c); for (const l of NS) flat(quad, l.x - l.w / 2 - 2, l.x + l.w / 2 + 2, RIVER.z - 15, RIVER.z + 15, 0.03, c);
    for (const p of parks) { c.set(0x55803f); flat(quad, p.x0, p.x1, p.z0, p.z1, 0.02, c); c.set(0xb7a481); flat(quad, p.cx - 7, p.cx + 7, p.cz - 6, p.cz + 6, 0.03, c); c.set(0x3f86a8); flat(quad, p.cx + 3, p.cx + 4.4, p.cz + 2, p.cz + 3.2, 0.04, c); }
    c.set(0x9a6f5c); for (const l of NS) if (l.ped) { if (l.ped[0]) flat(quad, l.x - l.w / 2, l.x + l.w / 2, -697, -96, 0.02, c); if (l.ped[1]) flat(quad, l.x - l.w / 2, l.x + l.w / 2, -82, 780, 0.02, c); }
    flat(quad, Wd.x0, Wd.x1, -704, -696, 0.02, c);
    c.set(0xd8d8d2); for (const x of [-3.6, 0, 3.6, 396.5, 403.5]) for (let z = Wd.z0; z < Wd.z1; z += 10) flat(quad, x - 0.08, x + 0.08, z, z + 5, 0.03, c);
  });
}
// 樹木
const trees = [];
{
  for (const p of parks) for (let k = 0; k < 14; k++) { const x = sr(p.x0 + 2, p.x1 - 2), z = sr(p.z0 + 2, p.z1 - 2); if (Math.abs(x - p.cx) < 8 && Math.abs(z - p.cz) < 7) continue; trees.push([x, z, sr(0.8, 1.3)]); }
  const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 3, 6), new THREE.MeshLambertMaterial({ color: 0x5b4a3a }), trees.length);
  const cr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshLambertMaterial({ color: 0x4d7a3c, flatShading: true }), trees.length);
  const o = new THREE.Object3D();
  trees.forEach((t, i) => { o.position.set(t[0], 1.5, t[1]); o.scale.setScalar(1); o.updateMatrix(); tr.setMatrixAt(i, o.matrix); o.position.set(t[0], 4.2 * t[2], t[1]); o.scale.set(t[2], t[2] * 0.85, t[2]); o.updateMatrix(); cr.setMatrixAt(i, o.matrix); });
  scene.add(tr, cr);
}

// ================= ハトのモデル =================
function merge(parts) {
  const pos = [], nor = [], col = [], c = new THREE.Color(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const [g0, m, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; nm.getNormalMatrix(m); c.set(hex);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const M = (sx, sy, sz, px, py, pz, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
const sph = new THREE.SphereGeometry(1, 14, 10), bx = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 8), cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
const MORPHS = [
  { n: '灰二引(野生型)', body: 0x9aa3ad, wing: 0xb9c0c8, head: 0x5f6b78, tail: 0x7d8792, p: 0.28 },
  { n: '灰胡麻', body: 0x7c858f, wing: 0x6d7680, head: 0x4f5964, tail: 0x666f79, p: 0.32 },
  { n: '黒胡麻', body: 0x4a4f57, wing: 0x3d4248, head: 0x33373d, tail: 0x3a3e44, p: 0.22 },
  { n: '栗', body: 0xb08a78, wing: 0xa77b66, head: 0x8c5f50, tail: 0xc9b3a6, p: 0.07 },
  { n: 'モザイク(白斑)', body: 0xd9d9d6, wing: 0x8a929b, head: 0xcfcfcc, tail: 0xdedede, p: 0.11 },
];
for (const m of MORPHS) {
  m.torso = merge([
    [sph, M(0.055, 0.058, 0.115, 0, 0.115, 0, -0.14), m.body],
    [sph, M(0.04, 0.05, 0.043, 0, 0.165, 0.082), 0x3f8a66], [sph, M(0.041, 0.03, 0.044, 0, 0.143, 0.09), 0x7a5a9c],
    [bx, M(0.075, 0.012, 0.13, 0, 0.1, -0.155, 0.16), m.tail], [bx, M(0.077, 0.013, 0.03, 0, 0.089, -0.213, 0.16), 0x23262b],
    [cyl, M(0.006, 0.062, 0.006, -0.022, 0.032, 0), 0xb8473a], [cyl, M(0.006, 0.062, 0.006, 0.022, 0.032, 0), 0xb8473a],
    [bx, M(0.03, 0.006, 0.045, -0.022, 0.003, 0.012), 0xb8473a], [bx, M(0.03, 0.006, 0.045, 0.022, 0.003, 0.012), 0xb8473a],
  ]);
  m.headG = merge([
    [sph, M(0.028, 0.03, 0.033, 0, 0, 0), m.head], [cone, M(0.007, 0.03, 0.007, 0, -0.004, 0.042, Math.PI / 2), 0x2b2b2b], [sph, M(0.009, 0.006, 0.009, 0, 0.005, 0.03), 0xeeeeee],
    [sph, M(0.0068, 0.0068, 0.0068, -0.0245, 0.004, 0.012), 0xe07a1f], [sph, M(0.0068, 0.0068, 0.0068, 0.0245, 0.004, 0.012), 0xe07a1f],
    [sph, M(0.0035, 0.0035, 0.0035, -0.0295, 0.004, 0.0125), 0x111111], [sph, M(0.0035, 0.0035, 0.0035, 0.0295, 0.004, 0.0125), 0x111111],
  ]);
  m.wingL = merge([[bx, M(0.3, 0.012, 0.14, -0.15, 0, -0.02), m.wing], [bx, M(0.3, 0.013, 0.02, -0.15, 0, -0.075), 0x2a2d32]]);
  m.wingR = merge([[bx, M(0.3, 0.012, 0.14, 0.15, 0, -0.02), m.wing], [bx, M(0.3, 0.013, 0.02, 0.15, 0, -0.075), 0x2a2d32]]);
}
const birdMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const shGeo = new THREE.CircleGeometry(0.1, 12), shMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -30 });
function birdMesh(m) {
  const g = new THREE.Group(), torso = new THREE.Mesh(m.torso, birdMat), head = new THREE.Mesh(m.headG, birdMat), wl = new THREE.Mesh(m.wingL, birdMat), wr = new THREE.Mesh(m.wingR, birdMat), sh = new THREE.Mesh(shGeo, shMat);
  wl.position.set(-0.05, 0.14, 0); wr.position.set(0.05, 0.14, 0); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.006;
  g.add(torso, head, wl, wr, sh); scene.add(g); return { g, head, wl, wr, sh };
}

// ================= 環境: 餌・水・採餌サイト =================
const SITES = [
  { x: parks[0].cx, z: parks[0].cz, r: 9, n: parks[0].n }, { x: parks[1].cx, z: parks[1].cz, r: 9, n: parks[1].n }, { x: parks[2].cx, z: parks[2].cz, r: 9, n: parks[2].n },
  { x: 92, z: -400, r: 12, n: '黒門市場' }, { x: 92, z: -255, r: 12, n: '黒門市場' }, { x: -100, z: 85, r: 14, n: 'オタロード' }, { x: -100, z: 300, r: 14, n: 'オタロード' },
  { x: -250, z: -470, r: 12, n: '千日前道具屋筋' }, { x: -140, z: -700, r: 14, n: '道頓堀' }, { x: 9, z: 430, r: 6, n: 'でんでんタウンの歩道' },
];
const WATER = [...parks.map(p => ({ x: p.cx + 3.7, z: p.cz + 3.4 })), { x: -140, z: RIVER.z + 16.2 }, { x: 60, z: RIVER.z + 16.2 }];
const food = []; let foodDirty = true;
function groundNear(s, r) { for (let k = 0; k < 30; k++) { const x = s.x + rr(-r, r), z = s.z + rr(-r, r); if (!blocked(x, z)) return [x, z]; } return [s.x, s.z]; }
function dropFood(x, z, n, r) { for (let k = 0; k < n; k++) { const fx = x + rr(-r, r), fz = z + rr(-r, r); if (!blocked(fx, fz)) food.push({ x: fx, z: fz }); } while (food.length > 380) food.shift().dead = true; foodDirty = true; }
for (const s of SITES) dropFood(s.x, s.z, 26, s.r);
const foodMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 6, 4), new THREE.MeshLambertMaterial({ color: 0xe2c284 }), 400); scene.add(foodMesh);
const dummy = new THREE.Object3D();
function perchNear(x, z) {
  for (let k = 0; k < 60; k++) {
    const b = bAt(x + rr(-70, 70), z + rr(-70, 70)); if (!b || b.deck || b.h < 7 || b.h > 48) continue;
    const s = (R() * 4) | 0, px = s < 2 ? rr(b.x0 + 0.3, b.x1 - 0.3) : (s === 2 ? b.x0 + 0.25 : b.x1 - 0.25), pz = s >= 2 ? rr(b.z0 + 0.3, b.z1 - 0.3) : (s === 0 ? b.z0 + 0.25 : b.z1 - 0.25);
    return { x: px, y: b.h, z: pz };
  }
  return { x, y: 0, z };
}

// ================= 歩行者 =================
const PN = 96, peds = [];
const PEDL = [...NS, ...EW, NS[4], NS[4], NS[4], NS[3], NS[3], NS[3], NS[5], NS[5], NS[1], EW[0], EW[0]];
const pedOff = l => { const s = R() < 0.5 ? -1 : 1; return l.w >= 14 ? s * rr(l.w / 2 - 3.1, l.w / 2 - 0.7) : rr(-l.w / 2 + 0.7, l.w / 2 - 0.7); };
for (let i = 0; i < PN; i++) {
  const l = PEDL[(R() * PEDL.length) | 0], ax = 'x' in l ? 0 : 1, run = R() < 0.08;
  peds.push({ l, ax, pos: ax ? rr(Wd.x0 + 10, Wd.x1 - 10) : rr(Wd.z0 + 10, Wd.z1 - 10), dir: R() < 0.5 ? 1 : -1, off: pedOff(l), run, sp: run ? rr(2.6, 3.4) : rr(0.95, 1.5), ph: R() * TAU, sc: run && R() < 0.6 ? 0.68 : rr(0.92, 1.08), x: 0, z: 0, h: 0 });
}
parks.forEach(p => peds.push({ still: 1, x: p.cx - 5, z: p.cz + 4, h: Math.PI / 2, sc: 1, ph: 0, sp: 0 }));
const pedT = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8), new THREE.MeshLambertMaterial(), peds.length);
const pedH = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9b08c }), peds.length);
const legG = new THREE.BoxGeometry(0.13, 0.84, 0.15); legG.translate(0, -0.42, 0);
const legMat = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
const pedL = new THREE.InstancedMesh(legG, legMat, peds.length), pedR = new THREE.InstancedMesh(legG, legMat, peds.length);
const CLO = [0x2f3b52, 0x6b7280, 0xb23a3a, 0xd9d2c0, 0x3c6e57, 0x1f2328, 0xc48a3a, 0x7a5a9c];
peds.forEach((q, i) => pedT.setColorAt(i, new THREE.Color(CLO[(R() * CLO.length) | 0])));
scene.add(pedT, pedH, pedL, pedR);
function pedStep(q, dt) {
  if (q.still) return;
  const old = q.pos; q.pos += q.dir * q.sp * dt; q.ph += dt * q.sp * 4.2;
  const lo = (q.ax ? Wd.x0 : Wd.z0) + 6, hi = (q.ax ? Wd.x1 : Wd.z1) - 6;
  if (q.pos < lo || q.pos > hi) { q.dir *= -1; q.pos = clamp(q.pos, lo, hi); }
  for (const l of (q.ax ? NS : EW)) { const c = q.ax ? l.x : l.z; if ((old - c) * (q.pos - c) < 0 && R() < 0.3) { const here = (q.ax ? q.l.z : q.l.x) + q.off; q.ax = 1 - q.ax; q.l = l; q.pos = here; q.off = pedOff(l); q.dir = R() < 0.5 ? 1 : -1; break; } }
  if (q.ax) { q.x = q.pos; q.z = q.l.z + q.off; q.h = q.dir > 0 ? Math.PI / 2 : -Math.PI / 2; } else { q.x = q.l.x + q.off; q.z = q.pos; q.h = q.dir > 0 ? 0 : Math.PI; }
  if (R() < dt * ((q.l.ped ? 0.05 : 0.012))) dropFood(q.x, q.z, 3, 0.5);
}
function pedDraw() {
  peds.forEach((q, i) => {
    const s = q.sc, cx = Math.cos(q.h) * 0.1 * s, sz = -Math.sin(q.h) * 0.1 * s, sw = q.still ? 0 : Math.sin(q.ph) * 0.55;
    dummy.scale.setScalar(s); dummy.rotation.set(0, q.h, 0);
    dummy.position.set(q.x, 1.2 * s, q.z); dummy.updateMatrix(); pedT.setMatrixAt(i, dummy.matrix);
    dummy.position.set(q.x, 1.68 * s, q.z); dummy.updateMatrix(); pedH.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(sw, q.h, 0, 'YXZ'); dummy.position.set(q.x + cx, 0.84 * s, q.z + sz); dummy.updateMatrix(); pedL.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(-sw, q.h, 0, 'YXZ'); dummy.position.set(q.x - cx, 0.84 * s, q.z - sz); dummy.updateMatrix(); pedR.setMatrixAt(i, dummy.matrix);
  });
  dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
  pedT.instanceMatrix.needsUpdate = pedH.instanceMatrix.needsUpdate = pedL.instanceMatrix.needsUpdate = pedR.instanceMatrix.needsUpdate = true;
}

// ================= 音 =================
let AC = null, master = null, noiseBuf = null, muted = false;
function initAudio() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.6; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; const g = AC.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(master); s.start();
  } catch (e) { AC = null; }
}
function coo(vol) {
  if (!AC || vol < 0.03) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(310, t); o.frequency.linearRampToValueAtTime(400, t + 0.3); o.frequency.linearRampToValueAtTime(290, t + 0.95);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.2, t + 0.1); g.gain.linearRampToValueAtTime(vol * 0.05, t + 0.32); g.gain.linearRampToValueAtTime(vol * 0.26, t + 0.55); g.gain.linearRampToValueAtTime(0.0001, t + 1.0);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.05);
}
function clap(vol, n = 4) {
  if (!AC || vol < 0.03) return;
  for (let i = 0; i < n; i++) { const s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; const g = AC.createGain(), t = AC.currentTime + i * 0.105 + R() * 0.03; g.gain.setValueAtTime(vol * 0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(master); s.start(t, R(), 0.07); }
}
const volAt = (x, z) => clamp(1 - Math.hypot(x - P[focus].x, z - P[focus].z) / 35, 0, 1);

// ================= ハト個体 =================
const N = 54, P = []; let focus = 0;
const DAWN = 6.3, DUSK = 17.0; let tod = 7.2, tScale = 30, paused = false, now = 0;
const roosts = []; for (let x = -340; x <= 400; x += 40) { roosts.push({ x, y: 11.4, z: -587.3 }, { x, y: 11.4, z: -566.7 }); }
function pickMorph() { let r = R(); for (const m of MORPHS) { if ((r -= m.p) < 0) return m; } return MORPHS[0]; }
for (let i = 0; i < N; i++) {
  const m = pickMorph(), ms = birdMesh(m), rs = roosts[(i * 7) % roosts.length];
  const fav = i < 12 ? 0 : (R() * SITES.length) | 0;
  const p = Object.assign(ms, { i, m, male: i % 2 === 0, mate: i ^ 1, x: 0, y: 0, z: 0, h: R() * TAU, v: 0, vy: 0, spd: 0, bank: 0, air: false, b: null, st: 'forage', sub: 'rest', subT: 0, t: 0, think: R() * 0.4, hunger: rr(0.45, 0.9), thirst: rr(0.1, 0.6), home: { x: rs.x + ((i / roosts.length) | 0) * 0.4 - 0.2, y: rs.y, z: rs.z }, fav, site: SITES[fav], lag: rr(0, 0.45), wph: R() * 9, bph: 0, peckT: 0, peckD: 0.3, pause: 0, wt: 0, wh: 0, evade: 0, nf: 0, cd: rr(5, 40), alarmIn: 0, food: null, glide: false, dk: 0, vp: 0 });
  if (i < 12 || R() < 0.6) { const [x, z] = groundNear(p.site, i < 12 ? 4 : p.site.r); p.x = x; p.z = z; }
  else { const pc = perchNear(p.site.x, p.site.z); p.x = pc.x; p.y = pc.y; p.z = pc.z; p.b = pc.y > 0.5 ? bAt(pc.x, pc.z) : null; p.st = 'loaf'; p.hunger = rr(0.1, 0.5); }
  P.push(p);
}
const canStep = (p, x, z) => p.y > 0.5 ? (!!p.b && x > p.b.x0 + 0.15 && x < p.b.x1 - 0.15 && z > p.b.z0 + 0.15 && z < p.b.z1 - 0.15) : !blocked(x, z);
function setFly(p, x, y, z, next, alarm) {
  if (!p.air) clap(volAt(p.x, p.z) * (alarm ? 1 : 0.5), alarm ? 5 : 3);
  p.st = 'fly'; p.t = 0; p.dx = x; p.dy = y; p.dz = z; p.next = next; p.alarm = !!alarm; p.air = true; p.spd = Math.max(p.spd, 2.5); p.vy = 2.5; p.b = null; p.v = 0; p.peckT = 0; p.food = null;
}
function land(p) {
  p.x = p.dx; p.z = p.dz; p.y = p.dy;
  if (p.next === 'return') { const s = p.ret; if (R() < 0.3) { const pc = perchNear(s.x, s.z); setFly(p, pc.x, pc.y, pc.z, 'loaf'); } else { const [x, z] = groundNear(s, 5); setFly(p, x, 0, z, 'forage'); } return; }
  p.air = false; p.vy = 0; p.bank = 0; p.spd = 0; p.st = p.next; p.t = 0; p.sub = 'rest'; p.subT = rr(2, 6); p.b = p.y > 0.5 ? bAt(p.x, p.z) : null; p.h += rr(-0.5, 0.5); p.nf = 0;
}
function flyStep(p, dt) {
  p.t += dt;
  const tx = p.dx - p.x, tz = p.dz - p.z, dH = Math.hypot(tx, tz);
  let want = Math.atan2(tx, tz);
  const fx0 = Math.sin(p.h), fz0 = Math.cos(p.h);
  const r0 = roofAt(p.x, p.z), r1 = roofAt(p.x + fx0 * 6, p.z + fz0 * 6), r2 = roofAt(p.x + fx0 * 17, p.z + fz0 * 17);
  if (Math.max(r1, r2) > p.y + 14 && dH > 25) want = p.h + 1.2;
  const rate = dH < 4 ? 9 : 2.3, turn = clamp(angDiff(p.h, want), -rate * dt, rate * dt);
  p.h += turn; p.bank = lerp(p.bank, clamp(turn / dt * 0.33, -0.9, 0.9), 0.1);
  const fx = Math.sin(p.h), fz = Math.cos(p.h);
  let spd = dH > 14 ? 13.5 : Math.max(2.2, dH * 0.95), ty;
  if (dH < 9) ty = Math.max(p.dy + dH * 0.33, r0 > p.dy + 0.4 ? r0 + 0.4 : p.dy);
  else { ty = Math.max(r0, r1, r2) + 3.5; ty = Math.max(ty, p.dy + Math.min(dH * 0.3, 26)); if (p.alarm) ty = Math.max(ty, p.dy); if (r1 > p.y + 0.3) spd = Math.min(spd, 2.5); }
  p.spd = lerp(p.spd, spd, Math.min(1, dt * 2)); p.vy = lerp(p.vy, clamp((ty - p.y) * 2.2, -5, 6.5), Math.min(1, dt * 4));
  p.x += fx * p.spd * dt; p.z += fz * p.spd * dt; p.y = Math.max(p.y + p.vy * dt, 0.02);
  p.glide = p.vy < -2.2 && dH > 9;
  if ((dH < 0.5 && Math.abs(p.y - p.dy) < 0.6) || p.t > 150) land(p);
}
let lastFlush = -99, flushN = 0, flushX = 0, flushZ = 0;
function alarmAt(x, z, r, big) {
  const wx = clamp(x + rr(-60, 60), Wd.x0 + 30, Wd.x1 - 30), wz = clamp(z + rr(-60, 60), Wd.z0 + 30, Wd.z1 - 30), wy = Math.max(roofAt(wx, wz), 12) + rr(14, 24);
  let n = 0;
  for (const q of P) { if (q.air || q.st === 'manual' || q.alarmIn > 0 || dist2(q.x, q.z, x, z) > r * r) continue; if (R() < 0.88) { q.alarmIn = rr(0.02, big ? 0.9 : 0.4); q.aw = [wx + rr(-3, 3), wy + rr(-2, 2), wz + rr(-3, 3)]; n++; } }
  if (n >= 5) { lastFlush = now; flushN = n; flushX = x; flushZ = z; }
}
function chooseSite(p) {
  if (R() < 0.45) return SITES[p.fav];
  const m = P[p.mate]; if (m && m.st === 'forage' && R() < 0.5) return m.site;
  let best = null, bn = 0; for (const s of SITES) { let n = 0; for (const q of P) if (q.site === s && q.st === 'forage') n++; if (n > bn) { bn = n; best = s; } }
  return best && R() < 0.6 ? best : SITES[(R() * SITES.length) | 0];
}
function goForage(p, s) { p.site = s; const [x, z] = groundNear(s, s.r * 0.6); setFly(p, x, 0, z, 'forage'); }
function startPeck(p, f) { p.peckT = p.peckD = 0.3; p.v = 0; if (f && !f.dead) { f.dead = true; const k = food.indexOf(f); if (k >= 0) food.splice(k, 1); foodDirty = true; p.hunger = Math.max(0, p.hunger - 0.045); p.nf = 0; } p.food = null; }
function thinkGround(p, dtT) {
  const night = tod < DAWN || tod > DUSK;
  if (night) { if (p.st !== 'roost') setFly(p, p.home.x, p.home.y, p.home.z, 'roost'); return; }
  if (p.st === 'roost') { if (tod > DAWN + p.lag) goForage(p, chooseSite(p)); return; }
  // 人への反応
  if (p.y < 0.5) { let nd = 1e9, np = null; for (const q of peds) { const d = dist2(p.x, p.z, q.x, q.z); if (d < nd) { nd = d; np = q; } }
    if (np && nd < (np.run ? 14 : 0.75)) { if (np.run || nd < 0.16) { p.ret = p.site; alarmAt(p.x, p.z, 5.5); return; } p.wh = Math.atan2(p.x - np.x, p.z - np.z); p.wt = 1.2; p.evade = 0.9; p.food = null; p.pause = 0; } }
  if (p.st === 'court' || p.st === 'drink') return;
  if (p.thirst > 0.8) { let w = WATER[0], wd = 1e12; for (const k of WATER) { const d = dist2(p.x, p.z, k.x, k.z); if (d < wd) { wd = d; w = k; } } setFly(p, w.x + rr(-0.4, 0.4), 0, w.z + rr(0, 0.5), 'drink'); return; }
  if (p.male && p.cd <= 0 && R() < 0.12) { for (const q of P) if (!q.male && !q.air && (q.st === 'loaf' || q.st === 'forage') && Math.abs(q.y - p.y) < 0.2 && dist2(p.x, p.z, q.x, q.z) < 6) { p.prev = p.st; p.st = 'court'; p.tg = q; p.t = 0; p.cd = rr(35, 70); p.cdir = R() < 0.5 ? 1 : -1; p.cooT = 0; q.pause = 1.5; return; } p.cd = 4; }
  if (p.st === 'forage') {
    if (p.hunger < 0.1) { const pc = perchNear(p.x, p.z); setFly(p, pc.x, pc.y, pc.z, 'loaf'); return; }
    let best = null, bd = 49; for (const f of food) { const d = dist2(p.x, p.z, f.x, f.z); if (d < bd) { bd = d; best = f; } }
    p.food = best;
    if (!best) { p.nf += dtT; if (p.nf > 14) { p.nf = 0; let s = chooseSite(p); if (s === p.site) s = SITES[(R() * SITES.length) | 0]; goForage(p, s); } }
  } else if (p.st === 'loaf') {
    if (p.hunger > 0.55) { const s = chooseSite(p); for (const q of P) if (q !== p && q.st === 'loaf' && q.hunger > 0.3 && dist2(p.x, p.z, q.x, q.z) < 64 && Math.abs(q.y - p.y) < 3) goForage(q, s); goForage(p, s); }
  }
}
function groundStep(p, dt) {
  p.t += dt;
  if (p.peckT > 0) { p.v = 0; return; }
  if (p.st === 'forage') {
    if (p.pause > 0) { p.pause -= dt; p.v = 0; return; }
    let want, v;
    if (p.food && !p.food.dead) { const ddx = p.food.x - p.x, ddz = p.food.z - p.z, d = Math.hypot(ddx, ddz); want = Math.atan2(ddx, ddz); v = d > 1.6 ? 0.62 : 0.36; if (d < 0.07) { startPeck(p, p.food); return; } }
    else { p.wt -= dt; if (p.wt <= 0) { p.wt = rr(1, 3.2); p.wh = p.h + rr(-1.4, 1.4); if (R() < 0.3) p.pause = rr(0.4, 1.5); else if (R() < 0.3) { startPeck(p, null); return; } } want = p.wh; v = 0.3; }
    if (p.evade > 0) { p.evade -= dt; v = 0.85; want = p.wh; }
    p.h += clamp(angDiff(p.h, want), -5 * dt, 5 * dt);
    const nx = p.x + Math.sin(p.h) * v * dt, nz = p.z + Math.cos(p.h) * v * dt;
    if (canStep(p, nx, nz)) { p.x = nx; p.z = nz; p.v = v; } else { p.wh = p.h + Math.PI * rr(0.6, 1.4); p.wt = 1; p.food = null; p.v = 0; }
  } else if (p.st === 'loaf') {
    p.v = 0; p.subT -= dt;
    if (p.subT <= 0) { const sunny = tod > 9.5 && tod < 14.5, r = R(); p.sub = r < 0.42 ? 'preen' : (r < 0.62 && sunny ? 'sun' : 'rest'); p.subT = rr(6, 16); p.side = R() < 0.5 ? 1 : -1; }
  } else if (p.st === 'court') {
    const q = p.tg; if (p.t > 11 || q.air || q.st === 'fly') { p.st = p.prev || 'forage'; p.t = 0; return; }
    const d = Math.hypot(p.x - q.x, p.z - q.z); let nx, nz;
    if (d > 0.45) { const a = Math.atan2(q.x - p.x, q.z - p.z); nx = p.x + Math.sin(a) * 0.5 * dt; nz = p.z + Math.cos(a) * 0.5 * dt; }
    else { const a = Math.atan2(p.x - q.x, p.z - q.z) + dt * 1.7 * p.cdir; nx = q.x + Math.sin(a) * 0.32; nz = q.z + Math.cos(a) * 0.32; }
    if (canStep(p, nx, nz)) { p.x = nx; p.z = nz; p.v = 0.28; } else p.v = 0;
    p.h += clamp(angDiff(p.h, Math.atan2(q.x - p.x, q.z - p.z)), -6 * dt, 6 * dt);
    p.cooT -= dt; if (p.cooT <= 0) { p.cooT = 2.1; coo(volAt(p.x, p.z)); }
  } else if (p.st === 'drink') {
    p.v = 0; p.dk = clamp(Math.min(p.t * 3, (3.6 - p.t) * 3), 0, 1); if (p.t > 3.6) { p.thirst = 0; p.dk = 0; p.st = 'forage'; p.t = 0; }
  } else p.v = 0;
}
const keys = new Set();
function manualStep(p, dt) {
  const turn = ((keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0) - ((keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0), fwd = keys.has('KeyW') || keys.has('ArrowUp');
  p.h += turn * (p.air ? 1.5 : 2.6) * dt; p.t += dt;
  const fx = Math.sin(p.h), fz = Math.cos(p.h);
  if (!p.air) {
    const v = p.peckT > 0 ? 0 : fwd ? (keys.has('ShiftLeft') ? 0.85 : 0.38) : 0, nx = p.x + fx * v * dt, nz = p.z + fz * v * dt;
    if (v && canStep(p, nx, nz)) { p.x = nx; p.z = nz; p.v = v; } else p.v = 0;
    if (keys.has('Space')) { p.air = true; p.vy = 3.4; p.spd = 2; p.t = 0; p.b = null; clap(0.6, 3); }
    if (keys.has('KeyE') && p.peckT <= 0) { let best = null, bd = 0.09; for (const f of food) { const d = dist2(p.x + fx * 0.12, p.z + fz * 0.12, f.x, f.z); if (d < bd) { bd = d; best = f; } } startPeck(p, best); }
  } else {
    p.spd = lerp(p.spd, fwd ? 12.5 : 3.2, Math.min(1, dt * 1.4));
    p.vy = lerp(p.vy, keys.has('Space') ? 4.2 : (keys.has('KeyC') || keys.has('ShiftLeft')) ? -5.5 : -1.1, Math.min(1, dt * 3));
    const nx = p.x + fx * p.spd * dt, nz = p.z + fz * p.spd * dt;
    if (inWorld(nx, nz) && roofAt(nx, nz) <= p.y + 0.3) { p.x = nx; p.z = nz; } else p.spd = 0.4;
    p.y += p.vy * dt; p.bank = lerp(p.bank, turn * 0.55, Math.min(1, dt * 4)); p.glide = !keys.has('Space') && p.vy < -0.5 && fwd;
    const fl = isWater(p.z) ? 0.02 : roofAt(p.x, p.z);
    if (p.y <= fl && p.vy <= 0) { p.y = fl; p.air = false; p.vy = 0; p.bank = 0; p.spd = 0; p.b = fl > 0.5 ? bAt(p.x, p.z) : null; }
  }
}
function pose(p, dt) {
  let pitch = 0, roll = 0, hy = 0.215, hz = 0.118, hrx = 0, hry = 0, sc = 1, oy = 0;
  if (p.air) {
    p.wph += dt * (p.t < 0.9 ? 9.5 : 7.2) * TAU;
    const a = p.glide ? 0.45 : Math.sin(p.wph) * 0.9 + 0.12;
    p.wl.scale.set(1, 1, 1); p.wr.scale.set(1, 1, 1); p.wl.rotation.set(0, 0, -a); p.wr.rotation.set(0, 0, a);
    pitch = clamp(-p.vy * 0.06, -0.5, 0.4); roll = p.bank; hy = 0.178; hz = 0.165; p.sh.visible = false; p.vp = 0;
  } else {
    p.wl.scale.set(0.34, 1, 0.9); p.wr.scale.set(0.34, 1, 0.9); p.wl.rotation.set(0, 0.25, 1.25); p.wr.rotation.set(0, -0.25, -1.25); p.sh.visible = true;
    if (p.v > 0.02) { const st = 0.08; p.bph = (p.bph + dt * p.v / st) % 1; hz += p.v > 0.75 ? Math.sin(p.bph * TAU) * 0.015 : 0.03 - (p.bph < 0.6 ? st * p.bph : st * 0.6 * (1 - (p.bph - 0.6) / 0.4)); }
    else if (p.pause > 0) hy += 0.014;
    let k = p.st === 'drink' ? p.dk : 0;
    if (p.peckT > 0) { p.peckT -= dt; k = Math.sin(clamp(1 - p.peckT / p.peckD, 0, 1) * Math.PI); }
    if (k > 0) { hy -= 0.11 * k; hz += 0.055 * k; hrx = 1.2 * k; pitch = 0.5 * k; }
    if (p.st === 'court') { pitch = 0.3 + 0.28 * Math.sin(p.t * 5.5); sc = 1.13; hz -= 0.012; }
    else if (p.st === 'loaf' && p.sub === 'preen') { hry = 2.2 * p.side; hrx = 0.5 + Math.sin(p.t * 13) * 0.18; hy -= 0.035; hz -= 0.06; }
    else if (p.st === 'loaf' && p.sub === 'sun') { roll = 0.5 * p.side; oy = -0.045; const w = p.side > 0 ? p.wl : p.wr; w.scale.set(0.9, 1, 1); w.rotation.set(0, 0, -0.25 * p.side); }
    else if (p.st === 'roost') { hy -= 0.03; hz -= 0.035; sc = 1.1; oy = -0.04; }
    p.vp = -(hrx + pitch) * 0.95;
  }
  p.head.position.set(0, hy, hz); p.head.rotation.set(hrx, hry, 0);
  p.g.position.set(p.x, p.y + oy, p.z); p.g.rotation.set(pitch, p.h, roll, 'YXZ'); p.g.scale.setScalar(sc);
}

// ================= 猛禽 =================
const hawk = { on: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, next: rr(70, 120), ms: birdMesh(MORPHS[2]) };
hawk.ms.g.scale.setScalar(1.7); hawk.ms.g.visible = false; hawk.ms.sh.visible = false;
function hawkStep(dt) {
  if (!hawk.on) { hawk.next -= dt; if (hawk.next <= 0 && tod > DAWN + 0.5 && tod < DUSK - 0.5) { const f = P[focus], a = R() * TAU; hawk.on = true; hawk.x = f.x - Math.sin(a) * 260; hawk.z = f.z - Math.cos(a) * 260; hawk.y = 46; hawk.vx = Math.sin(a) * 24; hawk.vz = Math.cos(a) * 24; hawk.t = 0; hawk.ms.g.visible = true; } return; }
  hawk.t += dt; hawk.x += hawk.vx * dt; hawk.z += hawk.vz * dt; hawk.y = 46 - Math.min(hawk.t, 8) * 2.2;
  const g = hawk.ms.g; g.position.set(hawk.x, hawk.y, hawk.z); g.rotation.set(0.15, Math.atan2(hawk.vx, hawk.vz), 0, 'YXZ');
  const a = Math.sin(hawk.t * 22) * 0.6; hawk.ms.wl.rotation.set(0, 0, -a); hawk.ms.wr.rotation.set(0, 0, a);
  if (((hawk.t * 4) | 0) !== (((hawk.t - dt) * 4) | 0)) { for (const p of P) p.ret = p.site; alarmAt(hawk.x, hawk.z, 75, true); }
  if (hawk.t > 22) { hawk.on = false; hawk.ms.g.visible = false; hawk.next = rr(110, 190); }
}

// ================= ハト視野パノラマ =================
const cubeRT = new THREE.WebGLCubeRenderTarget(640, { generateMipmaps: false });
const cubeCam = new THREE.CubeCamera(0.012, 4000, cubeRT); scene.add(cubeCam);
const panoMat = new THREE.ShaderMaterial({
  uniforms: { tCube: { value: cubeRT.texture }, uF: { value: new THREE.Vector3(0, 0, 1) }, uR: { value: new THREE.Vector3(1, 0, 0) }, uU: { value: new THREE.Vector3(0, 1, 0) }, uAsp: { value: 1.7 }, uUV: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `uniform samplerCube tCube; uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uAsp; uniform float uUV; varying vec2 vUv;
  const float HF = 5.7596; const float VF = 2.2689;
  void main(){
    float band = clamp(uAsp / (HF / VF), 0.05, 1.0);
    float v = (vUv.y - 0.5) / band;
    if (abs(v) > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float yaw = (vUv.x - 0.5) * HF; float pit = v * VF;
    vec3 d = cos(pit) * (cos(yaw) * uF + sin(yaw) * uR) + sin(pit) * uU;
    vec3 c = textureCube(tCube, d).rgb;
    if (uUV > 0.5) c = vec3(c.r * 0.72 + c.b * 0.38, c.g * 0.88, c.b * 1.12 + c.r * 0.18);
    float ay = abs(yaw);
    c *= 1.0 - smoothstep(HF * 0.5 - 0.17, HF * 0.5, ay);
    c += (1.0 - smoothstep(0.0, 0.006, abs(ay - 0.21))) * 0.09;
    c *= 1.0 - 0.3 * smoothstep(0.36, 0.5, abs(v));
    gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
  }`, depthTest: false, depthWrite: false,
});
const panoScene = new THREE.Scene(), panoQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), panoMat); panoQuad.frustumCulled = false; panoScene.add(panoQuad);
const panoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const beak = new THREE.Mesh(new THREE.ConeGeometry(0.0026, 0.03, 8), new THREE.MeshLambertMaterial({ color: 0x2b2b2b })); scene.add(beak);

// ================= 入力・HUD =================
let view = 0, lookYaw = 0, lookPitch = 0, orbYaw = 0, orbPitch = 0.28, tpDist = 1.3, uvMode = 0, started = false;
const VIEWS = ['ハト視野 330°パノラマ', '一人称(ヒト相当の画角)', '三人称(追尾観察)'], SPEEDS = [1, 30, 120, 600];
const ETH = {
  bob: { n: 'ヘッドボブ歩行', d: '頭を空間に固定する「ホールド期」と前へ突き出す「スラスト期」の反復。体が進んでも網膜像がぶれません。' },
  run: { n: '小走りでの回避', d: '歩行者が近づくと飛ばずに歩いて避けます。速足になるとホールド期が消え、首の動きは連続的になります。' },
  peck: { n: 'ついばみ採餌', d: '種子やパンくずを一粒ずつついばみます。下を向く間は周囲への警戒が手薄になります。' },
  flockfeed: { n: '群れ採餌', d: '採餌している仲間のいる場所へ集まります。都市のドバトは人の落とす食べ物に強く依存します。' },
  flush: { n: '一斉飛び立ち', d: '1羽の驚きが連鎖し、翼を打ち鳴らして群れ全体が飛び立ちます。' },
  flock: { n: '群飛', d: '飛び立った群れはまとまって旋回し、安全を確かめてから元の場所や屋上へ戻ります。' },
  court: { n: '求愛ディスプレイ', d: 'オスが首をふくらませ、お辞儀を繰り返しながらメスの周りを回って鳴きます。' },
  preen: { n: '羽づくろい', d: '満腹になると屋上の縁などで休み、くちばしで羽を整えます。' },
  sun: { n: '日光浴', d: '日中、体を傾けて片翼を広げ、日に当てます。' },
  drink: { n: '吸い飲み', d: 'くちばしを水につけたまま吸い上げて飲みます。ハト類に特徴的な飲み方です。' },
  roost: { n: 'ねぐら入り', d: '日没前後、雨の当たらない棚状の場所(ここでは阪神高速の橋脚)に集まって眠ります。' },
  raptor: { n: '猛禽からの回避', d: '上空を猛禽が通過すると、広い範囲のハトが一斉に飛び立って旋回します。' },
};
function renderEtho() { const ks = Object.keys(ETH), n = ks.filter(k => ETH[k].ok).length; $('etho').innerHTML = '<h2>行動図鑑 ' + n + '/' + ks.length + '</h2>' + ks.map(k => '<div class="' + (ETH[k].ok ? 'ok' : '') + '"><span>' + (ETH[k].ok ? '●' : '○') + '</span>' + (ETH[k].ok ? ETH[k].n : '???') + '</div>').join(''); }
let toastT = 0;
function toast(a, b) { const t = $('toast'); t.innerHTML = '<b>' + a + '</b>' + (b || ''); t.style.opacity = 1; toastT = 7; }
function unlock(k) { if (ETH[k].ok || !started) return; ETH[k].ok = true; toast('観察: ' + ETH[k].n, ETH[k].d); renderEtho(); }
renderEtho();
function setFocus(i) { const o = P[focus]; if (o.st === 'manual') { o.st = o.air ? 'fly' : 'forage'; if (o.air) { o.dx = o.x; o.dz = o.z; o.dy = roofAt(o.x, o.z); o.next = 'forage'; o.t = 0; } } o.head.visible = true; focus = (i + N) % N; lookYaw = lookPitch = 0; }
function onKey(code) {
  if (code === 'Tab') setFocus(focus + 1);
  else if (code === 'KeyV') view = (view + 1) % 3;
  else if (code === 'KeyT') { tScale = SPEEDS[(SPEEDS.indexOf(tScale) + 1) % SPEEDS.length]; toast('時間の速さ ×' + tScale, '時計と空腹の進み方だけが変わります。ハトの動きは常に実時間です。'); }
  else if (code === 'KeyM') { const p = P[focus]; if (p.st === 'manual') { setFocus(focus); toast('観察モード', 'この個体は自律行動に戻りました。'); } else { p.st = 'manual'; p.peckT = 0; toast('操作モード', 'W 前進 / A・D 旋回 / Space 羽ばたく / C 降下 / E ついばむ'); } }
  else if (code === 'KeyU') { uvMode = 1 - uvMode; toast(uvMode ? '紫外域の擬似強調 ON' : '紫外域の擬似強調 OFF', 'ハトは紫外域も見えますが画面では再現できないため、色のずらしによる擬似表現です。'); }
  else if (code === 'KeyN') { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.6; }
  else if (code === 'KeyP') paused = !paused;
}
window.addEventListener('keydown', e => { if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (!e.repeat) onKey(e.code); keys.add(e.code); });
window.addEventListener('keyup', e => keys.delete(e.code));
document.querySelectorAll('#btns button').forEach(b => b.addEventListener('click', () => onKey(b.dataset.k)));
let drag = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (view === 2) { orbYaw -= dx * 0.006; orbPitch = clamp(orbPitch + dy * 0.005, -0.1, 1.4); } else { lookYaw = clamp(lookYaw - dx * 0.005, -2.4, 2.4); lookPitch = clamp(lookPitch + dy * 0.004, -1.2, 1.2); } });
canvas.addEventListener('wheel', e => { tpDist = clamp(tpDist * (e.deltaY > 0 ? 1.15 : 0.87), 0.35, 60); e.preventDefault(); }, { passive: false });
$('go').addEventListener('click', () => { $('start').style.display = 'none'; started = true; initAudio(); toast('日本橋公園の朝 7時すぎ', '朝の採餌のピークです。Tabで別の個体へ、Vで視点を切り替えられます。'); });
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); panoMat.uniforms.uAsp.value = w / h; }
window.addEventListener('resize', resize); resize();

// ミニマップ
const mapC = $('map'), mctx = mapC.getContext('2d'), MS = mapC.height / (Wd.z1 - Wd.z0), base = document.createElement('canvas'); base.width = mapC.width; base.height = mapC.height;
const MX = x => (x - Wd.x0) * MS, MZ = z => (z - Wd.z0) * MS;
{
  const c = base.getContext('2d'); c.fillStyle = '#5b5f66'; c.fillRect(0, 0, base.width, base.height);
  c.fillStyle = '#2f7890'; c.fillRect(0, MZ(RIVER.z - 15), base.width, 30 * MS);
  c.fillStyle = '#5c8f45'; for (const p of parks) c.fillRect(MX(p.x0), MZ(p.z0), (p.x1 - p.x0) * MS, (p.z1 - p.z0) * MS);
  c.fillStyle = '#20242b'; for (const b of B) if (!b.deck) c.fillRect(MX(b.x0), MZ(b.z0), (b.x1 - b.x0) * MS, (b.z1 - b.z0) * MS);
  c.fillStyle = 'rgba(240,163,90,.55)'; c.fillRect(0, MZ(-586), base.width, 18 * MS);
}
function drawMap() {
  mctx.drawImage(base, 0, 0);
  for (const p of P) { mctx.fillStyle = p.air ? '#9fd8ff' : '#ffffff'; mctx.fillRect(MX(p.x) - 1, MZ(p.z) - 1, 2, 2); }
  if (hawk.on) { mctx.fillStyle = '#ff5a4a'; mctx.fillRect(MX(hawk.x) - 2, MZ(hawk.z) - 2, 5, 5); }
  const f = P[focus]; mctx.strokeStyle = '#57c79a'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(MX(f.x), MZ(f.z), 5, 0, TAU); mctx.stroke();
  mctx.beginPath(); mctx.moveTo(MX(f.x), MZ(f.z)); mctx.lineTo(MX(f.x) + Math.sin(f.h) * 10, MZ(f.z) + Math.cos(f.h) * 10); mctx.stroke();
}
const STN = { forage: '採餌(探索)', fly: '飛翔', loaf: '休息', court: '求愛ディスプレイ', drink: '水飲み(吸い飲み)', roost: 'ねぐらで休息', manual: '手動操作中' };
function hud() {
  const p = P[focus];
  let s = STN[p.st] || p.st; if (p.peckT > 0) s = 'ついばみ'; else if (p.st === 'fly' && p.alarm) s = '警戒飛翔'; else if (p.st === 'loaf') s = p.sub === 'preen' ? '羽づくろい' : p.sub === 'sun' ? '日光浴' : '休息'; else if (p.st === 'forage' && p.evade > 0) s = '歩行者を回避'; else if (p.st === 'forage' && p.pause > 0) s = '警戒(見回し)';
  $('who').innerHTML = 'N-' + String(p.i + 1).padStart(2, '0') + ' ' + (p.male ? '♂' : '♀') + '<small>' + p.m.n + '</small>';
  $('state').textContent = s;
  $('vH').textContent = Math.round((1 - p.hunger) * 100) + '%'; $('bH').style.width = (1 - p.hunger) * 100 + '%';
  $('vT').textContent = Math.round(p.thirst * 100) + '%'; $('bT').style.width = p.thirst * 100 + '%';
  const sp = p.air ? Math.hypot(p.spd, p.vy) : p.v; $('vS').textContent = (sp * 3.6).toFixed(1) + ' km/h / ' + p.y.toFixed(1) + ' m';
  $('vL').textContent = placeName(p.x, p.z);
  const hh = Math.floor(tod), mm = Math.floor((tod - hh) * 60); $('vC').textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ' (×' + tScale + ')';
  $('vV').textContent = VIEWS[view];
  let n = 0; for (const q of P) if (q !== p && dist2(p.x, p.z, q.x, q.z) < 100) n++; $('vN').textContent = n + ' 羽';
  // 行動図鑑の判定
  let feed = 0, fly = 0;
  for (const q of P) {
    const d = dist2(q.x, q.z, p.x, p.z); if (d > 1600) continue;
    if (q.air) fly++; else { if (q.st === 'forage' && d < 49) feed++; if (q.v > 0.05 && q.v < 0.75) unlock('bob'); if (q.v >= 0.75) unlock('run'); }
    if (q.peckT > 0 && q.st !== 'drink') unlock('peck'); if (q.st === 'court') unlock('court'); if (q.st === 'drink') unlock('drink'); if (q.st === 'roost') unlock('roost');
    if (q.st === 'loaf' && q.sub === 'preen') unlock('preen'); if (q.st === 'loaf' && q.sub === 'sun') unlock('sun');
  }
  if (feed >= 6) unlock('flockfeed'); if (fly >= 5) unlock('flock');
  if (now - lastFlush < 4 && flushN >= 5 && dist2(flushX, flushZ, p.x, p.z) < 3600) unlock('flush');
  if (hawk.on && dist2(hawk.x, hawk.z, p.x, p.z) < 40000) unlock('raptor');
}

// ================= 環境光 =================
const cNight = new THREE.Color(0x0a1022), cDay = new THREE.Color(0x8fc1e8), cDawn = new THREE.Color(0xf0a36c), tmpC = new THREE.Color();
function env() {
  const s = Math.sin((tod - 6.45) / (16.95 - 6.45) * Math.PI), k = clamp(s * 3.2 + 0.12, 0, 1);
  tmpC.copy(cNight).lerp(cDay, k); if (k > 0.02 && k < 0.9) tmpC.lerp(cDawn, (1 - Math.abs(k - 0.4) / 0.5) * 0.45 * (k < 0.9 ? 1 : 0));
  skyC.copy(tmpC); scene.fog.color.copy(tmpC);
  hemi.intensity = 0.22 + 0.95 * k; sun.intensity = 1.7 * k; const a = (tod - 6.45) / (16.95 - 6.45) * Math.PI; sun.position.set(Math.cos(a) * 300, Math.max(0.05, Math.sin(a)) * 220 + 20, 180);
  bldMat.emissiveIntensity = (1 - k) * 0.9;
}

// ================= メインループ =================
const eye = new THREE.Vector3(), vF = new THREE.Vector3(), vR = new THREE.Vector3(), vU = new THREE.Vector3(), YUP = new THREE.Vector3(0, 1, 0), tgt = new THREE.Vector3();
let last = performance.now(), hudT = 0, foodT = 0, feedT = 30;
function frame(tms) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (tms - last) / 1000); last = tms; if (paused || !(dt > 0)) dt = 0;
  now += dt; const dh = dt * tScale / 3600; tod = (tod + dh) % 24;
  if (dt > 0) {
    env();
    for (const q of peds) pedStep(q, dt); pedDraw();
    foodT -= dt; if (foodT <= 0) { foodT = 0.7; const s = SITES[(R() * SITES.length) | 0]; dropFood(s.x, s.z, 2, s.r); }
    feedT -= dt; if (feedT <= 0) { feedT = rr(45, 80); const k = (R() * parks.length) | 0; dropFood(parks[k].cx - 3.6, parks[k].cz + 4, 34, 1.8); }
    if (foodDirty) { foodDirty = false; let i = 0; for (const f of food) { dummy.position.set(f.x, 0.012, f.z); dummy.updateMatrix(); foodMesh.setMatrixAt(i++, dummy.matrix); } foodMesh.count = i; foodMesh.instanceMatrix.needsUpdate = true; }
    const peak = (tod > 6.4 && tod < 9) || (tod > 14.3 && tod < 16.6) ? 1.5 : 1;
    for (const p of P) {
      p.hunger = Math.min(1, p.hunger + dh * 0.5 * peak); p.thirst = Math.min(1, p.thirst + dh * 0.3); p.cd -= dt;
      if (p.alarmIn > 0 && !p.air && p.st !== 'manual') { p.alarmIn -= dt; if (p.alarmIn <= 0) { if (!p.ret) p.ret = p.site; setFly(p, p.aw[0], p.aw[1], p.aw[2], 'return', true); } }
      if (p.st === 'manual') manualStep(p, dt);
      else if (p.st === 'fly') flyStep(p, dt);
      else { p.think -= dt; if (p.think <= 0) { const tt = rr(0.25, 0.45); p.think = tt; thinkGround(p, tt); } if (p.st !== 'fly') groundStep(p, dt); }
      pose(p, dt);
    }
    hawkStep(dt);
  }
  // カメラ
  const f = P[focus], fp = view < 2;
  for (const p of P) { p.g.visible = dist2(p.x, p.z, f.x, f.z) < 360000; p.head.visible = true; }
  f.head.visible = !fp; beak.visible = fp;
  f.g.updateMatrixWorld(true); f.head.getWorldPosition(eye);
  const yaw = f.h + lookYaw + (fp ? 0 : 0), vp = clamp(f.vp + lookPitch, -1.5, 1.5);
  vF.set(Math.sin(yaw) * Math.cos(vp), Math.sin(vp), Math.cos(yaw) * Math.cos(vp)); vR.set(-vF.z, 0, vF.x).normalize(); vU.crossVectors(vR, vF);
  if (fp) { beak.position.copy(eye).addScaledVector(vF, 0.04).addScaledVector(vU, -0.021); beak.quaternion.setFromUnitVectors(YUP, tgt.copy(vF).addScaledVector(vU, -0.12).normalize()); }
  if (view === 0) {
    cubeCam.position.copy(eye); cubeCam.update(renderer, scene);
    panoMat.uniforms.uF.value.copy(vF); panoMat.uniforms.uR.value.copy(vR); panoMat.uniforms.uU.value.copy(vU); panoMat.uniforms.uUV.value = uvMode;
    renderer.setRenderTarget(null); renderer.render(panoScene, panoCam);
  } else if (view === 1) { cam.fov = 78; cam.updateProjectionMatrix(); cam.position.copy(eye); cam.lookAt(tgt.copy(eye).add(vF)); renderer.render(scene, cam); }
  else {
    const a = f.h + Math.PI + orbYaw, d = Math.max(tpDist, f.air ? 1.2 : 0.35);
    cam.fov = 55; cam.updateProjectionMatrix();
    cam.position.set(f.x + Math.sin(a) * Math.cos(orbPitch) * d, Math.max(0.04, f.y + 0.16 + Math.sin(orbPitch) * d), f.z + Math.cos(a) * Math.cos(orbPitch) * d);
    cam.lookAt(tgt.set(f.x, f.y + 0.16, f.z)); renderer.render(scene, cam);
  }
  hudT -= dt || 0.016; if (hudT <= 0) { hudT = 0.12; hud(); drawMap(); }
  if (toastT > 0) { toastT -= dt || 0.016; if (toastT <= 0) $('toast').style.opacity = 0; }
}
requestAnimationFrame(frame);
window.__hato = { P, B, get tod() { return tod; }, set tod(v) { tod = v; }, setView: v => { view = v; }, alarmAt, food };
