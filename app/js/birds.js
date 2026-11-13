// Instanced, skinned pigeons: one draw call. Bone transforms (quat + translation) live in a float texture row per bird.
import * as THREE from './three.module.min.js';
import { buildPigeonGeometry, RIG, BONE, NB, mirrorQ } from './birdgeo.js';
import { patchMaterial, GLSL_NOISE, GLSL_BSH } from './util.js';
import { U } from './world.js';

const TW = NB * 2 + 2; // texels per bird: 15 bones x (quat, trans) + 2 parameter texels
const V_PARS = `
uniform sampler2D uBones; uniform float uHideOn; attribute vec3 aSkin; attribute vec3 aFeather; attribute vec4 aPat; attribute vec4 aMorphA; attribute vec4 aMorphB;
varying vec4 vPat; flat varying vec4 vMA; flat varying vec4 vMB; varying vec3 vWPos;
vec3 gBirdP;
vec3 qrot(vec4 q, vec3 v){ return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
float ssv(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void birdSkin(inout vec3 p, inout vec3 n){
  int id = gl_InstanceID; vec4 P0 = texelFetch(uBones, ivec2(${NB * 2}, id), 0), P1 = texelFetch(uBones, ivec2(${NB * 2 + 1}, id), 0);
  float reg = aPat.z;
  if (aFeather.z != 0.0) { float k = reg > 7.5 ? P0.z : (p.x > 0.0 ? P0.x : P0.y); float a = aFeather.z * k, c = cos(a), s = sin(a); vec2 r = p.xz - aFeather.xy; p.xz = aFeather.xy + vec2(c * r.x + s * r.y, -s * r.x + c * r.y); n.xz = vec2(c * n.x + s * n.z, -s * n.x + c * n.z); }
  if (reg > 5.5 && reg < 7.5) { float k = p.x > 0.0 ? P0.x : P0.y; vec3 S = vec3(sign(p.x) * 0.043, 0.030, 0.045); p = S + (p - S) * (1.0 - ssv(0.55, 0.9, k)); }
  if (reg > 10.5) { float k = p.x > 0.0 ? P0.x : P0.y; vec3 S = vec3(sign(p.x) * 0.043, 0.030, 0.045); p = S + (p - S) * ssv(0.70, 0.97, k); }
  float pf = reg < 0.5 ? P0.w : (reg < 1.5 ? max(P0.w, P1.x * 1.6) : (reg < 2.5 ? P0.w * 0.4 : 0.0)); p += n * pf * aPat.w * 0.011;
  // in flight the contour feathers lie flat: the body is narrower, and the belly rises towards the tail (P1.z, 0 on the ground)
  if (reg < 0.5 && aPat.w > 0.5 && aPat.w < 0.7 && P1.z > 0.001) { vec2 hc = vec2(sign(p.x) * 0.026, -0.012); p.xz = hc + (p.xz - hc) * (1.0 - 0.55 * P1.z); }   // the feathered thighs draw in too
  if (reg < 0.5 && aPat.w > 0.9 && P1.z > 0.001) { float rear = ssv(0.02, -0.10, p.z); p.x *= 1.0 - P1.z * (0.04 + 0.17 * rear); p.y = p.y < 0.0 ? p.y * (1.0 - P1.z * (0.13 + 0.27 * rear)) : p.y * (1.0 - P1.z * 0.05); }
  int b0 = int(aSkin.x + 0.5), b1 = int(aSkin.y + 0.5);
  vec4 q0 = texelFetch(uBones, ivec2(b0 * 2, id), 0), t0 = texelFetch(uBones, ivec2(b0 * 2 + 1, id), 0);
  vec3 p0 = qrot(q0, p) + t0.xyz, n0 = qrot(q0, n);
  if (aSkin.z > 0.001) { vec4 q1 = texelFetch(uBones, ivec2(b1 * 2, id), 0), t1 = texelFetch(uBones, ivec2(b1 * 2 + 1, id), 0); p0 = mix(p0, qrot(q1, p) + t1.xyz, aSkin.z); n0 = mix(n0, qrot(q1, n), aSkin.z); }
  p = p0; n = normalize(n0);
  if (uHideOn * P1.y > 0.5 && ((reg > 0.5 && reg < 2.5) || (reg > 3.5 && reg < 5.5))) p = vec3(0.0);
}`;
const F_PARS = `
varying vec4 vPat; flat varying vec4 vMA; flat varying vec4 vMB; varying vec3 vWPos; uniform float uNight; uniform sampler2D uLampTex; uniform vec4 uLampRect; uniform vec3 uLampCol; uniform vec3 uHor;
${GLSL_NOISE}
${GLSL_BSH}
float bRough = 0.6; float bIrid = 0.0; float bBump = 0.0; float bTrans = 0.0;   // bTrans: how much sky a feather seen from below lets through
vec3 bPerturb(vec3 vpos, vec3 n, float h, float sc){ vec3 dpx = dFdx(vpos), dpy = dFdy(vpos); float dhx = dFdx(h), dhy = dFdy(h); vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 g = sign(det) * (dhx * r1 + dhy * r2); float t = sc * length(g) / max(abs(det), 1e-12); return normalize(abs(det) * n - sc * g * min(1.0, 0.9 / max(t, 1e-6))); }
// Overlapping feathers on a lattice: tips toward +g.x, each row lying on the row behind it (larger g.x). cid: which feather is on top at this point (cid.y wraps at wr).
// fl: the point in that feather's own frame, x along (negative on the part that shows between the tips of the row in front, 0 where those tips end, 1 at its own tip), y across (-0.5..0.5).
// returns x: 0 -> 1 toward the feather's own tip edge, y: 1 right under the edge of a feather lying on top, falling to 0 away from it. max(x, y) is continuous everywhere.
vec2 fthr(vec2 g, float wr, out vec2 cid, out vec2 fl){
  float ix = floor(g.x), fx = g.x - ix, gy = g.y - 0.5 * mod(ix, 2.0), iy = floor(gy), fy = gy - iy - 0.5, e = sqrt(fx * fx + 4.0 * fy * fy);
  if (e < 1.0) { cid = vec2(ix, mod(iy, wr)); fl = vec2(fx, fy); float a = 0.5 - abs(fy), ec = sqrt((1.0 + fx) * (1.0 + fx) + 4.0 * a * a); return vec2(ss(0.78, 1.0, e), 1.0 - ss(1.0, 1.35, ec)); }
  gy = g.y - 0.5 * mod(ix + 1.0, 2.0); iy = floor(gy); cid = vec2(ix + 1.0, mod(iy, wr)); fl = vec2(fx - 1.0, gy - iy - 0.5); return vec2(0.0, 1.0 - ss(1.0, 1.35, e));
}
// chequer: black on both webs of a covert, leaving a pale wedge along the shaft that opens toward the tip. am: how far along the feather the black reaches on this bird
float chq(vec2 fl, vec2 cid, float seed, float am){
  float h1 = h21(cid + seed * 23.0 + 3.7), h2 = h21(cid + seed * 31.0 + 8.3), ext = am + (h1 - 0.5) * 0.42, w = 0.56 * ss(ext - 0.62, ext + 0.02, fl.x);
  return ss(w - 0.045, w + 0.045, abs(fl.y - (h2 - 0.5) * 0.10)) * (0.74 + 0.26 * h2) * step(0.07, h1);
}
vec3 birdAlbedo(vec3 N, vec3 Vv){
  float reg = vPat.z; vec2 uvp = vPat.xy; vec3 body = vMA.rgb, wingc = vMB.rgb; float typ = vMA.a, white = vMB.a; vec3 col = body; float seed = fract(vMA.r * 37.0 + vMB.g * 91.0), an = uvp.y * 6.2832, av = abs(uvp.y - 0.5) * 2.0, cam = mix(0.38, 0.80, fract(seed * 7.31)), cavg = mix(0.17, 0.43, fract(seed * 7.31)); vec2 duv = fwidth(uvp); // taken here, outside the branches below: inside a branch a derivative is undefined where the neighbouring pixel takes another branch
  if (reg < 0.5) {
    vec2 g = vec2((1.0 - uvp.x) * 22.0, uvp.y * 26.0) + 0.30 * vec2(sin(uvp.x * 23.0 + 2.0 * sin(an) + seed * 40.0), sin(an * 3.0 + uvp.x * 17.0 + seed * 20.0));
    vec2 cid, fl; vec2 fe = fthr(g, 26.0, cid, fl); float near = 1.0 - ss(0.3, 0.8, duv.x * 22.0 + duv.y * 26.0);
    float topv = cos(an);
    col = body * mix(0.985, 0.955 + 0.06 * h21(cid + seed * 17.0 + 1.3), near) * (1.0 + (0.04 * fe.x - 0.09 * fe.y) * near) * (0.96 + 0.08 * vnoise(vec2(uvp.x * 60.0, av * 65.0))); bBump = -max(fe.x, fe.y) * 0.34 + 0.05 * vnoise(vec2(uvp.x * 240.0, av * 260.0));
    col *= mix(1.0, 0.74, ss(0.62, 1.0, uvp.x));
    col = mix(col, col * 1.10 + 0.025, ss(0.1, -0.9, topv) * (1.0 - ss(0.45, 0.85, uvp.x)) * 0.7);
    float rump = ss(0.34, 0.24, uvp.x) * ss(0.06, 0.14, uvp.x) * ss(0.2, 0.75, topv); if (typ < 1.5) col = mix(col, vec3(0.80, 0.81, 0.82), rump * 0.75);
    float wp = ss(1.0 - white, 1.0 - white + 0.05, vnoise(vec2(uvp.x * 4.0 + 0.9 * cos(an), 1.4 * sin(an)) + seed * 20.0)); col = mix(col, vec3(0.88, 0.87, 0.85), wp * step(0.01, white));
  } else if (reg < 1.5) {
    vec3 base = body * 0.60; float nv = clamp(dot(N, Vv), 0.0, 1.0);
    vec2 g = vec2((1.0 - uvp.x) * 16.0, uvp.y * 24.0) + 0.26 * vec2(sin(an * 2.0 + uvp.x * 9.0 + seed * 30.0), sin(an * 3.0 - uvp.x * 13.0 + seed * 50.0));
    vec2 cid, fl; vec2 fe = fthr(g, 24.0, cid, fl); float sc = max(fe.x * 0.7, fe.y);
    float hue = uvp.x * 0.9 + nv * 0.9 + sin(uvp.y * 12.566) * 0.08 + (h21(cid + seed * 9.0) - 0.5) * 0.14; vec3 ir = mix(vec3(0.50, 0.16, 0.60), vec3(0.06, 0.60, 0.34), ss(0.75, 1.15, hue)); ir = mix(ir, vec3(0.55, 0.30, 0.10), ss(1.45, 1.75, hue) * 0.5);
    float amt = (0.35 + 0.65 * pow(1.0 - abs(nv - 0.6), 3.0)) * (1.0 - 0.45 * sc) * ss(0.02, 0.25, uvp.x) * (1.0 - step(2.5, typ) * 0.35);
    col = base * (1.0 - 0.2 * sc) + ir * amt * 0.30; bRough = 0.30; bIrid = amt; bBump = -sc * 0.85;
    float wp = ss(1.0 - white, 1.0 - white + 0.05, vnoise(vec2(uvp.x * 3.0 + 0.9 * cos(an), 1.2 * sin(an)) + seed * 11.0)); col = mix(col, vec3(0.86), wp * step(0.01, white));
  } else if (reg < 2.5) { col = body * 0.62 * (0.92 + 0.16 * vnoise(vec2(uvp.x * 60.0, av * 20.0))); float wp = step(0.55, white) * ss(0.35, 0.6, vnoise(vec2(uvp.x * 5.0 + 0.8 * cos(an), 0.8 * sin(an)) + seed * 7.0)); col = mix(col, vec3(0.86), wp); bRough = 0.5;
  } else if (reg < 3.5) { col = mix(vec3(0.075, 0.075, 0.085), vec3(0.20, 0.19, 0.18), ss(0.65, 1.0, uvp.x)); bRough = 0.32;
  } else if (reg < 4.5) { col = vec3(0.80, 0.78, 0.74) * (0.9 + 0.1 * vnoise(uvp * 40.0)); bRough = 0.7;
  } else if (reg < 5.5) { float a = uvp.x; col = a < 0.30 ? vec3(0.012) : (a < 0.60 ? mix(vec3(0.95, 0.55, 0.10), vec3(0.85, 0.22, 0.06), ss(0.30, 0.60, a)) : vec3(0.40, 0.38, 0.38)); bRough = a < 0.62 ? 0.04 : 0.6;
  } else if (reg < 6.5) {
    if (vPat.w < 0.25 || !gl_FrontFacing) { // under-wing coverts: pale, in rows that overlap towards the trailing edge (also the back of the upper sheet, where the bent wrist shows it)
      vec2 g = vec2(uvp.y * 4.0, uvp.x * 20.0); vec2 cid, fl; vec2 fe = fthr(g, 1e4, cid, fl); float near = 1.0 - ss(0.3, 0.8, duv.y * 4.0 + duv.x * 20.0);
      vec3 pale = typ > 2.5 ? vec3(0.10, 0.10, 0.11) : (typ > 1.5 ? mix(vec3(0.36, 0.37, 0.39), body, 0.5) : mix(vec3(0.74, 0.75, 0.76), body, 0.25));
      col = pale * (1.0 + (0.03 * fe.x - 0.12 * fe.y) * near) * (0.84 + 0.16 * ss(0.0, 0.4, uvp.y)); bBump = -max(fe.x, fe.y) * 0.5 * near; bTrans = 0.22; } else {
      vec2 g = vec2(uvp.y * 5.0, uvp.x * 22.0) + 0.4 * (vec2(vnoise(uvp * vec2(9.0, 3.0) + seed * 13.0), vnoise(uvp * vec2(8.0, 4.0) + seed * 29.0)) - 0.5);
      vec2 cid, fl; vec2 fe = fthr(g, 1e4, cid, fl); float near = 1.0 - ss(0.3, 0.8, duv.y * 5.0 + duv.x * 22.0);
      col = wingc * mix(0.975, 0.94 + 0.07 * h21(cid + seed * 17.0 + 1.3), near) * (1.0 + (0.04 * fe.x - 0.14 * fe.y) * near);
      float inner = 1.0 - ss(0.62, 0.74, uvp.x);
      if (typ < 0.5) { float bar = ss(0.80, 0.86, uvp.y) * inner; col = mix(col, vec3(0.05, 0.05, 0.06), bar * 0.92); }
      else if (typ < 1.5) { col = mix(col, vec3(0.06, 0.06, 0.07), mix(cavg, chq(fl, cid, seed, cam), near) * 0.9); col = mix(col, vec3(0.05), ss(0.84, 0.9, uvp.y) * inner * 0.9); }
      else if (typ < 2.5) { col = mix(vec3(0.07, 0.07, 0.08), wingc, 0.10 + 0.40 * fe.x * near + 0.08 * (1.0 - near)); }
      else if (typ < 3.5) { col = vec3(0.045, 0.045, 0.05) * (1.0 + 0.2 * fe.x * near); }
      col = mix(col, col * 0.75, ss(0.7, 1.0, uvp.x));
      float wp = ss(1.0 - white, 1.0 - white + 0.06, vnoise(uvp * vec2(5.0, 2.0) + seed * 3.0)); col = mix(col, vec3(0.86), wp * step(0.01, white)); }
  } else if (reg < 7.5) {
    float fi = vPat.w, u = uvp.x, v = uvp.y; vec3 dark = vec3(0.085, 0.088, 0.095);
    if (fi < 0.35) { col = mix(mix(wingc * 0.55, dark, 0.6), dark, ss(0.25, 0.8, u)); col = mix(col, col * 1.35, ss(0.2, 0.9, -v) * (1.0 - u) * 0.5); if (white > 0.5 && fi > 0.2) col = mix(col, vec3(0.86), 0.9); }
    else if (fi < 0.75) { col = wingc; float bar = ss(0.50, 0.58, u) * (1.0 - ss(0.80, 0.86, u)); if (typ < 1.5) col = mix(col, vec3(0.05), bar * 0.92); col = mix(col, dark, ss(0.88, 0.97, u) * 0.85); if (typ > 1.5) col = mix(dark, wingc, 0.25); }
    else { col = wingc * 0.92; if (typ < 1.5) col = mix(col, vec3(0.05), ss(0.6, 0.68, u) * (1.0 - ss(0.86, 0.92, u)) * 0.9); if (typ > 1.5) col = mix(dark, wingc, 0.3); }
    if (!gl_FrontFacing) { // from below the flight feathers are silvery grey with a dark tip and trailing edge, and thin enough to let the sky through
      vec3 pale = typ > 2.5 ? vec3(0.12, 0.12, 0.13) : (typ > 1.5 ? vec3(0.30, 0.31, 0.33) : mix(vec3(0.56, 0.57, 0.59), wingc, 0.25));
      float tipd = fi < 0.35 ? ss(0.58, 0.97, u) : ss(0.84, 0.99, u); col = mix(pale, dark * 1.5, tipd * 0.8); if (white > 0.5 && fi < 0.35 && fi > 0.2) col = vec3(0.80); bTrans = 1.0 - 0.55 * tipd; }
    col *= 0.93 + 0.07 * sin((u * 46.0 + abs(v) * 10.0) * 6.2832); col = mix(col, col * 1.5 + 0.02, (1.0 - ss(0.0, 0.09, abs(v))) * 0.5); bRough = 0.5; bBump = 0.5 * sin((u * 46.0 + abs(v) * 10.0) * 6.2832) + (1.0 - ss(0.0, 0.09, abs(v))) * 1.2;
  } else if (reg < 8.5) { float u = uvp.x; col = body * 0.78; col = mix(col, vec3(0.055, 0.055, 0.06), ss(0.66, 0.72, u) * (1.0 - ss(0.90, 0.94, u)) * 0.95); col = mix(col, body * 0.95, ss(0.93, 0.97, u)); if (typ > 2.5) col = vec3(0.05); if (vPat.w < 0.05 || vPat.w > 0.95) col = mix(col, vec3(0.8), (1.0 - ss(0.3, 0.6, u)) * ss(0.2, 0.9, -uvp.y * sign(vPat.w - 0.5)) * 0.6);
    if (!gl_FrontFacing) { col = mix(col, (typ > 1.5 ? vec3(0.24, 0.25, 0.27) : vec3(0.52, 0.53, 0.55)), 0.5 * (1.0 - ss(0.60, 0.72, u))); bTrans = 0.6 * (1.0 - ss(0.60, 0.72, u)); }
    float tv = abs(uvp.y), barb = sin((u * 40.0 + tv * 9.0) * 6.2832); col *= 0.94 + 0.06 * barb;
    col *= 1.0 - 0.24 * ss(0.60, 1.0, tv); col = mix(col, col * 1.45 + 0.015, (1.0 - ss(0.0, 0.07, tv)) * 0.45); // each vane darkens toward its edge and carries a pale shaft, so the twelve feathers read as feathers and not as one plate
    bRough = 0.5; bBump = 0.35 * barb + (1.0 - ss(0.0, 0.08, tv)) * 1.0 - 0.6 * ss(0.7, 1.0, tv);
  } else if (reg < 9.5) { col = vec3(0.62, 0.17, 0.16) * (0.82 + 0.18 * sin(uvp.x * 160.0)); bRough = 0.45;
  } else if (reg < 10.5) { col = vec3(0.09, 0.08, 0.075); bRough = 0.35;
  } else { // folded wing shield: u front -> rear, v top -> bottom
    vec2 g = vec2(pow(uvp.x, 0.8) * 17.0, uvp.y * 6.0) + 0.5 * (vec2(vnoise(uvp * vec2(5.0, 3.0) + seed * 13.0), vnoise(uvp * vec2(4.0, 3.5) + seed * 29.0 + 4.0)) - 0.5);
    vec2 cid, fl; vec2 fe = fthr(g, 1e4, cid, fl); float near = 1.0 - ss(0.3, 0.8, duv.x * 15.0 + duv.y * 6.0), tone = h21(cid + seed * 17.0 + 1.3);
    col = wingc * mix(0.975, 0.94 + 0.07 * tone, near) * (1.0 + (0.05 * fe.x - 0.15 * fe.y) * near) * (0.96 + 0.08 * vnoise(uvp * vec2(90.0, 40.0))); bBump = -max(fe.x, fe.y) * 0.7 + 0.06 * vnoise(uvp * vec2(420.0, 160.0));
    float d1 = uvp.x + 0.20 * uvp.y, d1b = d1 + 0.012 * (tone - 0.5) * near; vec3 dark = vec3(0.055, 0.057, 0.063);
    float bars = (ss(0.47, 0.49, d1b) * (1.0 - ss(0.545, 0.565, d1b)) + ss(0.655, 0.675, d1b) * (1.0 - ss(0.735, 0.755, d1b))) * ss(0.12, 0.3, uvp.y);
    if (typ < 0.5) col = mix(col, dark, bars * 0.94);
    else if (typ < 1.5) { col = mix(col, dark, mix(cavg, chq(fl, cid, seed, cam), near) * 0.9 * (1.0 - ss(0.72, 0.8, d1))); col = mix(col, dark, bars * 0.9); }
    else if (typ < 2.5) col = mix(dark * 1.25, wingc, (0.07 + 0.30 * fe.x * near + 0.08 * (1.0 - near)) * (1.0 - ss(0.6, 0.8, d1)));
    else col = dark * (0.95 + 0.20 * fe.x * near);
    float prim = ss(0.80, 0.86, d1); col = mix(col, dark * (0.9 + 0.5 * sin(uvp.y * 60.0) * 0.3 + 0.3), prim); bBump = mix(bBump, sin(uvp.y * 60.0) * 0.8, prim);
    col = mix(col, col * 0.86 + vec3(0.02, 0.012, 0.0), ss(0.5, 0.75, uvp.x) * (1.0 - ss(0.25, 0.5, uvp.y)) * (1.0 - prim) * 0.6);
    float wp = ss(1.0 - white, 1.0 - white + 0.06, vnoise(uvp * vec2(5.0, 2.5) + seed * 3.0)); col = mix(col, vec3(0.86), wp * step(0.01, white) * (1.0 - prim * 0.5)); bRough = 0.55; }
  return col;
}`;

export class Birds {
  constructor(scene, Q, flockCount, extra = 0) {
    this.n = flockCount; this.Q = Q; const count = flockCount + extra, geo = buildPigeonGeometry(); this.geo = geo; this.total = count;
    this.data = new Float32Array(TW * count * 4); this.tex = new THREE.DataTexture(this.data, TW, count, THREE.RGBAFormat, THREE.FloatType); this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.mA = new Float32Array(count * 4); this.mB = new Float32Array(count * 4); geo.setAttribute('aMorphA', new THREE.InstancedBufferAttribute(this.mA, 4)); geo.setAttribute('aMorphB', new THREE.InstancedBufferAttribute(this.mB, 4));
    const M = Q.pbr ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial, par = { side: THREE.DoubleSide }; if (Q.pbr) { par.roughness = 0.6; par.metalness = 0; par.envMapIntensity = 0.6; }
    const uni = { uBones: { value: this.tex }, uHideOn: { value: 1 }, uHor: U.uHor, uNight: U.uNight, uLampTex: U.uLampTex, uLampRect: U.uLampRect, uLampCol: U.uLampCol, uBSh: U.uBSh, uBShM: U.uBShM, uBShP: U.uBShP, uBAO: U.uBAO, uBAOM: U.uBAOM, uBAOP: U.uBAOP };
    this.mat = patchMaterial(new M(par), { key: 'bird' + (Q.pbr ? 's' : 'l'), sunK: true, vPars: V_PARS,
      vNormal: `gBirdP = position; birdSkin(gBirdP, objectNormal); vPat = aPat; vMA = aMorphA; vMB = aMorphB;`, vBegin: `transformed = gBirdP;`,
      vEnd: `vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`, fPars: F_PARS,
      fAlbedo: `{ vec3 bn = normalize(vNormal); bn = gl_FrontFacing ? bn : -bn; diffuseColor.rgb = birdAlbedo(bn, normalize(vViewPosition)); hSunK = hBirdSun(vWPos + inverseTransformDirection(bn, viewMatrix) * 0.012); }`,
      fRough: `roughnessFactor = bRough;`,
      fNormal: `{ float bw = fwidth(vPat.x) + fwidth(vPat.y); normal = bPerturb(-vViewPosition, normal, bBump, 0.0008 * (1.0 - ss(0.004, 0.02, bw))); }`,
      fEmissive: `{ vec2 luv = (vWPos.xz - uLampRect.xy) * uLampRect.zw; vec4 lt = texture2D(uLampTex, luv); float gy = lt.g * 16.0 - 8.0; totalEmissiveRadiance += diffuseColor.rgb * uLampCol * (lt.r * lt.r) * (1.0 - ss(0.5, 6.5, vWPos.y - gy)) * uNight * 1.25; float fz = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.4); totalEmissiveRadiance += diffuseColor.rgb * (uHor + 0.12) * fz * 0.5 * (1.0 - uNight) * step(vPat.z, 2.5); totalEmissiveRadiance += diffuseColor.rgb * (uHor * 0.5 + 0.02) * bTrans * (1.0 - uNight); }`,
      fFinal: `gl_FragColor.a = vViewPosition.z;` }, uni);
    const depthHooks = { key: 'birdD', vPars: V_PARS, vBegin: `{ vec3 dn = vec3(0.0, 1.0, 0.0); birdSkin(transformed, dn); vPat = aPat; }` };
    this.mesh = new THREE.InstancedMesh(geo, this.mat, count); this.mesh.frustumCulled = false; this.mesh.castShadow = (Q.shadowEvery || 1) === 1; this.mesh.receiveShadow = true;
    this.depthMat = this.mesh.customDepthMaterial = patchMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), depthHooks, { uBones: { value: this.tex }, uHideOn: { value: 0 } }); this.mesh.layers.enable(1);
    scene.add(this.mesh);
    // scratch
    this._q = Array.from({ length: 12 }, () => new THREE.Quaternion()); this._v = Array.from({ length: 12 }, () => new THREE.Vector3()); this._m = new THREE.Matrix4(); this._e = new THREE.Euler();
    this.R = { foldArm: RIG.foldArm, foldFore: RIG.foldFore, foldHand: RIG.foldHand, I: new THREE.Quaternion() };
  }
  setMorph(i, a, b) { this.mA.set(a, i * 4); this.mB.set(b, i * 4); this.geo.attributes.aMorphA.needsUpdate = true; this.geo.attributes.aMorphB.needsUpdate = true; }
  _put(i, bone, q, t) { const o = (i * TW + bone * 2) * 4, d = this.data; d[o] = q.x; d[o + 1] = q.y; d[o + 2] = q.z; d[o + 3] = q.w; d[o + 4] = t.x; d[o + 5] = t.y; d[o + 6] = t.z; d[o + 7] = 1; }
  // pose -> bones.  All positions in model space (origin = body centre, +Z forward).
  write(i, p) {
    const Q = this._q, Vv = this._v, e = this._e, X = (ax, ang, q) => q.setFromAxisAngle(ax, ang);
    const AX = Birds.AX, q0 = Q[0]; e.set(-p.pitch, 0, p.roll, 'ZXY'); q0.setFromEuler(e); const zero = Vv[0].set(0, 0, 0);
    this._put(i, BONE.body, q0, zero);
    // head
    const q1 = Q[1]; e.set(-p.hPitch, p.hYaw, p.hTilt, 'YXZ'); q1.setFromEuler(e); const t1 = Vv[1].copy(RIG.head).applyQuaternion(q1).negate().add(Vv[2].set(p.hx, p.hy, p.hz)); this._put(i, BONE.head, q1, t1);
    // wings
    for (let s = 0; s < 2; s++) { const w = p.wing[s], L = Q[2], tmp = Q[3], sx = s === 0 ? 1 : -1;
      L.setFromAxisAngle(AX.z, w.flap); tmp.setFromAxisAngle(AX.y, w.sweep); L.multiply(tmp); tmp.setFromAxisAngle(AX.x, -w.twist); L.multiply(tmp); // base (left-handed convention, mirrored below)
      const qa = Q[4].copy(this.R.I).slerp(this.R.foldArm, w.fold), qf = Q[5].copy(this.R.I).slerp(this.R.foldFore, w.fold), qh = Q[6].copy(this.R.I).slerp(this.R.foldHand, w.fold);
      tmp.setFromAxisAngle(AX.y, w.wrist); qh.multiply(tmp); tmp.setFromAxisAngle(AX.y, -w.wrist * 0.35); qf.multiply(tmp);
      qa.premultiply(L); qf.premultiply(L); qh.premultiply(L);
      if (sx < 0) { for (const q of [qa, qf, qh]) { q.y = -q.y; q.z = -q.z; } }
      qa.premultiply(q0); qf.premultiply(q0); qh.premultiply(q0);
      const Sb = Vv[3].set(RIG.shoulder.x * sx, RIG.shoulder.y, RIG.shoulder.z), Eb = Vv[4].set(RIG.elbow.x * sx, RIG.elbow.y, RIG.elbow.z), Wb = Vv[5].set(RIG.wrist.x * sx, RIG.wrist.y, RIG.wrist.z);
      const Sm = Vv[6].set((RIG.shoulder.x + 0.009 * w.fold) * sx, RIG.shoulder.y + 0.006 * w.fold, RIG.shoulder.z).applyQuaternion(q0);
      const ta = Vv[7].copy(Sb).applyQuaternion(qa).negate().add(Sm); this._put(i, s === 0 ? BONE.armL : BONE.armR, qa, ta);
      const El = Vv[8].copy(Eb).applyQuaternion(qa).add(ta), tf = Vv[9].copy(Eb).applyQuaternion(qf).negate().add(El); this._put(i, s === 0 ? BONE.foreL : BONE.foreR, qf, tf);
      const Wr = Vv[10].copy(Wb).applyQuaternion(qf).add(tf), th = Vv[11].copy(Wb).applyQuaternion(qh).negate().add(Wr); this._put(i, s === 0 ? BONE.handL : BONE.handR, qh, th); }
    // tail
    { const q8 = Q[2].setFromAxisAngle(AX.x, p.tailPitch), tmp = Q[3].setFromAxisAngle(AX.y, p.tailYaw || 0); q8.multiply(tmp).premultiply(q0); const Tb = Vv[3].copy(RIG.tail), t8 = Vv[4].copy(Tb).applyQuaternion(q0).sub(Vv[5].copy(Tb).applyQuaternion(q8)); this._put(i, BONE.tail, q8, t8); }
    // legs (2-bone IK, ankle bends backwards)
    for (let s = 0; s < 2; s++) { const lg = p.leg[s], sx = s === 0 ? 1 : -1, hipB = Vv[3].set(RIG.hip.x * sx, RIG.hip.y, RIG.hip.z), hip = Vv[4].copy(hipB).applyQuaternion(q0), F = Vv[5].set(lg.x, lg.y, lg.z), d = Vv[6].copy(F).sub(hip);
      const L1 = RIG.tib, L2 = RIG.tar; let dist = d.length(); const dn = d.multiplyScalar(1 / Math.max(dist, 1e-5)); dist = Math.min(L1 + L2 - 0.0005, Math.max(Math.abs(L1 - L2) + 0.002, dist));
      const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), A = Math.acos(cosA);
      const pole = Vv[7].set(0, 0.15, -1).applyQuaternion(q0); pole.addScaledVector(dn, -pole.dot(dn)).normalize();
      const ank = Vv[8].copy(hip).addScaledVector(dn, L1 * cosA).addScaledVector(pole, L1 * Math.sin(A)), foot = Vv[9].copy(hip).addScaledVector(dn, dist);
      const qt = Q[2].setFromUnitVectors(AX.ny, Vv[10].copy(ank).sub(hip).normalize()), tt = Vv[11].copy(hipB).applyQuaternion(qt).negate().add(hip); this._put(i, s === 0 ? BONE.tibL : BONE.tibR, qt, tt);
      const ankB = Vv[3].set(RIG.ankle.x * sx, RIG.ankle.y, RIG.ankle.z), qr = Q[3].setFromUnitVectors(AX.ny, Vv[10].copy(foot).sub(ank).normalize()), tr = Vv[11].copy(ankB).applyQuaternion(qr).negate().add(ank); this._put(i, s === 0 ? BONE.tarL : BONE.tarR, qr, tr);
      const footB = Vv[3].set(RIG.foot.x * sx, RIG.foot.y, RIG.foot.z), qfo = Q[4].setFromAxisAngle(AX.x, lg.curl || 0); if (lg.yaw) qfo.premultiply(Q[5].setFromAxisAngle(AX.y, lg.yaw)); const tfo = Vv[11].copy(footB).applyQuaternion(qfo).negate().add(foot); this._put(i, s === 0 ? BONE.footL : BONE.footR, qfo, tfo); }
    // parameter texels
    const o = (i * TW + NB * 2) * 4, dd = this.data; dd[o] = p.wing[0].fold; dd[o + 1] = p.wing[1].fold; dd[o + 2] = p.tailSpread; dd[o + 3] = p.puff; dd[o + 4] = p.neckPuff || 0; dd[o + 5] = p.hide ? 1 : 0; dd[o + 6] = p.sleek || 0; dd[o + 7] = 0;
    // instance matrix
    e.set(0, p.yaw, 0, 'YXZ'); this._m.makeRotationFromEuler(e); if (p.scale) this._m.scale(this._v[0].set(p.scale, p.scale, p.scale)); this._m.setPosition(p.x, p.y, p.z); this.mesh.setMatrixAt(i, this._m);
  }
  commit(count) { this.tex.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; if (count !== undefined) this.mesh.count = count; }
}
Birds.AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1), ny: new THREE.Vector3(0, -1, 0) };
export function newPose() { return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0.45, roll: 0, hx: 0, hy: 0.105, hz: 0.07, hYaw: 0, hPitch: 0, hTilt: 0, wing: [{ flap: 0, sweep: 0, twist: 0, fold: 1, wrist: 0 }, { flap: 0, sweep: 0, twist: 0, fold: 1, wrist: 0 }], tailPitch: 0, tailYaw: 0, tailSpread: 0.08, puff: 0, neckPuff: 0, leg: [{ x: 0.026, y: -0.118, z: -0.01, curl: 0, yaw: 0 }, { x: -0.026, y: -0.118, z: -0.01, curl: 0, yaw: 0 }] }; }

// Close-range shadows for the birds: a tight sun-aligned depth map (crisp feet / wing shadows) and a contact-occlusion map seen from below.
export class BirdShadow {
  constructor(renderer, scene, birds, Q) {
    this.r = renderer; this.scene = scene; this.birds = birds; this.Q = Q; const S = Q.bsh || 0, A = Q.bao || 256; this.S = S; this.A = A;
    if (S) { const dt = new THREE.DepthTexture(S, S); dt.compareFunction = THREE.LessEqualCompare; dt.minFilter = dt.magFilter = THREE.LinearFilter; this.rt = new THREE.WebGLRenderTarget(S, S, { depthTexture: dt, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }); U.uBSh.value = dt; }
    this.ao = new THREE.WebGLRenderTarget(A, A, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }); U.uBAO.value = this.ao.texture;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 90); this.cam.layers.set(1); this.camA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 60); this.camA.layers.set(1);
    this.bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1); this._c = new THREE.Color(); this._v = new THREE.Vector3();
  }
  update(focus, range, sunDir, sunOn) {
    const r = this.r, sc = this.scene, old = r.getRenderTarget(), ca = r.getClearAlpha(); r.getClearColor(this._c); const om = sc.overrideMaterial, bg = sc.background, au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; sc.overrideMaterial = this.birds.depthMat; r.setClearColor(0xffffff, 1);
    if (this.S && (sunOn || !this.init)) { this.init = true; const c = this.cam, R = range; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 90; c.updateProjectionMatrix(); c.position.copy(focus).addScaledVector(sunDir, 45); c.up.set(0, 1, 0); c.lookAt(focus); c.updateMatrixWorld(); c.matrixWorldInverse.copy(c.matrixWorld).invert();
      r.setRenderTarget(this.rt); r.clear(); r.render(sc, c); U.uBShM.value.multiplyMatrices(this.bias, c.projectionMatrix).multiply(c.matrixWorldInverse); U.uBShP.value.set(sunOn ? 1 : 0, 1 / this.S, 0.0045 / 89 * Math.max(1, R / 6), 0); }
    else U.uBShP.value.x = 0;
    { const c = this.camA, R = Math.min(range, 5.5), y0 = focus.y - 20; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 0.5; c.far = 60; c.updateProjectionMatrix(); c.position.set(focus.x, y0, focus.z); c.up.set(0, 0, 1); c.lookAt(focus.x, y0 + 1, focus.z); c.updateMatrixWorld(); c.matrixWorldInverse.copy(c.matrixWorld).invert();
      r.setRenderTarget(this.ao); r.clear(); r.render(sc, c); U.uBAOM.value.multiplyMatrices(this.bias, c.projectionMatrix).multiply(c.matrixWorldInverse); U.uBAOP.value.set(1, 1.1 / this.A, y0 + 0.5, 59.5); }
    sc.overrideMaterial = om; r.shadowMap.autoUpdate = au; r.setClearColor(this._c, ca); r.setRenderTarget(old);
  }
}

// Food on the ground: crumbs as instanced blobs
export class Crumbs {
  constructor(scene, mat, max = 900) { const g = new THREE.IcosahedronGeometry(1, 0); this.max = max; this.mesh = new THREE.InstancedMesh(g, mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true; scene.add(this.mesh); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); }
  sync(food) { const n = Math.min(food.length, this.max); for (let i = 0; i < n; i++) { const f = food[i]; if (f.s === undefined) { f.s = 0.0026 + Math.random() * 0.0034; f.r = Math.random() * 6.28; } this._e.set(f.r, f.r * 2.3, f.r * 0.7); this._q.setFromEuler(this._e); this._s.set(f.s * 1.3, f.s * 0.75, f.s); this._p.set(f.x, f.y + f.s * 0.6, f.z); this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m); } this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; }
}
