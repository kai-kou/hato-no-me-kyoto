// Added to the page by tools/devicecheck/serve.py (never part of the published app). With ?report=<id> the page measures
// itself and posts the result to the server that served it: this works in any browser that can open a URL, including
// Safari in the iOS Simulator, where nothing can reach into the page from outside.
(() => {
  const P = new URLSearchParams(location.search), id = P.get('report'); if (!id) return;
  const t0 = performance.now(), settle = +(P.get('settle') || 8), N = +(P.get('samples') || 8), errs = [];
  addEventListener('error', e => errs.push(String(e.message || e).slice(0, 240)));
  addEventListener('unhandledrejection', e => errs.push('rejection: ' + String(e.reason && e.reason.message || e.reason).slice(0, 240)));
  const post = o => fetch('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id, query: location.search, ua: navigator.userAgent,
    screen: [screen.width, screen.height, devicePixelRatio], inner: [innerWidth, innerHeight], touch: navigator.maxTouchPoints, errs: errs.slice(0, 8) }, o)) }).catch(() => { });
  const gpu = () => { try { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return { webgl2: false }; const e = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)), vendor: String(e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), floatRT: !!gl.getExtension('EXT_color_buffer_float'), halfFloatRT: !!gl.getExtension('EXT_color_buffer_half_float') }; } catch (e) { return { error: String(e) }; } };
  // does a depth texture read through a comparison sampler work here? The birds' shadows on the ground depend on it. A quad is drawn at depth 0.5 and read back with references 0.3 and 0.7: the answer should be 1 and 0.
  const shadowTest = () => { try { const c = document.createElement('canvas'); c.width = c.height = 4; const gl = c.getContext('webgl2'); if (!gl) return null;
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const VS = '#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0; gl_Position = vec4(p, 0.0, 1.0); }';
    const p1 = pr(VS, '#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(1.0); }'), p2 = pr(VS, '#version 300 es\nprecision highp float; uniform highp sampler2DShadow t; uniform float r; out vec4 o; void main(){ o = vec4(texture(t, vec3(0.5, 0.5, r)), 0.0, 0.0, 1.0); }');
    const dt = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, dt); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 4, 4, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const ct = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ct); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ct, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, dt, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.viewport(0, 0, 4, 4); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(p1); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.useProgram(p2); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dt); gl.uniform1i(gl.getUniformLocation(p2, 't'), 0); const px = new Uint8Array(4), out = [];
    for (const r of [0.3, 0.7]) { gl.uniform1f(gl.getUniformLocation(p2, 'r'), r); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(+(px[0] / 255).toFixed(2)); }
    return { complete: st, lit: out[0], shadowed: out[1], ok: st && out[0] > 0.9 && out[1] < 0.1 }; } catch (e) { return { error: String(e.message || e).slice(0, 200) }; } };
  const G = gpu(); G.shadowSampler = shadowTest();
  const iv = setInterval(() => { const a = window.__app, dt = performance.now() - t0;
    if (!a || !a.ready || !(a.frames > 2)) { if (dt > 240000) { clearInterval(iv); post({ failed: 'not ready after 240 s', stage: a && a.stage || null, gpu: G, text: (document.getElementById('err') || {}).textContent || '' }); } return; }
    clearInterval(iv); const load = Math.round(dt) / 1000; document.body.classList.add('started'); const ms = [];
    setTimeout(() => { const s = setInterval(() => { const S = a.S; if (S.ms) ms.push(+S.ms.toFixed(2));
      if (ms.length >= N || performance.now() - t0 > 200000) { clearInterval(s); const i = a.renderer.info.render, c = a.renderer.domElement, so = ms.slice().sort((x, y) => x - y);
        let audio = null; try { const AC = window.AudioContext || window.webkitAudioContext; audio = AC ? 'available' : 'missing'; } catch (e) { }
        post({ gpu: G, load, ms, median: so.length ? so[so.length >> 1] : null, max: so.length ? so[so.length - 1] : null, drs: a.drs, scale: a.Q.scale, tier: a.Q.tier, lite: !!S.lite, calls: i.calls, tris: i.triangles,
          canvas: [c.width, c.height], mode: S.mode, frames: a.frames, peopleAsset: a.peopleAsset || 0, lost: !!a.lost, probeOff: !!(a.post && a.post.noProbe), audio }); } }, 1050); }, settle * 1000); }, 250);
})();
