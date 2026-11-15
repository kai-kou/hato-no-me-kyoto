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
  const G = gpu();
  const iv = setInterval(() => { const a = window.__app, dt = performance.now() - t0;
    if (!a || !a.ready || !(a.frames > 2)) { if (dt > 240000) { clearInterval(iv); post({ failed: 'not ready after 240 s', stage: a && a.stage || null, gpu: G, text: (document.getElementById('err') || {}).textContent || '' }); } return; }
    clearInterval(iv); const load = Math.round(dt) / 1000; document.body.classList.add('started'); const ms = [];
    setTimeout(() => { const s = setInterval(() => { const S = a.S; if (S.ms) ms.push(+S.ms.toFixed(2));
      if (ms.length >= N || performance.now() - t0 > 200000) { clearInterval(s); const i = a.renderer.info.render, c = a.renderer.domElement, so = ms.slice().sort((x, y) => x - y);
        let audio = null; try { const AC = window.AudioContext || window.webkitAudioContext; audio = AC ? 'available' : 'missing'; } catch (e) { }
        post({ gpu: G, load, ms, median: so.length ? so[so.length >> 1] : null, max: so.length ? so[so.length - 1] : null, drs: a.drs, scale: a.Q.scale, tier: a.Q.tier, lite: !!S.lite, calls: i.calls, tris: i.triangles,
          canvas: [c.width, c.height], mode: S.mode, frames: a.frames, peopleAsset: a.peopleAsset || 0, lost: !!a.lost, probeOff: !!(a.post && a.post.noProbe), audio }); } }, 1050); }, settle * 1000); }, 250);
})();
