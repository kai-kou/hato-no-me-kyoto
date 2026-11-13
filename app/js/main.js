// Entry: quality tiers, loading, main loop.
import * as THREE from './three.module.min.js';
import { World, U } from './world.js';
import { Post } from './post.js';

const qs = new URLSearchParams(location.search), $ = id => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches, mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
function pickTier() {
  const f = qs.get('q'); if (f) return f; let s = null; try { s = localStorage.getItem('hato.q'); } catch (e) { }
  if (s === 'low' || s === 'mid' || s === 'high') return s;
  if (coarse || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) return ((navigator.deviceMemory ? mem >= 6 : ((window.devicePixelRatio || 1) >= 3 || Math.max(screen.width, screen.height) >= 1000)) && cores >= 4) ? 'mid' : 'low'; return 'high';
}
const TIERS = {
  high: { pbr: true, msaa: 4, scale: 1.0, maxPR: 1.5, shadow: 2048, shadowRange: 75, aniso: 8, texMax: 3, texU: 24, texH: 70, texM: 190, texConc: 3, terrainStep: 2, bloomLv: 5, dof: true, dofTaps: 32, refl: true, panoSize: 768, birds: 90, bsh: 1024, bao: 256, leaf: 1, shadowEvery: 1, cover: 1 },
  mid: { pbr: true, msaa: 2, scale: 0.75, maxPR: 2, shadow: 1536, shadowRange: 60, aniso: 4, texMax: 2, texU: 0, texH: 46, texM: 150, texConc: 2, terrainStep: 2, bloomLv: 4, dof: true, dofTaps: 18, refl: false, panoSize: 512, birds: 70, bsh: 768, bao: 192, leaf: 0.6, shadowEvery: 3, cover: 0.6 },
  low: { pbr: false, msaa: 0, scale: 0.6, maxPR: 2, shadow: 1024, shadowRange: 42, aniso: 2, texMax: 2, texU: 0, texH: 30, texM: 110, texConc: 2, terrainStep: 4, bloomLv: 3, dof: false, dofTaps: 12, refl: false, panoSize: 384, birds: 46, bsh: 512, bao: 128, leaf: 0.35, shadowEvery: 4, cover: 0 },
};
const tier = TIERS[pickTier()] ? pickTier() : 'high', Q = { tier, ...TIERS[tier] }; if (qs.get('scale')) Q.scale = +qs.get('scale'); if (qs.get('tex')) { Q.texMax = 3; Q.texU = +qs.get('tex') || 24; } const REC = +(qs.get('rec') || 0); // rec = frames per second: fixed time step, one frame per window.__next (used to capture clips)
const canvas = $('c');
let renderer; try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }); } catch (e) { const el = $('err'); if (el) { el.textContent = 'この端末・ブラウザでは WebGL2 を使えないため表示できません。'; el.style.display = 'block'; } throw e; }
// restart at another quality level: the stored choice when storage works, otherwise carried in the address
function restartAt(t) { let ok = false; try { localStorage.setItem('hato.q', t); ok = localStorage.getItem('hato.q') === t; } catch (e) { } if (ok && !qs.get('q')) { location.reload(); return; } const u = new URL(location.href); u.searchParams.set('q', t); location.replace(u.href); }
// a lost WebGL context (memory pressure on a phone, a long spell in the background) cannot be resumed in place: say so and restart one quality step lower
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (app.lost) return; app.lost = true; app.ready = false; let n = 9; try { n = +(sessionStorage.getItem('hato.lost') || 0); sessionStorage.setItem('hato.lost', String(n + 1)); } catch (err) { }
  const next = tier === 'high' ? 'mid' : 'low', auto = n < 2, el = $('lost'), msg = $('lostMsg'), btn = $('lostBtn'); if (msg) msg.textContent = auto ? `描画が中断されました（端末のメモリ不足などで起こります）。画質を「${next === 'mid' ? '中' : '軽'}」にして再開します。` : '描画が繰り返し中断されました。この端末では負荷が高すぎる可能性があります。下のボタンで画質「軽」から再開できます。';
  if (btn) btn.onclick = () => restartAt(auto ? next : 'low'); if (el) el.classList.add('on'); if (auto) setTimeout(() => restartAt(next), 2600); });
renderer.setClearColor(0x000000, 1); renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.info.autoReset = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.03, 30000);
const post = new Post(renderer, Q), world = new World(renderer, scene, Q);
const app = { Q, qs, renderer, scene, camera, post, world, hour: +(qs.get('t') || 9.6), timeScale: +(qs.get('ts') || 0), focus: new THREE.Vector3(-70, 0, 0), ready: false, drs: 1, expoK: 1, pano: null };
app.restartAt = restartAt; window.__app = app;

function resize() { const pr = Math.min(window.devicePixelRatio || 1, Q.maxPR) * Q.scale * app.drs, w = Math.max(2, Math.round(innerWidth * pr)), h = Math.max(2, Math.round(innerHeight * pr)); renderer.setSize(w, h, false); post.setSize(w, h); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250)); resize(); app.resize = resize;

// Loading screen. The download fills the bar to 78 % and is reported in megabytes (the weights are the file sizes in MB); the rest is the build,
// one named step at a time. Each step waits a moment first, so that the browser can show its name before the step blocks the page.
const prog = {}, T0 = performance.now(), STEPS = ['light', 'city', 'ground', 'water', 'birds', 'scenery', 'people', 'cover', 'gpu']; app.boot = { steps: [] };
const setBar = p => { const el = $('bar'); if (el) el.style.width = p.toFixed(1) + '%'; const pc = $('pct'); if (pc) pc.textContent = Math.round(p) + '%'; };
function onProg(k, f, w) { prog[k] = [f, w]; let a = 0, b = 0; for (const key in prog) { a += prog[key][0] * prog[key][1]; b += prog[key][1]; } const tot = Math.max(b, 19.3); if (app.boot.steps.length) return; setBar(78 * a / tot); const st = $('stage'); if (st) st.textContent = `街のデータを取得中　${a.toFixed(1)} / ${tot.toFixed(1)} MB`; }
app.stage = (key, label) => { const i = Math.max(0, STEPS.indexOf(key)); if (!app.boot.steps.length) app.boot.fetched = Math.round(performance.now() - T0); app.boot.steps.push([key, Math.round(performance.now() - T0)]); setBar(78 + 22 * i / STEPS.length); const st = $('stage'); if (st) st.textContent = label; return new Promise(r => setTimeout(r, 24)); };

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); let dt = Math.min(0.05, (now - last) / 1000); last = now; if (!app.ready || document.hidden) return;
  if (REC) { if (!window.__next) return; window.__next = false; dt = 1 / REC; }
  renderer.info.reset(); app.rawDt = REC ? 0.016 : dt;
  if (app.timeScale) { app.hour = (app.hour + dt * app.timeScale / 3600) % 24; world.setHour(app.hour); }
  if (app.tick) app.tick(dt);
  world.update(camera, app.focus, dt);
  post.opts.exposure = world.env.exposure * app.expoK;
  if (app.pano) { U.uReflOn.value = 0; const p = app.pano; post.renderPano(scene, p.eye, p.F, p.R, p.Up); }
  else {
    if (Q.refl && app.reflY !== undefined && app.reflY !== null) post.renderReflection(scene, camera, app.reflY, [world.water].filter(Boolean)); else U.uReflOn.value = 0;
    post.renderScene(scene, camera);
  }
  post.finish();
  app.frames = (app.frames || 0) + 1; if (REC) window.__rendered = app.frames;
  if (!app.shown) { app.shown = true; app.boot.shown = Math.round(performance.now() - T0); const ld = $('loading'); if (ld) ld.classList.add('done'); document.body.classList.add('ready'); }   // the loading screen stays until the first frame is on the screen
}

// Large static meshes are split into spatial chunks that share the vertex buffers, so that the frustum test can leave out what is off screen.
// The ground was one mesh of 424,000 triangles with a 335 m bounding sphere, the seated and standing people one of 199,000: neither was ever left out,
// and the pigeon's-eye view draws the scene six times. The original mesh stays where it was (visibility, material and uniforms still go through it) but is taken off every layer.
function chunkStatic(root, minTris = 40000, minR = 60) {
  const list = []; let made = 0;
  root.traverse(o => { const g = o.geometry; if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.userData.chunked && o.frustumCulled && g && g.index && !Array.isArray(o.material) && !g.groups.length && !g.morphAttributes.position && g.attributes.position && !g.attributes.position.isInterleavedBufferAttribute) list.push(o); });
  for (const m of list) { const g = m.geometry, idx = g.index.array, P = g.attributes.position.array; if (idx.length / 3 < minTris || g.drawRange.start !== 0 || g.drawRange.count < idx.length) continue;
    if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius < minR) continue;
    const cell = Math.max(32, g.boundingSphere.radius / 4), bins = new Map();   // about eight cells across (84 m for the ground, 40 m for the seated people): smaller cells leave out more triangles but cost a draw call each, six times over in the pigeon's-eye view
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, k = (Math.floor((P[a] + P[b] + P[c]) / 3 / cell) + 512) * 1024 + Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / cell) + 512;
      let arr = bins.get(k); if (!arr) bins.set(k, arr = []); arr.push(idx[t], idx[t + 1], idx[t + 2]); }
    if (bins.size < 2) continue;
    for (const arr of bins.values()) { const cg = new THREE.BufferGeometry(); for (const k in g.attributes) cg.setAttribute(k, g.attributes[k]); cg.setIndex(new THREE.BufferAttribute(new idx.constructor(arr), 1));
      const box = new THREE.Box3(), v = new THREE.Vector3(); for (let i = 0; i < arr.length; i++) { const q = arr[i] * 3; box.expandByPoint(v.set(P[q], P[q + 1], P[q + 2])); } cg.boundingBox = box; cg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const cm = new THREE.Mesh(cg, m.material); cm.castShadow = m.castShadow; cm.receiveShadow = m.receiveShadow; cm.renderOrder = m.renderOrder; cm.layers.mask = m.layers.mask; cm.onBeforeRender = m.onBeforeRender; cm.onAfterRender = m.onAfterRender;
      if (m.customDepthMaterial) cm.customDepthMaterial = m.customDepthMaterial; if (m.customDistanceMaterial) cm.customDistanceMaterial = m.customDistanceMaterial; cm.userData = Object.assign({}, m.userData, { chunked: true }); m.add(cm); made++; }
    m.userData.chunked = true; m.layers.disableAll(); }
  return made;
}
(async () => {
  try {
    await world.load(onProg, app.stage); world.setHour(app.hour);
    U.uWet.value = +(qs.get('wet') || 0);
    const c = (qs.get('cam') || '-66,1.2,40,-80,2.5,-40').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); app.focus.set(c[0], 0, c[2]); if (qs.get('fov')) { camera.fov = +qs.get('fov'); camera.updateProjectionMatrix(); }
    if (qs.get('refl')) app.reflY = +qs.get('refl');
    if (qs.get('dof')) { const d = qs.get('dof').split(',').map(Number); post.opts.dofOn = true; post.opts.focus = d[0]; post.opts.aperture = d[1]; }
    const mod = await import('./game.js'); await mod.start(app);
    if (!qs.get('nochunk')) app.boot.chunks = chunkStatic(scene);
    // compile the shaders of the scene before the first frame, in the background where the browser can (KHR_parallel_shader_compile): otherwise the first frame blocks the page for as long as that takes
    await app.stage('gpu', '描画の準備中（初回は少し時間がかかります）');
    if (!qs.get('nopre')) { try { renderer.setRenderTarget(post.rt); if (renderer.extensions.has('KHR_parallel_shader_compile')) await Promise.race([renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 25000))]); else renderer.compile(scene, camera); } catch (e) { console.warn('precompile: ' + (e && e.message)); } renderer.setRenderTarget(null); }
    app.boot.ready = Math.round(performance.now() - T0); setBar(100);
    app.ready = true;
    world.bg.then(() => { if (!qs.get('nochunk')) app.boot.chunks += chunkStatic(scene); app.bgDone = true; }).catch(e => console.warn('background load: ' + e.message));
  } catch (e) { console.error(e); const el = $('err'); if (el) { el.textContent = '読み込みに失敗しました: ' + (e && e.message || e); el.style.display = 'block'; } }
})();
requestAnimationFrame(frame);
