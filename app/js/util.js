// Small shared helpers: math, seeded random, pak loader, shader patching.
import { ShaderChunk } from './three.module.min.js';
export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const dampAng = (cur, target, rate, dt) => cur + angDiff(cur, target) * (1 - Math.exp(-rate * dt));
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const R = Math.random, rr = (a, b) => a + (b - a) * Math.random();

// ---- pak: deflate-raw( u32 magic, u32 jsonLen, json, payload ) ----
// data files are addressed relative to where the scripts are actually served from
export const asset = p => new URL('../' + p, import.meta.url).href;
export async function fetchBytes(url, onProg, expect) {
  const res = await fetch(asset(url)); if (!res.ok) throw new Error(url + ' ' + res.status);
  const total = expect || +res.headers.get('content-length') || 0; if (!res.body || !onProg) return new Uint8Array(await res.arrayBuffer());
  const rd = res.body.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onProg(Math.min(n, total || n), total); }
  const out = new Uint8Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
export async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return await new Response(ds.readable).arrayBuffer();
}
// binary payloads are shipped as base64 text (the host serves text and image types only)
const B64 = new Uint8Array(256); for (let i = 0; i < 64; i++) B64['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(i)] = i;
export function b64bytes(src) {
  let n = src.length; while (n > 0 && (src[n - 1] === 61 || src[n - 1] === 10 || src[n - 1] === 13 || src[n - 1] === 32)) n--;
  const out = new Uint8Array(Math.floor(n * 3 / 4)); let o = 0, i = 0;
  for (; i + 3 < n; i += 4) { const v = (B64[src[i]] << 18) | (B64[src[i + 1]] << 12) | (B64[src[i + 2]] << 6) | B64[src[i + 3]]; out[o++] = v >> 16; out[o++] = (v >> 8) & 255; out[o++] = v & 255; }
  if (n - i === 2) out[o++] = ((B64[src[i]] << 18) | (B64[src[i + 1]] << 12)) >> 16; else if (n - i === 3) { const v = (B64[src[i]] << 18) | (B64[src[i + 1]] << 12) | (B64[src[i + 2]] << 6); out[o++] = v >> 16; out[o++] = (v >> 8) & 255; }
  return out.subarray(0, o);
}
export async function fetchData(url, onProg, expect) { return b64bytes(await fetchBytes(url, onProg, expect)); }
export async function loadPak(url, onProg, expect) {
  const buf = await inflateRaw(await fetchData(url, onProg, expect)); const dv = new DataView(buf), jl = dv.getUint32(4, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, jl))); const base = 8 + jl;
  return { json, buf, base, view(T, ref) { return new T(buf, base + ref[0], ref[1]); } };
}
export async function loadTexPak(url, onProg, expect) { // u32 jsonLen, json{name:[off,len]}, webp blobs
  const b = await fetchData(url, onProg, expect), jl = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true); const idx = JSON.parse(new TextDecoder().decode(b.subarray(4, 4 + jl)));
  return { blob(name) { const r = idx[name]; return r ? new Blob([b.subarray(4 + jl + r[0], 4 + jl + r[0] + r[1])], { type: 'image/webp' }) : null; }, names: Object.keys(idx) };
}

// ---- patch three.js built-in material shaders ----
export function patchMaterial(mat, hooks, uniforms) {
  mat.userData.uniforms = uniforms || {};
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, mat.userData.uniforms);
    const rep = (src, key, fn) => src.includes(key) ? src.replace(key, fn(key)) : src;
    let v = sh.vertexShader, f = sh.fragmentShader;
    if (hooks.vPars) v = v.replace('#include <common>', '#include <common>\n' + hooks.vPars);
    if (hooks.vNormal) v = rep(v, '#include <beginnormal_vertex>', k => k + '\n' + hooks.vNormal);
    if (hooks.vBegin) v = rep(v, '#include <begin_vertex>', k => k + '\n' + hooks.vBegin);
    if (hooks.vEnd) v = rep(v, '#include <project_vertex>', k => k + '\n' + hooks.vEnd);
    if (hooks.fPars) f = f.replace('#include <common>', '#include <common>\n' + hooks.fPars);
    if (hooks.fAlbedo) f = rep(f, '#include <color_fragment>', k => k + '\n' + hooks.fAlbedo);
    if (hooks.fMap) f = rep(f, '#include <map_fragment>', k => k + '\n' + hooks.fMap);
    if (hooks.fRough) f = rep(f, '#include <roughnessmap_fragment>', k => k + '\n' + hooks.fRough);
    if (hooks.fNormal) f = rep(f, '#include <normal_fragment_maps>', k => k + '\n' + hooks.fNormal);
    if (hooks.fEmissive) f = rep(f, '#include <emissivemap_fragment>', k => k + '\n' + hooks.fEmissive);
    if (hooks.fAO) f = rep(f, '#include <aomap_fragment>', k => k + '\n' + hooks.fAO);
    if (hooks.fFinal) f = rep(f, '#include <dithering_fragment>', k => k + '\n' + hooks.fFinal);
    if (hooks.sunK) f = f.replace('#include <lights_fragment_begin>', ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= hSunK;'));
    sh.vertexShader = v; sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => hooks.key || 'h';
  return mat;
}
export const GLSL_SS = `float ss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }\n`;
export const GLSL_NOISE = GLSL_SS + `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm2(vec2 p){ return vnoise(p) * 0.6 + vnoise(p * 2.13 + 17.1) * 0.3 + vnoise(p * 4.7 + 5.3) * 0.1; }
`;

export async function bitmap(blob) { try { return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch (e) { return await createImageBitmap(blob); } }
// close-range bird shadows: sun-aligned depth map (hardware PCF) + contact occlusion map rendered from below
export const GLSL_BSH = `
uniform highp sampler2DShadow uBSh; uniform sampler2D uBAO; uniform mat4 uBShM, uBAOM; uniform vec4 uBShP, uBAOP;
float hSunK = 1.0;
float hUnp(vec4 v){ return dot(v, (255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)); }
float hBirdSun(vec3 wp){
  if (uBShP.x < 0.5) return 1.0;
  vec3 c = (uBShM * vec4(wp, 1.0)).xyz; vec2 e = min(c.xy, 1.0 - c.xy); float m = min(e.x, e.y); if (m <= 0.0 || c.z >= 1.0 || c.z <= 0.0) return 1.0;
  float d = c.z - uBShP.z, t = uBShP.y * 0.8;
  float s = texture(uBSh, vec3(c.xy + vec2(t, t * 0.35), d)) + texture(uBSh, vec3(c.xy + vec2(-t * 0.35, t), d)) + texture(uBSh, vec3(c.xy + vec2(-t, -t * 0.35), d)) + texture(uBSh, vec3(c.xy + vec2(t * 0.35, -t), d));
  return mix(1.0, s * 0.25, ss(0.0, 0.06, m));
}
float hBirdAO(vec3 wp, float up){
  if (uBAOP.x < 0.5 || up < 0.35) return 1.0;
  vec2 c = (uBAOM * vec4(wp, 1.0)).xy; vec2 e = min(c, 1.0 - c); float m = min(e.x, e.y); if (m <= 0.0) return 1.0;
  float t = uBAOP.y, a = 0.0, dd, h;
  dd = hUnp(texture2D(uBAO, c)); h = uBAOP.z + dd * uBAOP.w - wp.y; a += step(dd, 0.999) * (1.0 - ss(0.0, 0.15, h)) * step(-0.04, h) * 1.4;
  dd = hUnp(texture2D(uBAO, c + vec2(t, 0.0))); h = uBAOP.z + dd * uBAOP.w - wp.y; a += step(dd, 0.999) * (1.0 - ss(0.0, 0.15, h)) * step(-0.04, h);
  dd = hUnp(texture2D(uBAO, c - vec2(t, 0.0))); h = uBAOP.z + dd * uBAOP.w - wp.y; a += step(dd, 0.999) * (1.0 - ss(0.0, 0.15, h)) * step(-0.04, h);
  dd = hUnp(texture2D(uBAO, c + vec2(0.0, t))); h = uBAOP.z + dd * uBAOP.w - wp.y; a += step(dd, 0.999) * (1.0 - ss(0.0, 0.15, h)) * step(-0.04, h);
  dd = hUnp(texture2D(uBAO, c - vec2(0.0, t))); h = uBAOP.z + dd * uBAOP.w - wp.y; a += step(dd, 0.999) * (1.0 - ss(0.0, 0.15, h)) * step(-0.04, h);
  return 1.0 - 0.72 * min(1.0, a / 4.4) * ss(0.0, 0.06, m);
}
`;
