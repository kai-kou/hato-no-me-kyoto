// World: PLATEAU city meshes, streamed textures, terrain, water, sky, lighting.
import * as THREE from './three.module.min.js';
import { clamp, lerp, smooth, loadPak, loadTexPak, fetchBytes, patchMaterial, GLSL_NOISE, GLSL_BSH, DEG, rng, bitmap, asset } from './util.js';

// ------------------------------------------------------------------ shared uniforms
export const U = {
  uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 0.9, 0.8) },
  uHor: { value: new THREE.Color(0.6, 0.7, 0.9) }, uZen: { value: new THREE.Color(0.1, 0.3, 0.7) }, uNight: { value: 0 }, uWet: { value: 0 },
  uOrtho: { value: null }, uOrthoRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uOrthoOn: { value: 0 },   // the aerial photograph of the surroundings, also used to colour the roofs of the context buildings
  uLampTex: { value: null }, uLampRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uLampCol: { value: new THREE.Color(1.0, 0.68, 0.40) },
  uReflTex: { value: null }, uReflVP: { value: new THREE.Matrix4() }, uReflOn: { value: 0 }, uReflY: { value: 0 },
  uNoise: { value: null }, uCloud: { value: 0.45 }, uMoonDir: { value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize() },
  uBSh: { value: null }, uBShM: { value: new THREE.Matrix4() }, uBShP: { value: new THREE.Vector4(0, 0, 0, 0) }, uBAO: { value: null }, uBAOM: { value: new THREE.Matrix4() }, uBAOP: { value: new THREE.Vector4(0, 0, 0, 0) },
};

// ------------------------------------------------------------------ nav grids
export class Nav {
  constructor(pak) {
    const j = pak.json, g = j.grids; this.off = j.off; this.core = j.core; this.ctx = j.ctx; this.w1 = j.water1; this.far = j.far;
    this.G = pak.view(Int16Array, g.nav_G).slice(); this.T = pak.view(Int16Array, g.nav_T); this.F = pak.view(Int16Array, g.nav_F); this.W = pak.view(Int16Array, g.nav_W);
    this.C = pak.view(Uint8Array, g.nav_C); this.AO = pak.view(Uint8Array, g.nav_AO);
    this.cG = pak.view(Int16Array, g.ctx_G); this.cT = pak.view(Int16Array, g.ctx_T); this.cW = pak.view(Int16Array, g.ctx_W); this.water1 = pak.view(Int16Array, g.water1); this.farH = pak.view(Int16Array, g.far);
    this._flattenNearRoads(); this._levelRoad(-208.5, -99, 144.5, 162); this._levelRoad(-27, 128, 144.5, 162);
    // under the ends of the Shijo bridge deck (built in scenery.js: x -98.5 .. -30.5 at z 153.2, 24.5 m wide) the bank top must stay below the deck
    this._cap(-98.6, -92, 140.5, 166, this.ground(-101.5, 153.2) - 0.3); this._cap(-37, -30.4, 140.5, 166, this.ground(-27.5, 153.2) - 0.3);
  }
  _cap(x0, x1, z0, z1, y) { const c = this.core, G = this.G, v = Math.round(y * 100); for (let j = Math.max(0, Math.floor((z0 - c.z0) / c.res)); j <= Math.min(c.h - 1, Math.floor((z1 - c.z0) / c.res)); j++) for (let i = Math.max(0, Math.floor((x0 - c.x0) / c.res)); i <= Math.min(c.w - 1, Math.floor((x1 - c.x0) / c.res)); i++) { const k = j * c.w + i; if (G[k] > v) G[k] = v; } }
  // Shijo-dori is plain terrain in this data: level it across the street and bridge short dips (the Takase canal), so the traffic gets a road surface
  _levelRoad(x0, x1, z0, z1) { const c = this.core, G = this.G, C = this.C, i0 = Math.max(0, Math.floor((x0 - c.x0) / c.res)), i1 = Math.min(c.w - 1, Math.floor((x1 - c.x0) / c.res)), j0 = Math.max(0, Math.floor((z0 - c.z0) / c.res)), j1 = Math.min(c.h - 1, Math.floor((z1 - c.z0) / c.res)), n = i1 - i0 + 1; if (n < 8) return;
    let p = new Float32Array(n); for (let i = i0; i <= i1; i++) { const v = []; for (let j = j0; j <= j1; j++) { const k = j * c.w + i; if (C[k] === 0) v.push(G[k]); } v.sort((a, b) => a - b); p[i - i0] = v.length ? v[v.length >> 1] : NaN; }
    for (let i = 1; i < n; i++) if (Number.isNaN(p[i])) p[i] = p[i - 1]; for (let i = n - 2; i >= 0; i--) if (Number.isNaN(p[i])) p[i] = p[i + 1]; if (Number.isNaN(p[0])) return;
    const win = (src, W, f) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { let m = src[i]; for (let k = Math.max(0, i - W); k <= Math.min(n - 1, i + W); k++) m = f(m, src[k]); o[i] = m; } return o; }, W = Math.round(7 / c.res);
    p = win(win(p, W, Math.max), W, Math.min); const q = new Float32Array(n), S = Math.round(3 / c.res); for (let i = 0; i < n; i++) { let a = 0, m = 0; for (let k = Math.max(0, i - S); k <= Math.min(n - 1, i + S); k++) { a += p[k]; m++; } q[i] = a / m; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = j * c.w + i; if (C[k] === 0) G[k] = Math.round(q[i - i0]); } }
  // The 1 m terrain model bulges in the narrow gaps between buildings; next to a LOD3 road the surveyed road height is the better ground level.
  _flattenNearRoads() { const c = this.core, W = c.w, H = c.h, G = this.G, C = this.C, src = new Int16Array(W * H).fill(-32768); let q = [];
    for (let k = 0; k < W * H; k++) if (C[k] === 2) { src[k] = G[k]; q.push(k); }
    for (let it = 0; it < 7 && q.length; it++) { const nq = []; for (const k of q) { const i = k % W, j = (k / W) | 0; for (let s = 0; s < 4; s++) { const x = i + (s === 0 ? 1 : s === 1 ? -1 : 0), y = j + (s === 2 ? 1 : s === 3 ? -1 : 0); if (x < 0 || y < 0 || x >= W || y >= H) continue; const n = y * W + x; if (src[n] !== -32768 || C[n] === 2 || C[n] === 1) continue; src[n] = src[k]; if (G[n] > src[n] + 2) G[n] = src[n] + 2; if (C[n] === 0) nq.push(n); } } q = nq; } }
  _ci(x, z) { const c = this.core, i = Math.floor((x - c.x0) / c.res), j = Math.floor((z - c.z0) / c.res); return (i < 0 || j < 0 || i >= c.w || j >= c.h) ? -1 : j * c.w + i; }
  _xi(x, z) { const c = this.ctx, i = Math.floor((x - c.x0) / c.res), j = Math.floor((z - c.z0) / c.res); return (i < 0 || j < 0 || i >= c.w || j >= c.h) ? -1 : j * c.w + i; }
  inCore(x, z) { return this._ci(x, z) >= 0; }
  // walking surface height (terrain or LOD3 road); bilinear inside the core
  ground(x, z) {
    const c = this.core, fx = (x - c.x0) / c.res - 0.5, fz = (z - c.z0) / c.res - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    if (i >= 0 && j >= 0 && i < c.w - 1 && j < c.h - 1) { const a = fx - i, b = fz - j, k = j * c.w + i, G = this.G; return ((G[k] * (1 - a) + G[k + 1] * a) * (1 - b) + (G[k + c.w] * (1 - a) + G[k + c.w + 1] * a) * b) / 100; }
    const k = this._xi(x, z); return k >= 0 ? this.cG[k] / 100 : 2;
  }
  cls(x, z) { const k = this._ci(x, z); return k >= 0 ? this.C[k] : (this.waterY(x, z) > -300 ? 1 : 0); }
  waterY(x, z) { const k = this._ci(x, z); if (k >= 0) return this.W[k] === -32768 ? -999 : this.W[k] / 100; const q = this._xi(x, z); return q >= 0 && this.cW[q] !== -32768 ? this.cW[q] / 100 : -999; }
  // top of solid obstacles (buildings); -999 if none
  roof(x, z) { const k = this._ci(x, z); if (k >= 0) return this.T[k] === -32768 ? -999 : this.T[k] / 100; const q = this._xi(x, z); return q >= 0 && this.cT[q] !== -32768 ? this.cT[q] / 100 : -999; }
  furn(x, z) { const k = this._ci(x, z); return k >= 0 && this.F[k] !== -32768 ? this.F[k] / 100 : -999; }
  // highest thing at (x,z): where a bird could stand / must fly above
  top(x, z) { return Math.max(this.ground(x, z), this.roof(x, z), this.furn(x, z), this.waterY(x, z)); }
  solidTop(x, z) { return Math.max(this.ground(x, z), this.roof(x, z)); }
  // Kawabata-dori follows the east bank: x of the bank top at z (smoothed); the lanes are offset from it
  roadEdge(z) { if (!this._re) { const xe = []; for (let zz0 = -230; zz0 <= 200; zz0 += 10) { const zz = clamp(zz0, -218, 172), road = this.ground(2, zz); let x0 = -14; for (let x = -34; x < -2; x += 0.5) if (this.ground(x, zz) >= road - 0.7 && this.cls(x, zz) === 0) { x0 = x; break; } xe.push(x0); }
      for (let p = 0; p < 3; p++) { const t = xe.slice(); for (let i = 1; i < xe.length - 1; i++) xe[i] = (t[i - 1] + t[i] * 2 + t[i + 1]) / 4; } this._re = xe; }
    const f = clamp((z + 230) / 10, 0, this._re.length - 1.001), i = Math.floor(f); return lerp(this._re[i], this._re[i + 1], f - i); }
  walkable(x, z) { const k = this._ci(x, z); if (k < 0) return false; const c = this.C[k]; if (c === 3) return false; if (c === 1) return this.W[k] / 100 - this.G[k] / 100 < 0.07; return true; }
}

// ------------------------------------------------------------------ texture streaming
export class TexStream {
  constructor(renderer, table, Q) {
    this.r = renderer; this.table = table; this.Q = Q; this.e = {}; this.queue = []; this.active = 0; this.mPak = null; this.bytes = 0; this.t = 0;
    for (const n in table) { const tex = new THREE.Texture(); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = Q.aniso; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const bb = table[n].bb; this.e[n] = { name: n, tex, lvl: -1, want: 0, busy: false, bb, since: 0 }; }
  }
  async _bmp(blob) { return await bitmap(blob); }
  _set(e, bmp, lvl) { const old = e.tex.image; if (old) e.tex.dispose(); e.tex.image = bmp; e.tex.needsUpdate = true; if (old && old.close && old !== e.baseBmp) old.close(); e.lvl = lvl; }
  async loadBase(url, onProg, expect) { const pak = await loadTexPak(url, onProg, expect); await Promise.all(pak.names.map(async n => { const e = this.e[n]; if (!e) return; e.baseBmp = await this._bmp(pak.blob(n)); this._set(e, e.baseBmp, 0); })); }
  async loadMid(url) { this.mPak = await loadTexPak(url); }
  update(cam, dt) {
    this.t += dt; const Q = this.Q, p = cam;
    for (const n in this.e) { const e = this.e[n], b = e.bb; const dx = Math.max(b[0] - p.x, 0, p.x - b[3]), dy = Math.max(b[1] - p.y, 0, p.y - b[4]), dz = Math.max(b[2] - p.z, 0, p.z - b[5]), d = Math.hypot(dx, dy, dz);
      let want = d < Q.texU ? 3 : d < Q.texH ? 2 : d < Q.texM ? 1 : 0; if (want > Q.texMax) want = Q.texMax; if (want === 1 && !this.mPak) want = 0; e.d = d;
      if (want !== e.want) { e.want = want; e.since = this.t; } }
    while (this.active < Q.texConc) {
      let best = null, down = null; for (const n in this.e) { const e = this.e[n]; if (e.busy || e.lvl < 0) continue; if (e.want > e.lvl) { if (!best || e.d < best.d) best = e; } else if (e.want < e.lvl && this.t - e.since > 6) down = e; }
      best = best || down; if (!best) break; this._load(best, best.want > best.lvl ? Math.min(best.want, best.lvl + (best.lvl === 0 && best.want > 1 && best.d > 30 ? 2 : 3)) : best.want); }
  }
  async _load(e, lvl) {
    e.busy = true; this.active++;
    try { let bmp; if (lvl === 0) bmp = e.baseBmp; else if (lvl === 1) bmp = await this._bmp(this.mPak.blob(e.name)); else { const res = await fetch(asset(`t/${e.name}_${lvl === 3 ? 'u' : 'h'}.webp`)); bmp = await this._bmp(await res.blob()); }
      this._set(e, bmp, lvl); } catch (err) { e.want = e.lvl; }
    e.busy = false; this.active--;
  }
  stats() { const c = [0, 0, 0, 0]; for (const n in this.e) if (this.e[n].lvl >= 0) c[this.e[n].lvl]++; return c; }
}

// ------------------------------------------------------------------ GLSL shared by patched materials
const F_PARS = `
varying vec3 vWPos;
uniform float uTime, uNight, uWet, uReflOn, uReflY; uniform vec3 uHor;
uniform sampler2D uLampTex, uReflTex, uOrtho; uniform vec4 uLampRect, uOrthoRect; uniform vec3 uLampCol; uniform mat4 uReflVP; uniform float uOrthoOn;
${GLSL_NOISE}
${GLSL_BSH}
#define OCT(f) (1.0 - ss(0.10, 0.32, fw * (f)))
vec3 hPerturb(vec3 vpos, vec3 n, float h, float sc){ vec3 dpx = dFdx(vpos), dpy = dFdy(vpos); float dhx = dFdx(h), dhy = dFdy(h); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2); return normalize(abs(det) * n - sc * g); }
float hAO = 1.0; float hWetK = 0.0; float hBump = 0.0; vec3 hWN = vec3(0.0, 1.0, 0.0);
`;
const V_PARS = `varying vec3 vWPos;`;
// Catmull-Rom texture filter in 9 bilinear taps (used on magnified wall photos, high tier only)
const HCR = `vec3 hCR(sampler2D tex, vec2 uv, vec2 size){ vec2 sp = uv * size, tc = floor(sp - 0.5) + 0.5, f = sp - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t0 = (tc - 1.0) / size, t3 = (tc + 2.0) / size, t12 = (tc + w2 / w12) / size;
  vec3 r = (texture2D(tex, vec2(t0.x, t0.y)).rgb * w0.x + texture2D(tex, vec2(t12.x, t0.y)).rgb * w12.x + texture2D(tex, vec2(t3.x, t0.y)).rgb * w3.x) * w0.y
    + (texture2D(tex, vec2(t0.x, t12.y)).rgb * w0.x + texture2D(tex, vec2(t12.x, t12.y)).rgb * w12.x + texture2D(tex, vec2(t3.x, t12.y)).rgb * w3.x) * w12.y
    + (texture2D(tex, vec2(t0.x, t3.y)).rgb * w0.x + texture2D(tex, vec2(t12.x, t3.y)).rgb * w12.x + texture2D(tex, vec2(t3.x, t3.y)).rgb * w3.x) * w3.y;
  return max(r, vec3(0.0)); }
`;
const V_END = `#ifdef USE_INSTANCING
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`;
// grass tufts sway from the root; colour alpha carries the weight (0.5 at the root, 1 at the tip)
const GRASS_VB = `#ifdef USE_INSTANCING
{ float sw = clamp(color.a * 2.0 - 1.0, 0.0, 1.0); sw *= sw; vec2 ip = instanceMatrix[3].xz; float ph = uTime * 2.3 + ip.x * 1.9 + ip.y * 1.4; transformed.xz += vec2(sin(ph) + 0.4 * sin(ph * 2.3 + 1.1), 0.7 * cos(ph * 0.83)) * 0.006 * sw; }
#endif`;
const F_LAMP = `{ vec2 luv = (vWPos.xz - uLampRect.xy) * uLampRect.zw; vec4 lt = texture2D(uLampTex, luv); float gy = lt.g * 16.0 - 8.0; float hf = 1.0 - ss(0.5, 6.5, vWPos.y - gy); vec3 le = diffuseColor.rgb * uLampCol * (lt.r * lt.r) * hf * uNight * 0.95; totalEmissiveRadiance += le / (1.0 + max(le.r, max(le.g, le.b)) * 0.75); }`;   // a soft shoulder, so that a pale wall or a vermilion fence next to a lamp keeps its colour
const F_AO = `{ float aoK = mix(1.0, hAO, 0.86); reflectedLight.indirectDiffuse *= aoK; reflectedLight.directDiffuse *= mix(1.0, hAO, 0.25);
#ifdef STANDARD
  reflectedLight.indirectSpecular *= aoK;
#endif
}`;
const F_FINAL = `gl_FragColor.a = vViewPosition.z;`;
// wet ground: darker, glossier, planar reflection by Fresnel
const F_WET_ROUGH = `#ifdef STANDARD
  roughnessFactor = mix(roughnessFactor, 0.06, hWetK);
#endif`;
const F_WET_REFL = `if (uReflOn > 0.5 && hWetK > 0.01 && abs(vWPos.y - uReflY) < 0.6) { vec4 rc = uReflVP * vec4(vWPos.x, uReflY, vWPos.z, 1.0); vec2 ruv = rc.xy / rc.w * 0.5 + 0.5; ruv += (hWN.xz) * 0.02; vec3 V = normalize(cameraPosition - vWPos); float fr = 0.03 + 0.97 * pow(1.0 - max(V.y, 0.0), 5.0); if (ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) totalEmissiveRadiance += texture2D(uReflTex, ruv).rgb * fr * hWetK * 0.85; }`;

function hooks(kind, Q) {
  const std = Q.pbr, hi = Q.tier === 'high'; let fAlb = `#ifdef USE_COLOR_ALPHA\n hAO = vColor.a;\n#endif\n hWN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));\n` + (kind === 'ctx' ? '' : ` hSunK = hBirdSun(vWPos + hWN * 0.004);\n`), fEm = F_LAMP, fRough = '', fNormal = '';
  if (kind === 'bld') {
    fAlb += `{ float mag = 1.0 / max(1e-5, length(fwidth(vMapUv * uTexSize))); float k = ss(1.2, 5.0, mag);
      vec2 tp = abs(hWN.y) > 0.6 ? vWPos.xz : (abs(hWN.x) > abs(hWN.z) ? vWPos.zy : vWPos.xy);
      // grain for magnified walls only (most wall pixels skip it). Each octave is turned by a different angle: axis-aligned octaves added up to a canvas-like weave.
      // An octave fades out before it gets close to pixel size, otherwise the bump turns into a screen-door pattern.
      float g = 0.0, streak = 0.0, fw = max(fwidth(tp.x), fwidth(tp.y));
      if (k > 0.02) { vec2 t1 = mat2(0.80, 0.60, -0.60, 0.80) * tp, t2 = mat2(-0.35, 0.94, -0.94, -0.35) * tp, t3 = mat2(0.52, -0.85, 0.85, 0.52) * tp;
        g = (vnoise(t1 * 47.0) - 0.5) * 0.5 * OCT(47.0) + (vnoise(t2 * 131.0 + 3.1) - 0.5) * 0.32 * OCT(131.0) + (vnoise(t3 * 380.0 + 7.3) - 0.5) * 0.18 * OCT(380.0);
        streak = (vnoise(vec2(tp.x * 210.0 + vnoise(tp * 6.0) * 2.0, tp.y * 7.0)) - 0.5) * (0.6 + 0.8 * vnoise(tp * 1.7)) * OCT(210.0); }
#ifdef USE_MAP
      if (k > 0.02) { vec2 px = 0.75 / uTexSize; vec3 ctr = texture2D(map, vMapUv).rgb, nb = (texture2D(map, vMapUv + vec2(px.x, 0.0)).rgb + texture2D(map, vMapUv - vec2(px.x, 0.0)).rgb + texture2D(map, vMapUv + vec2(0.0, px.y)).rgb + texture2D(map, vMapUv - vec2(0.0, px.y)).rgb) * 0.25;
${hi ? `        vec3 cr = hCR(map, vMapUv, uTexSize);   // magnified photo: Catmull-Rom instead of bilinear (no stair-steps along edges), then a mild unsharp mask
        diffuseColor.rgb *= clamp(mix(vec3(1.0), (cr + (cr - nb) * 0.9) / max(ctr, vec3(0.02)), k), 0.4, 2.0); }` : `        diffuseColor.rgb *= clamp(1.0 + (ctr - nb) / max(ctr, vec3(0.03)) * 1.25 * k, 0.45, 1.8); }`}
#endif
      diffuseColor.rgb *= 1.0 + (g * 0.13 + streak * 0.04) * k; hBump = (g + streak * 0.35) * k;
      float up = ss(0.75, 0.95, hWN.y); diffuseColor.rgb *= mix(1.0, 0.78, uWet * up); }\n`;
    fEm += `{ vec3 c = diffuseColor.rgb; float warm = ss(0.24, 0.46, c.r - max(c.g, c.b) * 1.25) * ss(0.30, 0.62, c.r) * (1.0 - ss(0.80, 1.0, hWN.y)); totalEmissiveRadiance += c * warm * uNight * 0.3; }`;
    fEm += `{ if (uNight > 0.01 && abs(hWN.y) < 0.35) { vec2 hn = normalize(hWN.xz + 1e-5); vec2 wp = vec2(dot(vWPos.xz, vec2(-hn.y, hn.x)) / 1.7, (vWPos.y + 1.2) / 2.9); vec2 id = floor(wp), f = fract(wp); float lit = step(0.70, h21(id + dot(floor(hn * 1.5 + 0.5), vec2(3.0, 7.0)) * 13.7)); float m = ss(0.16, 0.24, f.x) * (1.0 - ss(0.76, 0.84, f.x)) * ss(0.28, 0.36, f.y) * (1.0 - ss(0.70, 0.78, f.y)); vec3 wc = mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.80, 0.52), h21(id + 3.1)); totalEmissiveRadiance += wc * lit * m * uNight * 0.85 * ss(45.0, 120.0, vViewPosition.z) * (0.55 + 0.45 * h21(id + 7.0)); } }`;
    if (std) fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.004);`;
  } else if (kind === 'road') {
    fAlb += `{ vec2 dir = normalize(vColor.rg * 2.0 - 1.0 + 1e-4); vec2 p = vec2(dot(vWPos.xz, dir), dot(vWPos.xz, vec2(-dir.y, dir.x)));
      vec2 q = p / vec2(0.62, 0.31); float row = floor(q.y); q.x += 0.5 * mod(row, 2.0) + 0.13 * h21(vec2(row, 3.0)); vec2 id = floor(q), f = fract(q);
      float edge = min(min(f.x, 1.0 - f.x) * 0.62, min(f.y, 1.0 - f.y) * 0.31); float joint = 1.0 - ss(0.003, 0.011, edge);
      // every detail fades before it gets smaller than a pixel (unfiltered speckle turned into moire rings on the paving)
      float fwp = max(fwidth(p.x), fwidth(p.y)), fw = fwp; float lod = 1.0 - ss(0.012, 0.06, fwp); joint *= 1.0 - ss(0.03, 0.14, fwp);
      float tone = 1.0 + (h21(id) - 0.42) * 0.3 * (1.0 - ss(0.06, 0.26, fwp)); float sp = mix(0.5, h21(floor(vWPos.xz * 380.0)), 1.0 - ss(0.0008, 0.0026, fwp)); float cl = vnoise(vWPos.xz * 3.1);
      float lf = min(log2(0.26 / max(fwp, 1e-4)), 8.5), l0 = floor(lf), lfr = lf - l0, f0 = exp2(l0), grain = mix(vnoise(vWPos.xz * f0 + 13.1), vnoise(vWPos.xz * f0 * 2.0 + 13.1), lfr) - 0.5;
      vec3 stone = vec3(0.47, 0.455, 0.43) * tone * (1.0 + 0.2 * (vnoise(vWPos.xz * 28.0) - 0.5) * OCT(28.0)) * (0.93 + 0.14 * sp) * (1.0 + grain * 0.20 + (vnoise(vWPos.xz * 11.0 + 3.7) - 0.5) * 0.16 * OCT(11.0)); stone = mix(stone, stone * vec3(0.8, 0.84, 0.78), ss(0.55, 0.9, cl) * 0.6);
      diffuseColor.rgb = mix(stone, vec3(0.13, 0.125, 0.12), joint); hBump = (-joint * 1.6 + (sp - 0.5) * 0.25 + vnoise(vWPos.xz * 60.0) * 0.3 * OCT(60.0)) * lod + grain * 0.12;
      float pud = ss(0.35, 0.75, vnoise(vWPos.xz * 0.9) * 0.7 + vnoise(vWPos.xz * 2.7) * 0.3 + joint * 0.25); hWetK = uWet * mix(0.35, 1.0, pud) * ss(0.6, 0.9, hWN.y);
      diffuseColor.rgb *= mix(1.0, 0.55, hWetK); }\n`;
    fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.006 * (1.0 - 0.8 * hWetK)); hWN = inverseTransformDirection(normal, viewMatrix);`;
    fRough = F_WET_ROUGH; fEm += F_WET_REFL;
  } else if (kind === 'ground') {
    const peb = std ? `
      float op = OCT(64.0);
      if (op > 0.001 && green < 0.9) { vec2 q = p * 64.0, iq = floor(q), fq = fract(q); float md = 9.0; vec2 mid = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), id = iq + g; float pr = step(0.58, h21(id + 5.1)); vec2 r = g + vec2(h21(id), h21(id + 17.3)) - fq; float d = dot(r, r) + (1.0 - pr) * 9.0; if (d < md) { md = d; mid = id; } }
        float rad = 0.20 + 0.22 * h21(mid + 2.2); float dome = 1.0 - ss(0.0, rad * rad, md); float pt = h21(mid + 9.4);
        vec3 pc = base * mix(0.68, 1.09, pt) * mix(vec3(1.0), vec3(1.10, 0.96, 0.84), step(0.78, h21(mid + 3.3))); pc = mix(pc, vec3(dot(pc, vec3(0.333))), 0.35);
        float pk = ss(0.0, 0.3, dome) * op * (1.0 - green); c = mix(c, pc, pk * 0.9); hgt += dome * 0.6 * op * (1.0 - green); }` : '';
    const bankBlk = std ? `
      if (bank > 0.02 && green < 0.98) { float os = OCT(9.0) * ss(0.0035, 0.0095, fw);
        if (os > 0.001) { vec2 q = p * 4.5, iq = floor(q), fq = fract(q); float pr = step(0.70, h21(iq + 5.1));
          vec2 ctr = 0.32 + 0.34 * vec2(h21(iq + 1.7), h21(iq + 9.2)); float rad = 0.055 + 0.115 * h21(iq + 3.3); vec2 ell = vec2(1.0, 0.75 + 0.6 * h21(iq + 4.4));
          vec2 dv = (fq - ctr) * ell; float wob = 1.0 + 0.35 * (vnoise(fq * 6.0 + iq * 3.7) - 0.5), d = length(dv) * wob;
          vec2 sdir = normalize(uSunDir.xz + 1e-4); float sunUp = ss(0.03, 0.22, uSunDir.y) * (1.0 - uNight); vec2 sh = sdir * rad * 0.8 * clamp(1.6 * (1.0 - uSunDir.y), 0.35, 1.0);
          float sIn = (1.0 - ss(rad * 0.75, rad, d)) * pr, sk = sIn * os * bank, rim = ((1.0 - ss(rad, rad * 1.5, d)) * pr - sIn) * os * bank;
          float shd = (1.0 - ss(rad * 0.7, rad * 1.2, length((fq - ctr + sh) * ell) * wob)) * pr * (1.0 - sIn) * os * bank * sunUp; float stn = h21(iq + 6.1);
          vec3 sc = mix(vec3(0.20, 0.195, 0.185), vec3(0.46, 0.445, 0.41), stn) * (0.9 + 0.3 * n3) * (lum * 1.6 + 0.25) * (1.0 + 0.30 * dot(dv / max(d, 1e-4), sdir) * min(1.0, d / rad) * sunUp);
          c = mix(c * (1.0 - 0.22 * rim) * (1.0 - 0.42 * shd), sc, sk * 0.92); hgt += sk * (1.3 - 1.1 * d / rad * d / rad) - rim * 0.3; }
        float n2b = (vnoise(p * 19.0 + 5.5) - 0.5) * OCT(19.0); c *= 1.0 + (n2b * 0.20 + n2 * 0.08) * bank; hgt += n2b * 0.3 * bank;
        float dampK = ss(0.08, 0.30, m0 + m1 * 0.6) * bank; c *= mix(vec3(1.0), vec3(0.80, 0.78, 0.74), dampK * 0.6); }` : '';
    const turfBlk = std ? `
      if (green > 0.002) { float t1 = vnoise(p * 2.1 + 5.3), t2 = vnoise(p * 6.3 + 1.1), t3 = vnoise(p * 19.0 + 3.3);
        float tuft = clamp(t1 * 0.62 + (t2 - 0.5) * 0.42 * OCT(6.3) + (t3 - 0.5) * 0.30 * OCT(19.0) + 0.19, 0.0, 1.0);
        vec3 gcol = mix(vec3(0.050, 0.090, 0.022), vec3(0.17, 0.25, 0.060), ss(0.30, 0.78, tuft));
        float dry = ss(0.50, 0.80, vnoise(p * 0.55 + 9.0) * 0.65 + t2 * 0.35); gcol = mix(gcol, vec3(0.40, 0.36, 0.17), dry * 0.5);
        vec3 gc = mix(base * vec3(1.02, 0.98, 0.66), gcol * (0.55 + 1.6 * lum), 0.6) * (1.0 + 0.55 * gst + n3 * 0.5 + n2 * 0.4 + n4 * 0.4 + grain * 0.30 + grain2 * 0.22);
        c = mix(c, gc, green); hgt = mix(hgt, gst * 0.9 + n3 + (tuft - 0.5) * 0.8, green); }` : `
      c = mix(c, base * vec3(1.02, 0.98, 0.66) * (1.0 + 0.55 * gst + n3 * 0.5 + n2 * 0.4 + n4 * 0.4 + grain * 0.30), green); hgt = mix(hgt, gst * 0.9 + n3, green);`;
    fAlb += `{ vec2 auv = (vWPos.xz - uNavRect.xy) * uNavRect.zw; vec4 nv = texture2D(uNavTex, auv); float inR = step(0.0, auv.x) * step(auv.x, 1.0) * step(0.0, auv.y) * step(auv.y, 1.0); hAO = mix(1.0, nv.r, inR); float bank = nv.g * inR;
      float deckK = bank * ss(1.6, 2.4, vWPos.y); bank *= 1.0 - deckK;   // bridge decks share this material: far above the river, where the terrain itself is river bed
      float dist = vViewPosition.z, near = 1.0 - ss(30.0, 120.0, dist); vec3 base = diffuseColor.rgb; float lum = dot(base, vec3(0.3, 0.59, 0.11));
      vec2 p = vWPos.xz; float fw = max(fwidth(p.x), fwidth(p.y));
      float m0 = vnoise(p * 0.23 + 4.7) - 0.5, m1 = (vnoise(p * 0.9 + 1.3) - 0.5) * OCT(0.9);
      float n1 = (vnoise(p * 2.3) - 0.5) * OCT(2.3), n2 = (vnoise(p * 9.0 + 3.1) - 0.5) * OCT(9.0), n3 = (vnoise(p * 37.0 + 7.7) - 0.5) * OCT(37.0);
      float o4 = OCT(140.0), o5 = OCT(520.0); float n4 = o4 > 0.001 ? (vnoise(p * 140.0) - 0.5) * o4 : 0.0, n5 = o5 > 0.001 ? (vnoise(p * 520.0 + 1.3) - 0.5) * o5 : 0.0;
      // turf where the photo is green. The photo is ~0.5 m per pixel, so its soft edge is re-drawn as a crisp, broken line.
      float gE = base.g - max(base.r, base.b) + m1 * 0.030 + n1 * 0.026 + n2 * 0.018;
      float green = ss(0.022, 0.036, gE);
      base = mix(vec3(lum), base, 0.92) * 0.72;
      // bare ground: patchy tone; on the river bank also damp patches and scattered stones
      float tone = 1.0 + m0 * 0.20 * bank + m1 * mix(0.10, 0.24, bank) + n1 * 0.20 + n2 * 0.16 + n3 * 0.18 + n4 * 0.16 + n5 * 0.14;
      // grain that follows the pixel footprint: two neighbouring octaves cross-faded, so some texture is resolved at every distance
      float lf = min(log2(0.26 / max(fw, 1e-4)), 8.0), l0 = floor(lf), lfr = lf - l0, f0 = exp2(l0);
      float grain = mix(vnoise(p * f0 + 13.1), vnoise(p * f0 * 2.0 + 13.1), lfr) - 0.5, grain2 = mix(vnoise(p * f0 * 0.37 + 31.7), vnoise(p * f0 * 0.74 + 31.7), lfr) - 0.5;
      tone += grain * 0.17 + grain2 * 0.13;
      vec3 c = base * mix(vec3(1.0), vec3(0.99, 0.925, 0.81), bank * 0.85) * tone; float hgt = n3 * 0.45 + n4 * 0.32 + n5 * 0.22 + grain * 0.22;
${bankBlk}${peb}
      float gst = (vnoise(vec2(dot(p, vec2(0.8, 0.6)) * 170.0, dot(p, vec2(-0.6, 0.8)) * 34.0)) + vnoise(vec2(dot(p, vec2(-0.5, 0.86)) * 150.0, dot(p, vec2(0.86, 0.5)) * 30.0)) - 1.0) * 0.5 * OCT(170.0);
${turfBlk}
      // built-up ground: next to the walls and in back alleys the aerial photo shows the roofs above, and elsewhere one of its pixels is half a metre wide.
      // A man-made surface is drawn there instead: always where buildings close in, and near the camera everywhere. The photo still sets most of its tone,
      // so asphalt stays dark and paving stays light.
      float apr = max(1.0 - ss(0.56, 0.80, nv.r), 1.0 - ss(22.0, 64.0, dist)) * inR * (1.0 - bank) * (1.0 - green) * (1.0 - deckK) * ss(0.86, 0.96, hWN.y);
      if (apr > 0.01) { float st = vnoise(p * 1.3 + 21.3);
        vec3 mor = mix(vec3(0.300, 0.296, 0.284), mix(vec3(dot(base, vec3(0.3333))), base, 0.4), 0.62) * (1.0 + m1 * 0.16 + n1 * 0.14 + n2 * 0.12 + n3 * 0.16 + n4 * 0.15 + n5 * 0.12 + grain * 0.20 + grain2 * 0.12);
        mor *= mix(1.0, 0.74, ss(0.48, 0.80, st) * 0.7) * mix(0.80, 1.0, ss(0.28, 0.56, nv.r));   // damp patches; grime builds up towards the walls
        mor = mix(mor, vec3(0.085, 0.105, 0.050), ss(0.62, 0.86, vnoise(p * 3.1 + 11.9)) * (1.0 - ss(0.30, 0.46, nv.r)) * 0.35);   // a little moss in the tightest corners
        c = mix(c, mor, apr); hgt = mix(hgt, n3 * 0.30 + n4 * 0.34 + n5 * 0.24 + grain * 0.24, apr); }
      // Kawabata-dori: the aerial photo smears trees and cars over the carriageway, so asphalt and markings are drawn in code
      float rm = 0.0, rd = deckK; if (nv.a * inR > 0.01 || deckK > 0.01) { float ru = nv.b * 18.0 + 3.0, ra = nv.a * inR, sj = step(ra, 0.8); rm = ss(4.35, 4.65, ru) * (1.0 - ss(18.35, 18.65, ru)) * ss(0.15, 0.42, ra) * ss(0.9, 1.2, vWPos.y); rd = max(rm, deckK);
        float fwm = max(fw, 1e-4), box = mix(1.0 - ss(141.0, 144.0, p.y) * (1.0 - ss(162.0, 165.0, p.y)), 1.0 - ss(110.0, 124.0, p.x), sj), along = mix(p.y, p.x, sj);
#define RLINE(d, hw) (clamp(((hw) - (d)) / fwm + 0.5, 0.0, 1.0) * min(1.0, (hw) * 2.0 / fwm + 0.2))
        float ln = RLINE(min(abs(ru - 8.0), abs(ru - 15.0)), 0.075) * step(fract(along / 10.0), 0.5) * box + RLINE(min(abs(ru - 4.9), abs(ru - 18.1)), 0.075), cen = RLINE(abs(ru - 11.5), 0.10) * box;
        float trk = abs(fract((ru - 4.75) / 3.375) - 0.5), wear = ss(0.10, 0.22, abs(trk - 0.26));
        vec3 asp = vec3(0.074, 0.074, 0.078) * (1.0 + m1 * 0.30 + n1 * 0.25 + n2 * 0.22 + n3 * 0.30 + n4 * 0.28 + grain * 0.32) * mix(0.86, 1.0, wear);
        asp = mix(asp, vec3(0.47, 0.47, 0.45) * (0.85 + 0.4 * n2), min(ln, 1.0) * 0.92); asp = mix(asp, vec3(0.52, 0.36, 0.06), cen * 0.92);
        vec3 walk = vec3(0.235, 0.232, 0.222) * (1.0 + m1 * 0.22 + n1 * 0.2 + n3 * 0.28 + n4 * 0.25 + grain * 0.30);   // the footways of a bridge
        c = mix(c, mix(walk, asp, rm), rd); hgt = mix(hgt, n4 * 0.35 + n5 * 0.25 + grain * 0.25, rd); green *= 1.0 - rd; }
      float lip = ss(0.014, 0.022, gE) * (1.0 - green) * (1.0 - rd); c *= 1.0 - 0.22 * lip;
      float steep = max(ss(0.82, 0.5, hWN.y), ss(0.965, 0.86, hWN.y) * bank * (1.0 - green));
      vec2 mp = vec2(dot(vWPos.xz, vec2(0.7, 0.7)), vWPos.y) / vec2(0.55, 0.3); mp.x += 0.5 * mod(floor(mp.y), 2.0); vec2 mf = fract(mp); float mj = 1.0 - ss(0.02, 0.07, min(min(mf.x, 1.0 - mf.x), min(mf.y, 1.0 - mf.y)));
      float kw = 1.0 - ss(0.02, 0.08, fw); mj *= kw; vec3 wallc = vec3(0.42, 0.41, 0.385) * (0.8 + 0.35 * h21(floor(mp)) * kw) * (0.85 + 0.6 * n2); wallc = mix(wallc, vec3(0.2), mj * 0.8);
      c = mix(c, wallc, steep * near); hBump = mix(hgt, -mj * 1.5 + n2 * 0.4, steep * near);
      float pud = ss(0.4, 0.8, vnoise(vWPos.xz * 0.7) * 0.6 + vnoise(vWPos.xz * 2.3) * 0.4); hWetK = uWet * mix(0.25, 0.9, pud) * ss(0.85, 0.97, hWN.y) * near;
      diffuseColor.rgb = c * mix(1.0, 0.6, max(hWetK, uWet * 0.5)); }\n`;
    fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.0030 * (1.0 - 0.8 * hWetK)); hWN = inverseTransformDirection(normal, viewMatrix);`;
    fRough = F_WET_ROUGH; fEm += F_WET_REFL;
  } else if (kind === 'frnp') {
    fAlb += `{ vec2 tp = abs(hWN.y) > 0.6 ? vWPos.xz : (abs(hWN.x) > abs(hWN.z) ? vWPos.zy : vWPos.xy);
      float gr = vnoise(vec2(tp.x * 70.0 + tp.y * 3.0, tp.y * 6.0)) * 0.6 + vnoise(tp * 190.0) * 0.4 - 0.5; float blot = vnoise(tp * 2.3) - 0.5;
      diffuseColor.rgb = uTint * (1.0 + gr * uGrain + blot * 0.25); hBump = gr; float up = ss(0.7, 0.95, hWN.y);
      if (uTint.r < 0.12) { float fw = max(fwidth(tp.x), fwidth(tp.y)); float gy = texture2D(uLampTex, (vWPos.xz - uLampRect.xy) * uLampRect.zw).g * 16.0 - 8.0, lid = ss(0.90, 0.98, hWN.y) * (1.0 - ss(0.10, 0.30, vWPos.y - gy)); vec2 dq = vec2(tp.x + tp.y, tp.x - tp.y) * 11.0; float tread = (1.0 - ss(0.10, 0.22, abs(fract(dq.x) - 0.5))) * step(0.5, fract(dq.y * 0.5)) * OCT(16.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.235, 0.225, 0.21) * (0.9 + gr * 0.25 + tread * 0.22), lid); hBump += tread * 1.5 * lid; } diffuseColor.rgb *= mix(1.0, 0.7, uWet * up); }\n`;
    if (std) fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.003);`;
  } else if (kind === 'shrub') {
    fAlb += `{ vec2 tp = abs(hWN.y) > 0.6 ? vWPos.xz : (abs(hWN.x) > abs(hWN.z) ? vWPos.zy : vWPos.xy); float fw = max(fwidth(tp.x), fwidth(tp.y));
      float a = vnoise(tp * 3.1), b = vnoise(tp * 13.0 + 4.0) * OCT(13.0), c2 = vnoise(tp * 58.0) * OCT(58.0), d2 = vnoise(tp * 190.0 + 9.0) * OCT(190.0); float lf = b * 0.35 + c2 * 0.4 + d2 * 0.25;
      vec3 g1 = vec3(0.035, 0.085, 0.022), g2 = vec3(0.13, 0.22, 0.05), g3 = vec3(0.30, 0.25, 0.06); vec3 col = mix(g1, g2, ss(0.2, 0.75, lf + a * 0.3)); col = mix(col, g3, ss(0.72, 0.9, a) * 0.5 * ss(0.3, 0.6, c2));
      diffuseColor.rgb = col; hBump = lf * 2.2; hAO *= mix(0.55, 1.0, ss(0.15, 0.6, lf)); float up = ss(0.7, 0.95, hWN.y); diffuseColor.rgb *= mix(1.0, 0.8, uWet * up); }\n`;
    if (std) fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.02);`;
  } else if (kind === 'cloth') {
    // people: aFace.w = material (0 cloth, 1 skin, 2 hair, 3 shoe, 4 sole, 5 open jacket, 6 kimono); patterns are anchored to the bind pose so they move with the body
    fAlb += `{ float mt = floor(vFace.w + 0.5); vec3 bp = vBind; float fw = max(max(fwidth(bp.x), fwidth(bp.y)), fwidth(bp.z)); vec2 tp = vec2(bp.x + bp.z * 0.7, bp.y);
      if (mt < 0.5 || mt > 4.5) {
        if (mt > 5.5) { // kimono: a scatter of small flowers, lighter than the cloth
          vec2 kp = vec2(atan(bp.x, bp.z) * 0.17, bp.y) / (0.085 * vFace.y), ki = floor(kp), kf = fract(kp) - 0.5; float kr = h21(ki), kd = length(kf - (vec2(h21(ki + 3.7), h21(ki + 9.1)) - 0.5) * 0.5);
          float pet = 0.5 + 0.5 * cos(atan(kf.y, kf.x) * 5.0 + kr * 6.0), fl = (1.0 - ss(0.10 + 0.06 * pet, 0.14 + 0.07 * pet, kd)) * step(0.45, kr) * (1.0 - ss(0.004, 0.012, fw));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.72, 0.68, 0.62), diffuseColor.rgb * 2.2 + 0.08, step(0.75, kr)), fl * 0.85); }
        if (mt > 4.5) { float sc = vFace.y, y = bp.y / sc, hw = 0.014 + 0.050 * ss(1.10, 1.42, y), d = abs(bp.x / sc) - hw, on = step(0.0, bp.z) * step(vFace.z + 0.025, y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(vFace.x), (1.0 - ss(-0.0015, 0.0015, d)) * on); diffuseColor.rgb *= 1.0 - 0.5 * (1.0 - ss(0.0, 0.007, abs(d + 0.002))) * on; }
        float wv = (vnoise(tp * vec2(1100.0, 700.0)) - 0.5) * OCT(1100.0) + (vnoise(tp * 95.0) - 0.5) * 0.7 * OCT(95.0);
        float fd = vnoise(vec2(bp.y * 10.0 + bp.x * 4.0, (bp.x - bp.z) * 7.0)) * 0.65 + vnoise(vec2(bp.y * 23.0 - bp.z * 9.0, (bp.x + bp.z) * 15.0)) * 0.35 - 0.5;
        diffuseColor.rgb *= 1.0 + wv * 0.20 + fd * 0.10 * OCT(23.0); hBump = wv * 0.5 + fd * 2.4 * OCT(23.0);
      } else if (mt < 1.5) {
        diffuseColor.rgb *= 1.0 + (vnoise(tp * 70.0) - 0.5) * 0.07 * OCT(70.0);
        if (vFace.z > 0.0) { vec2 q = vFace.xy; float k = ss(0.30, 0.62, vFace.z), ax = abs(q.x), bx = ax - 0.42;
          vec2 ey = vec2(ax - 0.40, q.y - 0.045); float eh = 0.047 * max(0.0, 1.0 - pow(ey.x / 0.178, 2.0)) + 0.0005, eo = (1.0 - ss(0.80, 1.0, abs(ey.y + 0.004) / eh)) * step(abs(ey.x), 0.178);   // almond opening
          float ir = length(ey / vec2(0.078, 0.050)), iris = (1.0 - ss(0.86, 1.0, ir)) * eo, pup = (1.0 - ss(0.36, 0.46, ir)) * eo, hi = (1.0 - ss(0.10, 0.20, length((ey - vec2(sign(q.x) * 0.024 * sign(q.x) - 0.022, 0.016)) / vec2(0.078, 0.050)))) * eo;
          float lash = (1.0 - ss(0.0, 0.016, abs(ey.y + 0.004 - eh * 0.96))) * step(abs(ey.x), 0.20) * step(0.0, ey.y + 0.02), eye = 0.0, wht = 0.0;
          float lid = 1.0 - ss(0.4, 1.25, length(vec2(ax - 0.40, q.y - 0.12) / vec2(0.27, 0.12)));
          float brow = 1.0 - ss(0.70, 1.10, length(vec2(bx, q.y - 0.245 + 0.9 * bx * bx - 0.04 * bx) / vec2(0.215, 0.034)));
          float mouth = 1.0 - ss(0.70, 1.10, length(vec2(q.x, q.y + 0.545) / vec2(0.26, 0.030)));
          float lip = 1.0 - ss(0.35, 1.10, length(vec2(q.x, q.y + 0.56) / vec2(0.25, 0.085)));
          float nost = 1.0 - ss(0.5, 1.1, length(vec2(ax - 0.085, q.y + 0.335) / vec2(0.055, 0.030)));
          float cheek = 1.0 - ss(0.2, 1.1, length(vec2(ax - 0.52, q.y + 0.22) / vec2(0.30, 0.22)));
          vec3 c = diffuseColor.rgb; c = mix(c, c * vec3(1.04, 0.86, 0.84), cheek * 0.35 * k); c = mix(c, c * vec3(0.93, 0.60, 0.58), lip * 0.55 * k); c *= 1.0 - lid * 0.26 * k; c = mix(c, vec3(0.030, 0.024, 0.020), brow * 0.62 * k);
          c = mix(c, vec3(0.66, 0.63, 0.60) * (0.62 + 0.38 * ss(-0.5, 0.6, -ey.y / eh)), eo * k); c = mix(c, vec3(0.085, 0.050, 0.032) * (1.0 + 0.9 * ss(0.45, 0.95, ir)), iris * k); c = mix(c, vec3(0.008), pup * k); c = mix(c, vec3(0.85), hi * 0.8 * k); c = mix(c, vec3(0.020, 0.016, 0.014), lash * 0.85 * k); c = mix(c, c * vec3(0.42, 0.26, 0.26), mouth * 0.8 * k); c *= 1.0 - nost * 0.45 * k; diffuseColor.rgb = c; }
        else if (vFace.z < -1.5) { float fy = ss(0.50, 0.62, vFace.y), g = abs(fract(vFace.x * 2.0 + 0.5) - 0.5); diffuseColor.rgb *= 1.0 - 0.5 * fy * (1.0 - ss(0.03, 0.10, g)) * step(abs(vFace.x), 0.8); }
      } else if (mt < 2.5) { float a = atan(bp.x, bp.z); float st = vnoise(vec2(a * 26.0, bp.y * 16.0)) * 0.6 + vnoise(vec2(a * 80.0, bp.y * 34.0)) * 0.4 * OCT(900.0); diffuseColor.rgb *= 0.62 + 0.8 * st; hBump = st * 1.6; }
      else if (mt < 3.5) { diffuseColor.rgb *= 1.0 + (vnoise(tp * 160.0) - 0.5) * 0.12 * OCT(160.0); }
      else { diffuseColor.rgb *= 0.9 + 0.2 * vnoise(tp * 240.0) * OCT(240.0); }
      diffuseColor.rgb *= mix(1.0, 0.75, uWet * ss(0.5, 0.9, hWN.y)); }\n`;
    fRough = `#ifdef STANDARD\n { float mt = floor(vFace.w + 0.5); roughnessFactor = (mt < 0.5 || mt > 4.5) ? 0.94 : mt < 1.5 ? 0.60 : mt < 2.5 ? 0.42 : mt < 3.5 ? 0.50 : 0.85; }\n#endif`;
    if (std) fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.0012);`;
  } else if (kind === 'peb') {
    fAlb += `{ vec2 tp = vWPos.xz * 85.0 + vWPos.y * 41.0; float g = vnoise(tp) * 0.6 + vnoise(tp * 3.3 + 4.0) * 0.4 - 0.5; diffuseColor.rgb *= 1.0 + g * 0.42; hBump = g; diffuseColor.rgb *= mix(1.0, 0.6, uWet); }\n`;
    if (std) fNormal = `normal = hPerturb(-vViewPosition, normal, hBump, 0.0015);`;
  } else if (kind === 'grass') {
    fAlb += `{ float g = vnoise(vWPos.xz * 31.0) - 0.5; diffuseColor.rgb *= 1.0 + g * 0.36; diffuseColor.rgb *= mix(1.0, 0.8, uWet); }\n`;
    // blades are lit as if they faced up on both sides, otherwise every back face turns dark
    fNormal = `#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif`;
  } else if (kind === 'car') {
    // id in colour alpha: 0.5 head lamp, 1 tail lamp, 0.15 bus body (windows, stripes and the destination sign are drawn from the body-local position)
    fAlb += ` hAO = 1.0; float cBus = step(abs(vColor.a - 0.15), 0.04), cGl = 0.0, cSign = 0.0; diffuseColor.rgb /= mix(vec3(1.0), max(vTint, vec3(0.02)), step(0.05, vColor.a) * (1.0 - cBus));
      if (cBus > 0.5) { float y = vCar.y, ax = abs(vCar.x), sd = step(1.16, ax), fr = step(5.2, vCar.z), re = step(5.2, -vCar.z);
        float pil = ss(0.045, 0.06, abs(fract(vCar.z / 1.42 + 0.5) - 0.5) * 1.42), door = ss(0.02, 0.035, abs(vCar.z - 3.2)) * ss(0.02, 0.035, abs(vCar.z + 1.2));
        cGl = sd * ss(1.46, 1.48, y) * (1.0 - ss(2.30, 2.32, y)) * pil * step(abs(vCar.z + 0.2), 4.85) + fr * ss(1.30, 1.33, y) * (1.0 - ss(2.42, 2.45, y)) * step(ax, 1.08) + re * ss(1.65, 1.68, y) * (1.0 - ss(2.34, 2.37, y)) * step(ax, 0.98);
        cSign = (fr * step(ax, 0.78) + re * step(ax, 0.5)) * ss(2.52, 2.55, y) * (1.0 - ss(2.86, 2.89, y));
        float stripe = ss(0.90, 0.92, y) * (1.0 - ss(1.18, 1.20, y)) + ss(1.27, 1.285, y) * (1.0 - ss(1.33, 1.345, y));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.32, 0.55, 0.38), min(stripe, 1.0)); diffuseColor.rgb *= mix(0.55, 1.0, max(door, 1.0 - sd * step(0.5, y)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.04, 0.05), min(cGl, 1.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), cSign); diffuseColor.rgb *= mix(1.0, 0.25, step(y, 0.52)); }\n`;
    fEm += `{ float id = vColor.a; vec3 lc = id > 0.75 ? vec3(1.0, 0.05, 0.03) : vec3(1.0, 0.93, 0.78); totalEmissiveRadiance += lc * step(0.25, id) * (0.2 + 2.8 * uNight);
      totalEmissiveRadiance += vec3(1.0, 0.86, 0.62) * min(cGl, 1.0) * uNight * 0.55 + vec3(1.0, 0.55, 0.12) * cSign * (0.35 + 1.4 * uNight) * step(0.35, vnoise(vCar.xy * vec2(26.0, 9.0))); }`;
  } else if (kind === 'ctx') { fEm = `totalEmissiveRadiance += diffuseColor.rgb * uNight * 0.05;` + `{ if (uNight > 0.01 && abs(hWN.y) < 0.35) { vec2 hn = normalize(hWN.xz + 1e-5); vec2 wp = vec2(dot(vWPos.xz, vec2(-hn.y, hn.x)) / 2.4, (vWPos.y + 1.2) / 3.2); vec2 id = floor(wp), f = fract(wp); float lit = step(0.66, h21(id + dot(floor(hn * 1.5 + 0.5), vec2(3.0, 7.0)) * 13.7)); float m = ss(0.16, 0.24, f.x) * (1.0 - ss(0.76, 0.84, f.x)) * ss(0.28, 0.36, f.y) * (1.0 - ss(0.70, 0.78, f.y)); vec3 wc = mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.80, 0.52), h21(id + 3.1)); totalEmissiveRadiance += wc * lit * m * uNight * 0.7 * (0.55 + 0.45 * h21(id + 7.0)); } }`; }
  if (kind !== 'ctx') fAlb += ` hAO *= hBirdAO(vWPos, hWN.y);\n`;
  if (kind === 'bld') fAlb += ` diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.06, 0.06, 0.062));\n`;
  // LOD2 facades come from oblique aerial photos, mostly taken in shade: lift the darkest texels toward a plausible wall albedo so they read as walls, not black blocks
  if (kind === 'bld') fAlb += ` if (uLift > 0.5) { float lL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.17 / max(lL, 0.02)), ss(0.17, 0.03, lL) * 0.78); }\n`;
  // LOD2 buildings inside the stage: their roof textures are much darker than the photographed ground around them, so from above the blocks read as charcoal boxes.
  // The roof takes its hue and level from the aerial photograph and keeps the light and dark of its own texture.
  if (kind === 'bld') fAlb += ` if (uLift > 0.5 && uOrthoOn > 0.5) { float roof = ss(0.45, 0.75, hWN.y); if (roof > 0.01) { vec3 oc = texture2D(uOrtho, (vWPos.xz - uOrthoRect.xy) * uOrthoRect.zw).rgb; float l = dot(oc, vec3(0.3, 0.5, 0.2)), tl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); vec3 rc = clamp(mix(vec3(l), oc, 1.25) * 1.7 + 0.02, 0.04, 0.8); diffuseColor.rgb = mix(diffuseColor.rgb, rc * clamp(0.55 + 0.45 * tl / 0.17, 0.7, 1.35), roof * 0.72); } }\n`;
  if (kind === 'ctx') fAlb += ` diffuseColor.rgb = mix(max(diffuseColor.rgb, vec3(0.07)), vec3(0.34, 0.33, 0.32), 0.3);
    // The surrounding buildings are LOD2 boxes with one colour each. Seen from above they were plain grey: their roofs now take the colour they have in the aerial
    // photograph (GSI seamless photo, the same picture that lies on the ground), with tile courses on pitched roofs, and their walls get rows of windows.
    { float roof = ss(0.45, 0.75, hWN.y), fwc = max(fwidth(vWPos.x), fwidth(vWPos.z));
      if (roof > 0.01) { vec3 rc = diffuseColor.rgb; if (uOrthoOn > 0.5) { vec3 oc = texture2D(uOrtho, (vWPos.xz - uOrthoRect.xy) * uOrthoRect.zw).rgb; float l = dot(oc, vec3(0.3, 0.5, 0.2)); rc = clamp(mix(vec3(l), oc, 1.25) * 1.7 + 0.02, 0.04, 0.8); }   // the photograph is darker than the roofs' own reflectance; the factor brings them level with the photographed ground around them
        rc *= 0.92 + 0.16 * vnoise(vWPos.xz * 0.9);
        if (hWN.y < 0.975) { vec2 dn = normalize(hWN.xz + 1e-5); float across = dot(vWPos.xz, vec2(-dn.y, dn.x)), k = 1.0 - ss(0.05, 0.16, fwc);
          rc *= 1.0 + 0.15 * sin(across * 22.4) * k; hAO *= 1.0 - 0.10 * k * (0.5 + 0.5 * sin(across * 22.4 + 1.6)); }
        diffuseColor.rgb = mix(diffuseColor.rgb, rc, roof); }
      if (abs(hWN.y) < 0.35) { vec2 hn = normalize(hWN.xz + 1e-5); vec2 wp = vec2(dot(vWPos.xz, vec2(-hn.y, hn.x)) / 2.4, (vWPos.y + 1.2) / 3.2), f = fract(wp); float fww = max(fwidth(wp.x), fwidth(wp.y));
        float m = ss(0.16, 0.24, f.x) * (1.0 - ss(0.76, 0.84, f.x)) * ss(0.28, 0.36, f.y) * (1.0 - ss(0.70, 0.78, f.y)) * (1.0 - ss(0.25, 0.7, fww)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.075), m * 0.5); } }\n`;
  fEm += `{ float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0); totalEmissiveRadiance += uHor * fr * 0.11 * (1.0 - uNight); }`;
  return { key: kind + (std ? 's' : 'l') + (hi && kind === 'bld' ? 'h' : ''), sunK: kind !== 'ctx', vPars: V_PARS + (kind === 'grass' ? ' uniform float uTime;' : '') + (kind === 'cloth' ? ' attribute vec4 aFace; attribute vec3 aBind; varying vec4 vFace; varying vec3 vBind;' : '') + (kind === 'car' ? ' varying vec3 vCar; varying vec3 vTint;' : ''), vBegin: kind === 'grass' ? GRASS_VB : kind === 'cloth' ? 'vFace = aFace; vBind = aBind;' : kind === 'car' ? 'vCar = position;\n#ifdef USE_INSTANCING_COLOR\n vTint = instanceColor.xyz;\n#else\n vTint = vec3(1.0);\n#endif' : undefined, vEnd: V_END, fPars: F_PARS + (kind === 'cloth' ? 'varying vec4 vFace; varying vec3 vBind;\n' : '') + (kind === 'car' ? 'varying vec3 vCar; varying vec3 vTint;\n' : '') + (kind === 'bld' ? 'uniform vec2 uTexSize; uniform float uLift;\n' + (hi ? HCR : '') : '') + (kind === 'frnp' ? 'uniform vec3 uTint; uniform float uGrain;\n' : '') + (kind === 'ground' ? 'uniform sampler2D uNavTex; uniform vec4 uNavRect; uniform vec3 uSunDir;\n' : ''), fAlbedo: fAlb, fRough, fNormal, fEmissive: fEm, fAO: F_AO, fFinal: F_FINAL };
}
const sharedU = () => ({ uHor: U.uHor, uBSh: U.uBSh, uBShM: U.uBShM, uBShP: U.uBShP, uBAO: U.uBAO, uBAOM: U.uBAOM, uBAOP: U.uBAOP, uTime: U.uTime, uNight: U.uNight, uWet: U.uWet, uLampTex: U.uLampTex, uLampRect: U.uLampRect, uLampCol: U.uLampCol, uReflTex: U.uReflTex, uReflVP: U.uReflVP, uReflOn: U.uReflOn, uReflY: U.uReflY, uOrtho: U.uOrtho, uOrthoRect: U.uOrthoRect, uOrthoOn: U.uOrthoOn });
export function cityMaterial(kind, Q, opts = {}) {
  const M = Q.pbr ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial; const p = { vertexColors: true, ...(opts.params || {}) };
  if (Q.pbr) { p.roughness = opts.rough ?? 0.86; p.metalness = 0; p.envMapIntensity = opts.env ?? 0.55; }
  const m = new M(p); return patchMaterial(m, hooks(kind, Q), { ...sharedU(), ...(opts.uniforms || {}) });
}

// ------------------------------------------------------------------ sun / sky model (Kyoto, mid November)
const KEYS = [ // sun elevation (deg): zenith, horizon, sun colour, sun intensity, hemisphere intensity, exposure
  [-18, [0.0050, 0.008, 0.022], [0.046, 0.038, 0.038], [0.55, 0.65, 1.0], 0.0, 0.24, 2.5],
  [-10, [0.010, 0.018, 0.060], [0.062, 0.054, 0.085], [0.6, 0.7, 1.0], 0.0, 0.26, 2.1],
  [-5, [0.035, 0.065, 0.19], [0.46, 0.25, 0.22], [1.0, 0.5, 0.3], 0.0, 0.34, 1.55],
  [-1, [0.075, 0.13, 0.34], [0.95, 0.43, 0.20], [1.0, 0.42, 0.16], 0.35, 0.55, 1.25],
  [2, [0.10, 0.17, 0.42], [1.00, 0.52, 0.25], [1.0, 0.50, 0.22], 1.5, 0.72, 1.1],
  [7, [0.12, 0.22, 0.52], [0.92, 0.66, 0.42], [1.0, 0.70, 0.42], 2.7, 0.9, 1.0],
  [16, [0.11, 0.26, 0.62], [0.68, 0.72, 0.80], [1.0, 0.86, 0.68], 3.3, 1.0, 0.95],
  [35, [0.09, 0.25, 0.66], [0.56, 0.70, 0.90], [1.0, 0.95, 0.86], 3.6, 1.05, 0.9],
];
export function sunPosition(hour) { // local solar geometry for 35.005N 135.772E on 10 Oct (JST): the Kamo dining platforms stand until 15 Oct
  const lat = 35.005 * DEG, decl = -6.6 * DEG, noon = 12 - 0.214 - 0.051; const H = (hour - noon) * 15 * DEG;
  const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H), el = Math.asin(sinE);
  let az = Math.atan2(-Math.sin(H), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(H)); // from north, clockwise
  return { el, az, dir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)) };
}
export class Env {
  constructor(scene, Q) {
    this.Q = Q; this.scene = scene; this.hour = 16.2; this.exposure = 1; this.sunI = 3; this.lampOn = 0;
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = Q.shadow > 0; scene.add(this.sun); scene.add(this.sun.target);
    if (Q.shadow) { const s = this.sun.shadow; s.mapSize.set(Q.shadow, Q.shadow); s.camera.near = 10; s.camera.far = 900; const r = Q.shadowRange; s.camera.left = -r; s.camera.right = r; s.camera.top = r; s.camera.bottom = -r; s.bias = -0.0004; s.normalBias = 0.06; s.radius = 2.2; }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0); scene.add(this.moon);
    scene.fog = new THREE.FogExp2(0x9fb4d0, 0.0007);
    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uSunDir: U.uSunDir, uSunCol: U.uSunCol, uHor: U.uHor, uZen: U.uZen, uNight: U.uNight, uTime: U.uTime, uNoise: U.uNoise, uCloud: U.uCloud, uMoonDir: U.uMoonDir, uSunI: { value: 1 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 100.0, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: `precision highp float; varying vec3 vDir; uniform vec3 uSunDir, uSunCol, uHor, uZen, uMoonDir; uniform float uNight, uTime, uCloud, uSunI; uniform sampler2D uNoise;
        float h31(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
        void main(){ vec3 d = normalize(vDir); float e = d.y; float t = pow(1.0 - max(e, 0.0), 3.2); vec3 col = mix(uZen, uHor, t);
          float mu = max(dot(d, uSunDir), 0.0); float up = ss(-0.14, 0.02, uSunDir.y);
          float anti = max(dot(d, -normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0); col += vec3(0.20, 0.07, 0.11) * pow(anti, 3.0) * t * (1.0 - ss(0.05, 0.25, abs(uSunDir.y))) * 0.7;
          col += uSunCol * uSunI * (pow(mu, 6.0) * 0.045 + pow(mu, 48.0) * 0.10 + pow(mu, 700.0) * 0.7) * up * (0.35 + 0.65 * t);
          col += uSunCol * (uSunI + 0.4) * ss(0.99988, 0.99996, dot(d, uSunDir)) * 14.0 * step(-0.01, e);
          float mm = dot(d, uMoonDir); col += vec3(0.75, 0.82, 1.0) * (ss(0.99975, 0.9999, mm) * 1.6 + pow(max(mm, 0.0), 300.0) * 0.06) * uNight;
          if (uNight > 0.02 && e > 0.0) { vec3 p = d * 220.0; vec3 ip = floor(p); float st = h31(ip); float tw = 0.75 + 0.25 * sin(uTime * (1.5 + st * 4.0) + st * 60.0); col += vec3(0.9, 0.95, 1.0) * step(0.9990, st) * ss(0.9, 0.2, length(fract(p) - 0.5)) * tw * uNight * 0.55 * ss(0.05, 0.45, e); }
          if (e > 0.005) { vec2 uv = d.xz / (e + 0.11) * 0.22 + uTime * vec2(0.0018, 0.0006); float n = texture2D(uNoise, uv * 0.23).r * 0.55 + texture2D(uNoise, uv * 0.61 + 0.37).g * 0.3 + texture2D(uNoise, uv * 1.7 + 0.11).b * 0.15;
            float c = ss(1.0 - uCloud, 1.0 - uCloud + 0.3, n); float thick = ss(1.0 - uCloud + 0.05, 1.0 - uCloud + 0.5, n);
            vec3 lit = uSunCol * uSunI * 0.30 * (0.5 + 2.4 * pow(mu, 5.0)) + uHor * 0.75 + uZen * 0.35; vec3 dark = uZen * 0.55 + uHor * 0.30; vec3 cc = mix(lit, dark, thick * 0.75) + vec3(0.02, 0.022, 0.03) * uNight;
            col = mix(col, cc, c * ss(0.005, 0.16, e) * 0.92); }
          col = mix(col, uHor * 0.55, ss(0.0, -0.3, e));
          gl_FragColor = vec4(col, 1.0e4); }` }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -1000; scene.add(this.sky);
    this.setHour(this.hour);
  }
  setHour(h) {
    this.hour = ((h % 24) + 24) % 24; const sp = sunPosition(this.hour), eDeg = sp.el / DEG; let a = KEYS[0], b = KEYS[KEYS.length - 1], t = 0;
    if (eDeg <= KEYS[0][0]) { a = b = KEYS[0]; } else if (eDeg >= b[0]) { a = b; } else for (let i = 0; i < KEYS.length - 1; i++) if (eDeg >= KEYS[i][0] && eDeg < KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; t = (eDeg - a[0]) / (b[0] - a[0]); break; }
    const L = (i, k) => lerp(a[i][k], b[i][k], t);
    U.uZen.value.setRGB(L(1, 0), L(1, 1), L(1, 2)); U.uHor.value.setRGB(L(2, 0), L(2, 1), L(2, 2)); U.uSunCol.value.setRGB(L(3, 0), L(3, 1), L(3, 2));
    this.sunI = lerp(a[4], b[4], t); const hemiI = lerp(a[5], b[5], t); this.exposure = lerp(a[6], b[6], t);
    U.uSunDir.value.copy(sp.dir); const night = 1 - smooth(-9, -1.5, eDeg); U.uNight.value = night; this.night = night; this.elev = eDeg;
    this.sun.color.copy(U.uSunCol.value); this.sun.intensity = this.sunI; this.sky.material.uniforms.uSunI.value = this.sunI;
    this.moon.intensity = 0.16 * night; this.moon.position.copy(U.uMoonDir.value).multiplyScalar(300);
    const day = smooth(0.4, 2.8, this.sunI); this.exposure *= lerp(1.0, 1.24, day); this.hemi.color.copy(U.uZen.value).lerp(U.uHor.value, 0.55).multiplyScalar(lerp(2.6, 1.9, day)); this.hemi.groundColor.copy(U.uHor.value).multiplyScalar(0.55).lerp(new THREE.Color(0.30, 0.26, 0.21).multiplyScalar(this.sunI * 0.48 + 0.02), 0.5); this.hemi.intensity = hemiI;
    this.scene.fog.color.copy(U.uHor.value).multiplyScalar(0.8).lerp(U.uZen.value, 0.25); this.scene.fog.density = lerp(0.00055, 0.0011, smooth(8, -2, eDeg));
    this.lampOn = smooth(1.5, -2.5, eDeg);
  }
  update(focus, dt, move = true) {
    this.sky.position.copy(focus); if (!move) return;
    const d = this.elev > -1 ? U.uSunDir.value : U.uMoonDir.value, s = this.sun; if (this.elev <= -1) { s.intensity = 0.0; }
    if (this.Q.shadow) { const r = this.Q.shadowRange, tex = (2 * r) / this.Q.shadow; // snap focus to shadow texels in light space
      const lx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize(), ly = new THREE.Vector3().crossVectors(d, lx);
      const fx = Math.round(focus.dot(lx) / tex) * tex, fy = Math.round(focus.dot(ly) / tex) * tex, fz = focus.dot(d);
      const c = new THREE.Vector3().addScaledVector(lx, fx).addScaledVector(ly, fy).addScaledVector(d, fz); s.target.position.copy(c); s.position.copy(c).addScaledVector(d, 420); s.target.updateMatrixWorld(); }
    else { s.target.position.copy(focus); s.position.copy(focus).addScaledVector(d, 420); s.target.updateMatrixWorld(); }
  }
}

// ------------------------------------------------------------------ noise texture (tileable fbm in RGB)
function makeNoiseTex() {
  const N = 256, d = new Uint8Array(N * N * 4), rnd = rng(1234);
  const lat = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < n * n; i++) g[i] = rnd(); return g; };
  const samp = (g, n, x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = g[(yi % n) * n + xi % n], b = g[(yi % n) * n + (xi + 1) % n], c = g[((yi + 1) % n) * n + xi % n], e = g[((yi + 1) % n) * n + (xi + 1) % n]; return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + e * sx) * sy; };
  for (let ch = 0; ch < 3; ch++) { const oct = [4, 8, 16, 32, 64].map(n => [n, lat(n)]); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0, amp = 0.5, tot = 0; for (const [n, g] of oct) { v += samp(g, n, x / N * n, y / N * n) * amp; tot += amp; amp *= 0.5; } d[(y * N + x) * 4 + ch] = Math.round(clamp(v / tot, 0, 1) * 255); } }
  for (let i = 0; i < N * N; i++) d[i * 4 + 3] = 255;
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}

// ------------------------------------------------------------------ world
export class World {
  constructor(renderer, scene, Q) { this.r = renderer; this.scene = scene; this.Q = Q; this.meshes = []; this.city = new THREE.Group(); scene.add(this.city); U.uNoise.value = makeNoiseTex();
    const dt = new THREE.DepthTexture(2, 2); dt.compareFunction = THREE.LessEqualCompare; dt.minFilter = dt.magFilter = THREE.LinearFilter; U.uBSh.value = dt; }
  async load(onProg, stage = async () => { }) {
    const Q = this.Q, P = (k, w) => (n, t) => onProg(k, t ? n / t : 0, w);
    const [meta, navPak] = await Promise.all([fetch(asset('d/meta.json')).then(r => r.json()), loadPak('d/nav.txt', P('nav', 3.0), 3024688)]);
    this.meta = meta; this.nav = new Nav(navPak); this.env = new Env(this.scene, Q);
    this.tex = new TexStream(this.r, meta.tex, Q);
    const [corePak] = await Promise.all([loadPak('d/core.txt', P('core', 15.2), 15216300), this.tex.loadBase('t/b.txt', P('tex', 1.15), 1151052)]);
    await stage('light', '街を組み立て中：街灯の明かり'); this._lampTex(); this._lampGlow();
    await stage('city', '街を組み立て中：建物と路地'); this._buildCity(corePak);
    await stage('ground', '街を組み立て中：地面'); this._buildTerrain();
    await stage('water', '街を組み立て中：鴨川'); this._buildWater();
    this.ready = true;
    // background: context buildings + mid textures + far terrain
    this.bg = (async () => { const ctx = await loadPak('d/ctx.txt'); this._buildCtx(ctx); await this.tex.loadMid('t/m.txt'); this._buildFar(); })();
  }
  _geom(pak, it) {
    const g = new THREE.BufferGeometry(), b = it.bb, P = pak.view(Uint16Array, it.pos), nv = it.nv, pos = new Float32Array(nv * 3), sx = (b[3] - b[0]) / 65535, sy = (b[4] - b[1]) / 65535, sz = (b[5] - b[2]) / 65535;
    for (let i = 0; i < nv; i++) { pos[i * 3] = b[0] + P[i * 3] * sx; pos[i * 3 + 1] = b[1] + P[i * 3 + 1] * sy; pos[i * 3 + 2] = b[2] + P[i * 3 + 2] * sz; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(pak.buf, pak.base + it.nor[0], nv * 3), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(pak.view(Uint8Array, it.col), 4, true));
    if (it.uv) g.setAttribute('uv', new THREE.BufferAttribute(pak.view(Uint16Array, it.uv), 2, true));
    g.setIndex(new THREE.BufferAttribute(it.i32 ? pak.view(Uint32Array, it.idx) : pak.view(Uint16Array, it.idx), 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])); g.boundingSphere = new THREE.Sphere(); g.boundingBox.getBoundingSphere(g.boundingSphere); return g;
  }
  _buildCity(pak) {
    const Q = this.Q, TINT = { fence: [[0.19, 0.13, 0.09], 0.5], deck: [[0.36, 0.27, 0.19], 0.45], iron: [[0.09, 0.09, 0.095], 0.2], conc: [[0.46, 0.45, 0.43], 0.25], metal: [[0.20, 0.21, 0.22], 0.15], misc: [[0.33, 0.30, 0.27], 0.3] }; const frnMats = {};
    for (const it of pak.json.items) {
      const g = this._geom(pak, it); let mat;
      if (it.tex) { const e = this.tex.e[it.tex], t = this.meta.tex[it.tex]; mat = cityMaterial('bld', Q, { params: { map: e.tex }, uniforms: { uTexSize: { value: new THREE.Vector2(t.w / 8, t.h / 8) }, uLift: { value: it.tex.startsWith('bldg2') ? 1 : 0 } } }); mat.shadowSide = THREE.DoubleSide; e.mat = mat; }   // both faces cast: with back faces only, the sun leaked in under walls that stop short of the ground
      else if (it.kind === 'frnp') { const c = it.cls || 'misc'; mat = frnMats[c] || (frnMats[c] = cityMaterial('frnp', Q, { rough: c === 'iron' || c === 'metal' ? 0.5 : 0.9, uniforms: { uTint: { value: new THREE.Color(...TINT[c][0]) }, uGrain: { value: TINT[c][1] } } })); }
      else if (it.kind === 'road') mat = this.roadMat || (this.roadMat = cityMaterial('road', Q, { rough: 0.82, env: 0.8 }));
      else if (it.kind === 'bridge') mat = frnMats._br || (frnMats._br = cityMaterial('frnp', Q, { uniforms: { uTint: { value: new THREE.Color(0.40, 0.385, 0.36) }, uGrain: { value: 0.3 } } }));
      else if (it.kind === 'shrub') mat = frnMats._sh || (frnMats._sh = cityMaterial('shrub', Q, { rough: 0.8 }));
      else mat = frnMats._pl || (frnMats._pl = cityMaterial('frnp', Q, { uniforms: { uTint: { value: new THREE.Color(0.36, 0.35, 0.33) }, uGrain: { value: 0.28 } } }));
      const m = new THREE.Mesh(g, mat); m.castShadow = it.kind !== 'road'; m.receiveShadow = true; m.matrixAutoUpdate = false; m.userData.it = it; this.city.add(m); this.meshes.push(m);
    }
    // keep uTexSize in step with the streamed level
    this._texLvl = () => { for (const n in this.tex.e) { const e = this.tex.e[n]; if (e.mat && e.lvl >= 0 && e._l !== e.lvl) { e._l = e.lvl; const t = this.meta.tex[n], k = [8, 4, 2, 1][e.lvl]; e.mat.userData.uniforms.uTexSize.value.set(t.w / k, t.h / k); } } };
  }
  _buildCtx(pak) { const mat = cityMaterial('ctx', this.Q); for (const it of pak.json.items) { const m = new THREE.Mesh(this._geom(pak, it), mat); m.matrixAutoUpdate = false; m.castShadow = false; m.receiveShadow = false; this.city.add(m); } }
  // a soft glow at every lamp head (PLATEAU city furniture whose function is lighting): a billboard that is added to the picture, so the lamps themselves are seen to be lit
  _lampGlow() { const L = this.meta.lamps; if (!L || !L.length) return; const n = L.length, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const l = L[i], hd = Math.min(l[3], 0.7), lit = l.length > 6;   // l[4..6]: where the light sits in the fixture (pipeline/export.mjs); older data has only the box
      a[i * 4] = lit ? l[4] : l[0]; a[i * 4 + 1] = lit ? l[5] : l[1] - hd * 0.5; a[i * 4 + 2] = lit ? l[6] : l[2]; a[i * 4 + 3] = l[3] > 1 ? 0.40 : 0.10 + clamp(l[3], 0.1, 0.5) * 0.6; }
    const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.setAttribute('aLamp', new THREE.InstancedBufferAttribute(a, 4)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uOn: { value: 0 } },
      vertexShader: `attribute vec4 aLamp; varying vec2 vP; void main(){ vP = position.xy; vec4 mv = viewMatrix * vec4(aLamp.xyz, 1.0); mv.xy += position.xy * aLamp.w; mv.z += aLamp.w * 0.8; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; varying vec2 vP; uniform float uOn; void main(){ float r2 = dot(vP, vP); float a = (exp(-r2 * 11.0) * 1.05 + exp(-r2 * 2.6) * 0.20) * (1.0 - smoothstep(0.7, 1.0, r2)) * uOn; gl_FragColor = vec4(vec3(1.0, 0.68, 0.36) * a, 1.0); }` });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; this.scene.add(mesh); this.lampGlow = mesh; }
  _lampTex() { // world-space light pool map (R intensity, G ground height) built from PLATEAU lamp positions
    const nav = this.nav, c = nav.core, W = 512, H = Math.round(512 * c.h / c.w), d = new Float32Array(W * H), out = new Uint8Array(W * H * 4), sx = c.w * c.res / W, sz = c.h * c.res / H;
    for (const L of this.meta.lamps) { const cx = ((L.length > 6 ? L[4] : L[0]) - c.x0) / sx, cz = ((L.length > 6 ? L[6] : L[2]) - c.z0) / sz, hgt = clamp(L[3], 1.2, 7), rad = (5 + hgt * 2.2) / sx, pw = 0.5 + 0.12 * hgt;
      for (let j = Math.max(0, Math.floor(cz - rad)); j <= Math.min(H - 1, Math.ceil(cz + rad)); j++) for (let i = Math.max(0, Math.floor(cx - rad)); i <= Math.min(W - 1, Math.ceil(cx + rad)); i++) { const r = Math.hypot(i - cx, j - cz) / rad; if (r < 1) d[j * W + i] += pw * Math.pow(1 - r, 2.2) / (0.15 + r * r * 3); } }
    // the LOD3 streets (Pontocho, Gion Shirakawa) are lined with shop fronts and lanterns: add a continuous glow along them
    { const g = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (nav.cls(c.x0 + (i + 0.5) * sx, c.z0 + (j + 0.5) * sz) === 2) g[j * W + i] = 1.0;
      for (let pass = 0; pass < 3; pass++) { const t = g.slice(); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const k = j * W + i; g[k] = (t[k] * 2 + t[k - 1] + t[k + 1] + t[k - W] + t[k + W]) / 6; } }
      for (let k = 0; k < W * H; k++) d[k] += g[k] * 0.85; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i, x = c.x0 + (i + 0.5) * sx, z = c.z0 + (j + 0.5) * sz; out[k * 4] = Math.round(255 * Math.sqrt(clamp(d[k] * 0.35, 0, 1))); out[k * 4 + 1] = Math.round(clamp((nav.ground(x, z) + 8) / 16, 0, 1) * 255); out[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; U.uLampTex.value = t; U.uLampRect.value.set(c.x0, c.z0, 1 / (c.w * c.res), 1 / (c.h * c.res));
  }
  _buildTerrain() {
    const nav = this.nav, c = nav.core, Q = this.Q, st = Q.terrainStep, meta = this.meta;
    // nav texture for the ground shader: R = AO
    // G = river bank: low ground near the water (the Kamo promenade sits 1.5-3 m above the river, the streets 5-6 m)
    const NN = c.w * c.h, dW = new Float32Array(NN).fill(1e9), wy = new Float32Array(NN); for (let k = 0; k < NN; k++) if (nav.W[k] !== -32768) { dW[k] = 0; wy[k] = nav.W[k] / 100; }
    const rlx = (k, q, d) => { if (dW[q] + d < dW[k]) { dW[k] = dW[q] + d; wy[k] = wy[q]; } };
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const k = j * c.w + i; if (i > 0) rlx(k, k - 1, 1); if (j > 0) { rlx(k, k - c.w, 1); if (i > 0) rlx(k, k - c.w - 1, 1.414); if (i < c.w - 1) rlx(k, k - c.w + 1, 1.414); } }
    for (let j = c.h - 1; j >= 0; j--) for (let i = c.w - 1; i >= 0; i--) { const k = j * c.w + i; if (i < c.w - 1) rlx(k, k + 1, 1); if (j < c.h - 1) { rlx(k, k + c.w, 1); if (i < c.w - 1) rlx(k, k + c.w + 1, 1.414); if (i > 0) rlx(k, k + c.w - 1, 1.414); } }
    const sm01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }, nd = new Uint8Array(NN * 4);
    for (let k = 0; k < NN; k++) { nd[k * 4] = nav.AO[k]; if (dW[k] < 1e8) nd[k * 4 + 1] = Math.round(255 * (1 - sm01(52, 70, dW[k] * c.res)) * (1 - sm01(3.7, 4.6, nav.G[k] / 100 - wy[k]))); }
    // B = metres across Kawabata-dori (3 .. 21 m from the bank top), A = 1 on the carriageway: the shader paints asphalt and lane markings there
    for (let j = 0; j < c.h; j++) { const z = c.z0 + (j + 0.5) * c.res, e = nav.roadEdge(z), inZ = z > -236 && z < 197; for (let i = 0; i < c.w; i++) { const k = j * c.w + i, d = c.x0 + (i + 0.5) * c.res - e; const x = c.x0 + (i + 0.5) * c.res, kw = inZ && d > 3.6 && d < 19.4, sj = !kw && x > -208.5 && x < 128 && z > 145.35 && z < 161.15;   // Shijo-dori, bridge included, uses the same lane layout turned 90 degrees (A = 0.6)
        nd[k * 4 + 2] = Math.round(255 * clamp(((sj ? z - 141.75 : d) - 3) / 18, 0, 1)); nd[k * 4 + 3] = nav.C[k] >= 2 ? 0 : kw && nav.C[k] === 0 ? 255 : sj ? 153 : 0; } }
    const nt = new THREE.DataTexture(nd, c.w, c.h, THREE.RGBAFormat); nt.magFilter = nt.minFilter = THREE.LinearFilter; nt.needsUpdate = true; this._bank = nd; this._st = st;
    const load = (url, cb) => fetch(asset(url)).then(r => r.blob()).then(b => bitmap(b)).then(bmp => { const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; cb(t, bmp); });
    const mk = (map) => cityMaterial('ground', Q, { rough: 0.93, env: 0.5, params: { map, vertexColors: false }, uniforms: { uNavTex: { value: nt }, uSunDir: U.uSunDir, uNavRect: { value: new THREE.Vector4(c.x0, c.z0, 1 / (c.w * c.res), 1 / (c.h * c.res)) } } });
    // core terrain
    { const nx = Math.floor((c.w - 1) / st), nz = Math.floor((c.h - 1) / st), pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [], B = meta.core;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i, gi = i * st, gj = j * st, x = c.x0 + (gi + 0.5) * c.res, z = c.z0 + (gj + 0.5) * c.res, q = gj * c.w + gi; let y = nav.G[q] / 100; if (nav.C[q] === 2) y -= 0.05; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = clamp((x - B.x0) / (B.x1 - B.x0), 0, 1); uv[k * 2 + 1] = clamp((z - B.z0) / (B.z1 - B.z0), 0, 1); }
      // The terrain is left out under buildings, but only well inside them. The building class of the grid also covers eaves, recessed fronts and passages,
      // where the ground is in view: leaving it out there opened holes onto the sky colour along the foot of the walls.
      const dB = new Float32Array(NN); for (let k = 0; k < NN; k++) dB[k] = nav.C[k] === 3 ? 1e9 : 0;
      { const rl = (k, q, d) => { if (dB[q] + d < dB[k]) dB[k] = dB[q] + d; };
        for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) { const k = j * c.w + i; if (i > 0) rl(k, k - 1, 1); if (j > 0) { rl(k, k - c.w, 1); if (i > 0) rl(k, k - c.w - 1, 1.414); if (i < c.w - 1) rl(k, k - c.w + 1, 1.414); } }
        for (let j = c.h - 1; j >= 0; j--) for (let i = c.w - 1; i >= 0; i--) { const k = j * c.w + i; if (i < c.w - 1) rl(k, k + 1, 1); if (j < c.h - 1) { rl(k, k + c.w, 1); if (i < c.w - 1) rl(k, k + c.w + 1, 1.414); if (i > 0) rl(k, k + c.w - 1, 1.414); } } }
      const DEEP = 6 / c.res, skip = (gi, gj) => dB[gj * c.w + gi] > DEEP;   // more than 6 m from the nearest cell that is not under a building
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; if (skip(i * st, j * st) && skip((i + 1) * st, j * st) && skip(i * st, (j + 1) * st) && skip((i + 1) * st, (j + 1) * st)) continue; idx.push(a, d, b, b, d, e); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mk(null)); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; this.terrain = m; this.scene.add(m); load('t/ortho_core.webp', (t, bmp) => { m.material.map = t; m.material.needsUpdate = true; this._green(bmp); }); }
    // context terrain (coarse), skipping the core rectangle
    { const x = nav.ctx, s2 = 2, nx = Math.floor((x.w - 1) / s2), nz = Math.floor((x.h - 1) / s2), pos = new Float32Array((nx + 1) * (nz + 1) * 3), uv = new Float32Array((nx + 1) * (nz + 1) * 2), idx = [], B = meta.ctx, C = meta.core;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const k = j * (nx + 1) + i, px = x.x0 + (i * s2 + 0.5) * x.res, pz = x.z0 + (j * s2 + 0.5) * x.res; pos[k * 3] = px; pos[k * 3 + 1] = nav.cG[j * s2 * x.w + i * s2] / 100 - 0.12; pos[k * 3 + 2] = pz; uv[k * 2] = (px - B.x0) / (B.x1 - B.x0); uv[k * 2 + 1] = (pz - B.z0) / (B.z1 - B.z0); }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const px = x.x0 + (i * s2 + 0.5) * x.res, pz = x.z0 + (j * s2 + 0.5) * x.res, e = x.res * s2; if (px > C.x0 - 4 && px + e < C.x1 + 4 && pz > C.z0 - 4 && pz + e < C.z1 + 4) continue; const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1; idx.push(a, d, b, b, d, d + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mk(null)); m.receiveShadow = true; m.matrixAutoUpdate = false; this.terrainCtx = m; this.scene.add(m); load('t/ortho_ctx.webp', t => { m.material.map = t; m.material.needsUpdate = true; U.uOrtho.value = t; U.uOrthoRect.value.set(B.x0, B.z0, 1 / (B.x1 - B.x0), 1 / (B.z1 - B.z0)); U.uOrthoOn.value = 1; }); }
  }
  // ---- CPU-side queries for the ground cover (js/cover.js)
  _green(bmp) { // greenness of the aerial photo, linear g - max(r, b): the same measure the ground shader thresholds
    try { const w = Math.min(1024, bmp.width), h = Math.max(1, Math.round(bmp.height * w / bmp.width)), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), lut = new Float32Array(256); for (let k = 0; k < 256; k++) lut[k] = Math.pow(k / 255, 2.2);
      for (let k = 0; k < w * h; k++) g[k] = lut[d[k * 4 + 1]] - Math.max(lut[d[k * 4]], lut[d[k * 4 + 2]]); this.gmap = { w, h, g }; } catch (e) { this.gmap = null; } }
  greenAt(x, z) { const m = this.gmap, B = this.meta.core; if (!m) return -1; const u = (x - B.x0) / (B.x1 - B.x0) * m.w - 0.5, v = (z - B.z0) / (B.z1 - B.z0) * m.h - 0.5; if (u < 0 || v < 0 || u >= m.w - 1 || v >= m.h - 1) return -1;
    const i = u | 0, j = v | 0, a = u - i, b = v - j, k = j * m.w + i, g = m.g; return (g[k] * (1 - a) + g[k + 1] * a) * (1 - b) + (g[k + m.w] * (1 - a) + g[k + m.w + 1] * a) * b; }
  bankAt(x, z) { const c = this.nav.core, i = Math.floor((x - c.x0) / c.res), j = Math.floor((z - c.z0) / c.res); return (!this._bank || i < 0 || j < 0 || i >= c.w || j >= c.h) ? 0 : this._bank[(j * c.w + i) * 4 + 1] / 255; }
  slopeAt(x, z) { const c = this.nav.core, G = this.nav.G, i = Math.floor((x - c.x0) / c.res), j = Math.floor((z - c.z0) / c.res); if (i < 1 || j < 1 || i >= c.w - 1 || j >= c.h - 1) return 1; const k = j * c.w + i; return Math.max(Math.abs(G[k + 1] - G[k - 1]), Math.abs(G[k + c.w] - G[k - c.w])) / 100 / (2 * c.res); }
  groundY(x, z) { // height of the rendered terrain mesh: the same triangles as _buildTerrain, so cover sits exactly on it
    const nav = this.nav, c = nav.core, st = this._st || 2, fx = ((x - c.x0) / c.res - 0.5) / st, fz = ((z - c.z0) / c.res - 0.5) / st, nx = Math.floor((c.w - 1) / st), nz = Math.floor((c.h - 1) / st);
    if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return nav.ground(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, Y = (a, b) => { const q = b * st * c.w + a * st; return nav.G[q] / 100 - (nav.C[q] === 2 ? 0.05 : 0); }, ya = Y(i, j), yb = Y(i + 1, j), yd = Y(i, j + 1), ye = Y(i + 1, j + 1);
    return u + v <= 1 ? ya + (yb - ya) * u + (yd - ya) * v : ye + (yd - ye) * (1 - u) + (yb - ye) * (1 - v); }
  _buildFar() { // distant mountains from the 10 m DEM
    const nav = this.nav, f = nav.far, n = f.n, s = 5, m = Math.floor((n - 1) / s), pos = new Float32Array((m + 1) * (m + 1) * 3), uv = new Float32Array((m + 1) * (m + 1) * 2), idx = [], C = this.meta.ctx, yoff = nav.off; // orthometric -> local
    for (let j = 0; j <= m; j++) for (let i = 0; i <= m; i++) { const k = j * (m + 1) + i, x = f.x0 + (i * s + 0.5) * f.res, z = f.z0 + (j * s + 0.5) * f.res; pos[k * 3] = x; pos[k * 3 + 1] = nav.farH[j * s * n + i * s] / 10 + yoff - 1.5; pos[k * 3 + 2] = z; uv[k * 2] = (i * s + 0.5) / n; uv[k * 2 + 1] = (j * s + 0.5) / n; }
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const x = f.x0 + (i * s + 0.5) * f.res, z = f.z0 + (j * s + 0.5) * f.res, e = f.res * s; if (x > C.x0 + 40 && x + e < C.x1 - 40 && z > C.z0 + 40 && z + e < C.z1 - 40) continue; const a = j * (m + 1) + i, b = a + 1, d = a + m + 1; idx.push(a, d, b, b, d, d + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); patchMaterial(mat, { key: 'far', fFinal: F_FINAL }, {}); const mesh = new THREE.Mesh(g, mat); mesh.matrixAutoUpdate = false; this.scene.add(mesh);
    fetch(asset('t/far.webp')).then(r => r.blob()).then(b => bitmap(b)).then(bmp => { const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; mat.map = t; mat.needsUpdate = true; });
  }
  _buildWater() {
    const nav = this.nav, w = nav.w1, W1 = nav.water1, Q = this.Q, s = 2, pos = [], aux = [], idx = [], vmap = new Map();
    const lvl = (i, j) => { let sum = 0, n = 0; for (let b = -s; b < s; b++) for (let a = -s; a < s; a++) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue; const v = W1[y * w.w + x]; if (v !== -32768) { sum += v; n++; } } return n ? sum / n / 100 : null; };
    const vert = (i, j) => { const key = j * 4096 + i; let v = vmap.get(key); if (v !== undefined) return v; const y = lvl(i, j); if (y === null) return -1; const x = w.x0 + i, z = w.z0 + j; v = pos.length / 3; vmap.set(key, v);
      const yN = lvl(i, j - 4), yS = lvl(i, j + 4), yW = lvl(i - 4, j), yE = lvl(i + 4, j); let fx = (yW ?? y) - (yE ?? y), fz = (yN ?? y) - (yS ?? y); const slope = Math.hypot(fx, fz) / 8; const fl = Math.hypot(fx, fz); if (fl > 0.004) { fx /= fl; fz /= fl; } else { fx = 0.08; fz = 1; }
      const depth = nav.inCore(x, z) ? Math.max(0.02, y - nav.ground(x, z)) : 0.35; pos.push(x, y + 0.015, z); aux.push(fx, fz, depth, slope); return v; };
    for (let j = 0; j + s < w.h; j += s) for (let i = 0; i + s < w.w; i += s) { let any = false; for (let b = 0; b < s && !any; b++) for (let a = 0; a < s; a++) if (W1[(j + b) * w.w + i + a] !== -32768) { any = true; break; } if (!any) continue; const a = vert(i, j), b = vert(i + s, j), c = vert(i, j + s), d = vert(i + s, j + s); if (a < 0 || b < 0 || c < 0 || d < 0) continue; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ fog: false, uniforms: { ...sharedU(), uNoise: U.uNoise, uSunDir: U.uSunDir, uSunCol: U.uSunCol, uHor: U.uHor, uZen: U.uZen, uSunI: { value: 1 }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.0007 }, uAmb: { value: new THREE.Color() } },
      vertexShader: `attribute vec4 aux; varying vec3 vW; varying vec4 vAux; varying float vDepth; void main(){ vW = position; vAux = aux; vec4 mv = viewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `precision highp float; varying vec3 vW; varying vec4 vAux; varying float vDepth; uniform sampler2D uNoise, uReflTex, uLampTex; uniform vec4 uLampRect; uniform mat4 uReflVP; uniform float uTime, uReflOn, uReflY, uSunI, uNight, uFogD; uniform vec3 uSunDir, uSunCol, uHor, uZen, uFogCol, uAmb, uLampCol;
        ${GLSL_NOISE}
        void main(){ vec2 flow = normalize(vAux.xy + 1e-4); float depth = vAux.z, slope = vAux.w; float spd = 0.35 + slope * 9.0; vec2 p = vW.xz;
          vec2 wv = (vec2(vnoise(p * 0.13 + 3.0), vnoise(p * 0.13 + 19.0)) - 0.5) * 2.6; float fwW = max(fwidth(p.x), fwidth(p.y));
          vec2 a = p + wv - flow * uTime * spd; vec2 b = p - wv * 0.7 - flow * uTime * spd * 1.7 + 13.7;
          vec3 n1 = texture2D(uNoise, a * 0.21).rgb, n2 = texture2D(uNoise, b * 0.53).gbr, n3 = texture2D(uNoise, (p + wv.yx * 0.45 - flow * uTime * spd * 2.6) * 1.9).brg;
          float rough = 0.5 + slope * 14.0; vec2 dn = ((n1.xy - 0.5) * 0.9 + (n2.xy - 0.5) * 0.7 + (n3.xy - 0.5) * 0.45) * 0.34 * rough; vec3 N = normalize(vec3(dn.x, 1.0, dn.y));
          vec3 V = normalize(cameraPosition - vW); float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          // bed seen through shallow water
          vec2 bp = p + N.xz * depth * 0.6; float peb = vnoise(bp * 9.0) * 0.5 + vnoise(bp * 23.0) * 0.3 + h21(floor(bp * 70.0)) * 0.2; vec3 bed = mix(vec3(0.20, 0.19, 0.15), vec3(0.42, 0.40, 0.33), peb) * (0.55 + 0.45 * ss(0.0, 0.1, depth));
          vec2 cq = bp * 1.9 + (n1.xy - 0.5) * 0.9; float r1 = abs(vnoise(cq + vec2(uTime * 0.23, uTime * 0.11)) - 0.5), r2 = abs(vnoise(cq * 1.63 + vec2(-uTime * 0.19, uTime * 0.16) + 7.7) - 0.5);
          float caus = mix(0.42, pow(1.0 - clamp(min(r1, r2) * 6.0, 0.0, 1.0), 3.0) * 1.9, 1.0 - ss(0.02, 0.09, fwW)) * (1.0 - 0.6 * ss(0.3, 1.6, depth));
          float sunUp = ss(0.0, 0.15, uSunDir.y); vec3 light = uAmb + uSunCol * uSunI * max(uSunDir.y, 0.0) * 0.55 * (0.7 + caus * 0.8 * sunUp);
          vec3 trans = exp(-depth * vec3(2.6, 1.7, 2.3)); vec3 deep = vec3(0.050, 0.075, 0.048); vec3 under = mix(deep, bed, trans) * light;
          // reflection
          vec3 Rd = reflect(-V, N); float t = pow(1.0 - max(Rd.y, 0.0), 3.2); vec3 sky = mix(uZen, uHor, t); sky = mix(vec3(dot(sky, vec3(0.3, 0.5, 0.2))), sky, 0.72) * 0.9;
          if (uReflOn > 0.5 && abs(vW.y - uReflY) < 1.2) { vec4 rc = uReflVP * vec4(vW.x, uReflY, vW.z, 1.0); vec2 ruv = rc.xy / rc.w * 0.5 + 0.5 + dn * 0.12; if (ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) { vec4 rs = texture2D(uReflTex, ruv); sky = mix(sky, rs.rgb, 0.92); } }
          float sp = pow(max(dot(Rd, uSunDir), 0.0), 380.0) * 9.0 + pow(max(dot(Rd, uSunDir), 0.0), 40.0) * 0.35; vec3 spec = uSunCol * uSunI * sp * sunUp;
          vec3 col = mix(under, sky, fr) + spec;
          // lamp light on water at night
          vec2 luv = (vW.xz - uLampRect.xy) * uLampRect.zw + dn * 0.004; col += uLampCol * pow(texture2D(uLampTex, luv).r, 2.0) * uNight * (0.25 + 0.75 * fr) * 0.5;
          // foam on riffles / weirs and at the shore
          float fo = texture2D(uNoise, (p - flow * uTime * spd * 1.3) * vec2(1.6, 0.5)).r; float foam = ss(0.045, 0.11, slope) * ss(0.38, 0.62, fo) + (1.0 - ss(0.0, 0.035, depth)) * ss(0.45, 0.7, fo) * 0.6;
          col = mix(col, (uAmb * 1.7 + uSunCol * uSunI * max(uSunDir.y, 0.0) * 0.5) * vec3(0.9, 0.93, 0.95), clamp(foam, 0.0, 0.85));
          col = mix(uFogCol, col, exp(-uFogD * uFogD * vDepth * vDepth));
          gl_FragColor = vec4(col, vDepth); }` });
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.userData.water = true; this.water = m; this.scene.add(m);
  }
  setHour(h) { this.env.setHour(h); if (this.lampGlow) { this.lampGlow.material.uniforms.uOn.value = this.env.lampOn; this.lampGlow.visible = this.env.lampOn > 0.01; } }
  update(cam, focus, dt) {
    U.uTime.value += dt; { const ev = this.Q.shadowEvery || 1; this._sf = (this._sf || 0) + 1; const doSh = ev === 1 || this._sf % ev === 0 || this._sf < 4 || this._shHour !== this.env.hour; this._shHour = this.env.hour; this.env.update(focus, dt, doSh); if (this.Q.shadow) { this.r.shadowMap.autoUpdate = false; this.r.shadowMap.needsUpdate = doSh; } }
    this.tex.update(cam.position, dt); if (this._texLvl) this._texLvl();
    if (this.water) { const u = this.water.material.uniforms; u.uSunI.value = this.env.sunI; u.uFogCol.value.copy(this.scene.fog.color); u.uFogD.value = this.scene.fog.density; u.uAmb.value.copy(U.uZen.value).lerp(U.uHor.value, 0.5).multiplyScalar(this.env.hemi.intensity * 1.1); }
  }
}
