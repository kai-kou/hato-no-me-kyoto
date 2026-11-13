// Render pipeline: HDR scene target (depth in alpha) -> bloom -> depth of field -> filmic grade.
// Also: planar reflection pass and the pigeon-eye panorama (cube faces -> lateral-eye projection).
import * as THREE from './three.module.min.js';
import { U } from './world.js';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2)); return g; };

export class Post {
  constructor(renderer, Q) {
    this.r = renderer; this.Q = Q; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(tri(), null); this.quad.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.quad);
    const hf = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')); this.type = hf ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = null; this.mips = []; this.w = 0; this.h = 0;
    const M = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'precision highp float; varying vec2 vUv;\n' + fs, uniforms: u, depthTest: false, depthWrite: false });
    this.mPre = M(`uniform sampler2D t; uniform vec2 px; uniform float th; void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px).rgb) * 0.25; c = min(c, vec3(40.0)); float l = max(c.r, max(c.g, c.b)); float k = max(l - th, 0.0) / max(l, 1e-4); gl_FragColor = vec4(c * k * k * (3.0 - 2.0 * min(k, 1.0)), 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, th: { value: 1.0 } });
    this.mDown = M(`uniform sampler2D t; uniform vec2 px; void main(){ vec3 c = texture2D(t, vUv).rgb * 4.0 + texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px).rgb; gl_FragColor = vec4(c / 8.0, 1.0); }`, { t: { value: null }, px: { value: new THREE.Vector2() } });
    this.mUp = M(`uniform sampler2D t, add; uniform vec2 px; uniform float k; void main(){ vec3 c = (texture2D(t, vUv + px * vec2(-1.0, 0.0)).rgb + texture2D(t, vUv + px * vec2(1.0, 0.0)).rgb + texture2D(t, vUv + px * vec2(0.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(0.0, 1.0)).rgb) * 2.0 + texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px).rgb; gl_FragColor = vec4(c / 12.0 * k + texture2D(add, vUv).rgb, 1.0); }`, { t: { value: null }, add: { value: null }, px: { value: new THREE.Vector2() }, k: { value: 1 } });
    this.mDof = M(`uniform sampler2D t; uniform vec2 px; uniform float focus, ap, maxR;
      float coc(float d){ return clamp(ap * abs(d - focus) / max(d, 0.05), 0.0, maxR); }
      void main(){ vec4 c0 = texture2D(t, vUv); float r0 = coc(c0.a); vec3 acc = c0.rgb; float wsum = 1.0, nearK = 0.0; float ga = 2.39996323; float Rg = max(r0, maxR * 0.6);
        for (int i = 1; i < TAPS; i++) { float fi = float(i); float rr = sqrt(fi / float(TAPS)) * Rg; vec2 o = vec2(cos(fi * ga), sin(fi * ga)) * rr; vec4 s = texture2D(t, vUv + o * px); float rs = coc(s.a);
          float fg = step(s.a, c0.a * 0.96); float w = smoothstep(rr - 1.0, rr + 1.0, mix(min(rs, r0), rs, fg)); nearK += w * fg; w *= 1.0 + dot(s.rgb, vec3(0.2)) * 0.5; acc += min(s.rgb, vec3(30.0)) * w; wsum += w; }
        gl_FragColor = vec4(acc / wsum, max(r0, nearK / float(TAPS - 1) * 9.0)); }`, { t: { value: null }, px: { value: new THREE.Vector2() }, focus: { value: 5 }, ap: { value: 0 }, maxR: { value: 14 } });
    this.mDof.defines = { TAPS: Q.dofTaps || 28 };
    this.mFinal = M(`uniform sampler2D t, bloom, dof, uNoise; uniform vec2 px; uniform float expo, bloomK, dofOn, time, grain, vig, sat, aber; uniform vec3 tintLo, tintHi;
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main(){ vec2 uv = vUv; vec2 cc = uv - 0.5; vec4 s = texture2D(t, uv); vec3 c = s.rgb;
        if (aber > 0.0) { c.r = texture2D(t, uv + cc * aber).r; c.b = texture2D(t, uv - cc * aber).b; }
        if (dofOn > 0.5) { vec4 d = texture2D(dof, uv); c = mix(c, d.rgb, smoothstep(0.6, 2.6, d.a)); }
        c += texture2D(bloom, uv).rgb * bloomK; c *= expo;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, sat);
        c = aces(c * 0.82);
        float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722)); c *= mix(tintLo, tintHi, smoothstep(0.05, 0.75, l2));
        c = pow(c, vec3(1.0 / 2.2));
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
        c *= 1.0 - vig * smoothstep(0.35, 0.95, length(cc * vec2(1.0, 0.82)) * 1.35);
        float g = texture2D(uNoise, uv * vec2(3.1, 2.3) + fract(time * vec2(7.13, 3.71))).r - 0.5; c += g * grain * (1.0 - 0.6 * l2);
        gl_FragColor = vec4(c, 1.0); }`, { t: { value: null }, bloom: { value: null }, dof: { value: null }, uNoise: U.uNoise, px: { value: new THREE.Vector2() }, expo: { value: 1 }, bloomK: { value: 0.5 }, dofOn: { value: 0 }, time: U.uTime, grain: { value: 0.035 }, vig: { value: 0.32 }, sat: { value: 1.08 }, aber: { value: 0.0012 }, tintLo: { value: new THREE.Color(0.97, 0.99, 1.03) }, tintHi: { value: new THREE.Color(1.03, 1.0, 0.96) } });
    // panorama (pigeon lateral eyes): cube -> wide cylindrical projection
    this.mPano = M(`uniform samplerCube cube; uniform vec3 uF, uR, uUp; uniform float asp, hfov, vfov, binoc, rows;
      void main(){ float yaw, pit;
        if (rows > 1.5) { float top = step(0.5, vUv.y), v = fract(vUv.y * 2.0); yaw = mix(mix(-0.2618, -hfov * 0.5, top), mix(hfov * 0.5, 0.2618, top), vUv.x); pit = (v - 0.5) * vfov; }
        else { yaw = (vUv.x - 0.5) * hfov; pit = (vUv.y - 0.5) * vfov; }
        vec3 d = cos(pit) * (cos(yaw) * uF + sin(yaw) * uR) + sin(pit) * uUp; vec4 c = textureCube(cube, d);
        float ay = abs(yaw); c.rgb *= 1.0 - smoothstep(hfov * 0.5 - 0.14, hfov * 0.5, ay);
        c.rgb *= 1.0 + 0.06 * (1.0 - smoothstep(binoc - 0.02, binoc + 0.02, ay));
        if (rows > 1.5) c.rgb *= smoothstep(0.0, 0.004, abs(vUv.y - 0.5));
        gl_FragColor = c; }`, { cube: { value: null }, uF: { value: new THREE.Vector3(0, 0, 1) }, uR: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, asp: { value: 1.7 }, hfov: { value: 5.5 }, vfov: { value: 1.9 }, binoc: { value: 0.2356 }, rows: { value: 1 } });
    this.reflCam = new THREE.PerspectiveCamera(); this.reflRT = null; this.cubeRT = null; this.cubeCam = null;
    this.opts = { bloom: 0.55, dofOn: false, focus: 6, aperture: 0, exposure: 1 };
  }
  setSize(w, h) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h; const Q = this.Q, T = this.type;
    if (this.rt) { this.rt.dispose(); this.mips.forEach(m => m.dispose()); this.dofRT && this.dofRT.dispose(); }
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: T, samples: Q.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.mips = []; let mw = w >> 1, mh = h >> 1; for (let i = 0; i < Q.bloomLv; i++) { this.mips.push(new THREE.WebGLRenderTarget(Math.max(2, mw), Math.max(2, mh), { type: T, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }), new THREE.WebGLRenderTarget(Math.max(2, mw), Math.max(2, mh), { type: T, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })); mw >>= 1; mh >>= 1; }
    this.dofRT = Q.dof ? new THREE.WebGLRenderTarget(w >> 1, h >> 1, { type: T, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }) : null;
    if (Q.refl) { this.reflRT && this.reflRT.dispose(); this.reflRT = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), { type: T, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }
  }
  _pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }
  // mirror the camera about y = planeY and render the scene above the plane
  renderReflection(scene, camera, planeY, hide) {
    if (!this.reflRT) return; const r = this.r, rc = this.reflCam; rc.fov = camera.fov; rc.aspect = camera.aspect; rc.near = camera.near; rc.far = camera.far; rc.updateProjectionMatrix();
    const p = camera.getWorldPosition(new THREE.Vector3()), d = camera.getWorldDirection(new THREE.Vector3()), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    rc.position.set(p.x, 2 * planeY - p.y, p.z); rc.up.set(up.x, -up.y, up.z); rc.lookAt(p.x + d.x, 2 * planeY - (p.y + d.y), p.z + d.z); rc.updateMatrixWorld(); rc.matrixWorldInverse.copy(rc.matrixWorld).invert();
    U.uReflVP.value.multiplyMatrices(rc.projectionMatrix, rc.matrixWorldInverse); U.uReflY.value = planeY;
    const vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; }); U.uReflOn.value = 0; U.uReflTex.value = null;
    const cp = r.clippingPlanes; r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY + 0.02)]; const sa = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.reflRT); r.clear(); r.render(scene, rc);
    r.clippingPlanes = cp; r.shadowMap.autoUpdate = sa; hide.forEach((o, i) => { o.visible = vis[i]; }); U.uReflOn.value = 1; U.uReflTex.value = this.reflRT.texture;
  }
  // pigeon-eye panorama: render cube faces from the eye, then project
  renderPano(scene, eye, F, Rv, Up) {
    const r = this.r, Q = this.Q; if (!this.cubeRT) { this.cubeRT = new THREE.WebGLCubeRenderTarget(Q.panoSize, { type: this.type, generateMipmaps: false }); this.cubeCam = new THREE.CubeCamera(0.012, 6000, this.cubeRT); }
    this.cubeCam.position.copy(eye); this.cubeCam.updateMatrixWorld(); this.cubeCam.update(r, scene);
    const u = this.mPano.uniforms; u.cube.value = this.cubeRT.texture; u.uF.value.copy(F); u.uR.value.copy(Rv); u.uUp.value.copy(Up); u.asp.value = this.w / this.h;
    const hf = 320 * Math.PI / 180, rows = this.panoRows || 1; u.hfov.value = hf; u.rows.value = rows; u.vfov.value = rows > 1 ? Math.min(1.75, (hf / 2 + 0.2618) * (this.h / 2) / this.w) : Math.min(2.0, hf * this.h / this.w);
    this._pass(this.mPano, this.rt);
  }
  renderScene(scene, camera) { const r = this.r; r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera); }
  finish() {
    const r = this.r, Q = this.Q, o = this.opts, w = this.w, h = this.h;
    // bloom
    if (Q.bloomLv) { const n = Q.bloomLv; this.mPre.uniforms.t.value = this.rt.texture; this.mPre.uniforms.px.value.set(0.5 / w, 0.5 / h); this.mPre.uniforms.th.value = o.bloomTh ?? 1.0; this._pass(this.mPre, this.mips[0]);
      for (let i = 1; i < n; i++) { const src = this.mips[(i - 1) * 2], dst = this.mips[i * 2]; this.mDown.uniforms.t.value = src.texture; this.mDown.uniforms.px.value.set(1 / src.width, 1 / src.height); this._pass(this.mDown, dst); }
      let cur = this.mips[(n - 1) * 2]; for (let i = n - 2; i >= 0; i--) { const dst = this.mips[i * 2 + 1]; this.mUp.uniforms.t.value = cur.texture; this.mUp.uniforms.add.value = this.mips[i * 2].texture; this.mUp.uniforms.px.value.set(1 / cur.width, 1 / cur.height); this.mUp.uniforms.k.value = 1.0; this._pass(this.mUp, dst); cur = dst; }
      this.mFinal.uniforms.bloom.value = cur.texture; this.mFinal.uniforms.bloomK.value = o.bloom / n; } else this.mFinal.uniforms.bloomK.value = 0;
    // depth of field (half res)
    if (this.dofRT && o.dofOn && o.aperture > 0.01) { const u = this.mDof.uniforms; u.t.value = this.rt.texture; u.px.value.set(1 / w, 1 / h); u.focus.value = o.focus; u.ap.value = o.aperture; u.maxR.value = Math.min(22, h * 0.02); this._pass(this.mDof, this.dofRT); this.mFinal.uniforms.dof.value = this.dofRT.texture; this.mFinal.uniforms.dofOn.value = 1; } else this.mFinal.uniforms.dofOn.value = 0;
    const f = this.mFinal.uniforms; f.t.value = this.rt.texture; f.expo.value = o.exposure; f.px.value.set(1 / w, 1 / h);
    this._pass(this.mFinal, null);
  }
}
