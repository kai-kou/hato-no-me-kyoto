// Game layer: flock, cameras (pigeon eye / chase / telephoto / overview / cinema), input, HUD, sound.
import * as THREE from './three.module.min.js';
import { Birds, BirdShadow, Crumbs } from './birds.js';
import { Flock } from './flock.js';
import { U, cityMaterial } from './world.js';
import { Sound } from './audio.js';
import { buildScenery } from './scenery.js';
import { People, Traffic } from './life.js';
import { Cover } from './cover.js';
import { clamp, lerp, damp, dampAng, angDiff, smooth, TAU, rr, R, numq, listq } from './util.js';

const $ = id => document.getElementById(id), V = () => new THREE.Vector3();
const DEGR = 180 / Math.PI;

// ethogram: key -> [name, note]
export const ETHO = {
  peck: ['採餌（ついばみ）', '地面の粒を嘴で1つずつつまむ。1日に食べる量は体重の1割ほど。'],
  walk: ['歩行とヘッドボブ', '頭を空間に止める「ホールド」と、次の位置へ送る「スラスト」の繰り返し。網膜に映る景色のブレを止めている。'],
  look: ['見張り', '左右の目で別々の方向を見る。視野は左右あわせて約320度、真後ろの約40度だけが死角。'],
  takeoff: ['飛び立ち', '脚で跳び上がり、最初の数回は翼を背中で打ち合わせる。この音は仲間への警戒信号にもなると考えられている。'],
  fly: ['飛行', '羽ばたきは毎秒6〜9回。街中の移動では時速40〜60kmほどで飛ぶ。'],
  glide: ['滑空', '羽ばたきを止め、翼を浅いV字に保って滑る。旋回や着地前によく見られる。'],
  land: ['着地', '体を起こして翼と尾羽を大きく広げ、空気抵抗で減速。脚を前に突き出して接地する。'],
  preen: ['羽づくろい', '尾の付け根の脂と、粉綿羽から出る粉で羽毛を整える。1日のかなりの時間をこれに使う。'],
  sun: ['日光浴', '片方の翼を持ち上げて体を傾け、羽毛の内側まで日光を当てる。'],
  rest: ['休息', '羽毛をふくらませて体温を保つ。食後は高い場所で長く休む。'],
  sleep: ['うたた寝', '首を縮めて目を閉じる。浅い眠りのあいだも周囲の動きには反応する。'],
  court: ['求愛ディスプレイ', 'オスは喉をふくらませ、尾羽を広げて地面を掃きながら、おじぎと回転を繰り返して鳴く。'],
  drink: ['水飲み', '嘴を水につけたまま吸い上げて飲む。上を向かずに飲めるのはハトの仲間の特徴。'],
  bathe: ['水浴び', '浅瀬に伏せて翼を震わせ、羽毛の汚れを落とす。終わると高い場所で乾かす。'],
  flush: ['一斉飛翔', '1羽の急な飛び立ちが群れ全体に伝わり、ほぼ同時に舞い上がる。旋回して元の場所へ戻ることが多い。'],
  roost: ['ねぐら', '日没前後に軒下や橋桁などのねぐらへ戻り、朝まで動かない。この作品では夜の画面で見えるように、街灯の届く場所に寄せてある。'],
};
// where and when to look for each behaviour: shown in the ethogram while it is still unseen
const ETHO_HINT = {
  peck: '地上の群れ。朝と夕方に多い。エサをまくと確実', walk: '地上を歩くハトを追う', look: '歩く合間に、首を伸ばして止まる瞬間',
  takeoff: '群れが場所を移るとき。「手をたたく」でも見られる', fly: '飛び立ったハトを追う', glide: '飛行の途中や、着地の手前', land: '飛行の終わり。エサをまくと降りてくる',
  preen: '昼どき、軒や欄干で休んでいる群れ', sun: '昼どき、休んでいるハトがときどき翼を上げる', rest: '昼どきの高い場所。食後のハト', sleep: '休んでいるハトが目を閉じる。夜はねぐらで',
  court: '地上の群れの中。オスがメスのそばで喉をふくらませる', drink: '鴨川の西岸の水際。まれなので、時間の流れを速めて探す', bathe: '鴨川の西岸の浅瀬。水飲みよりさらにまれ',
  flush: '「手をたたく」。トビが近づいたときにも起こる', roost: '左上の時刻から「夜」へ。軒先や納涼床の上',
};
const ETHO_KEYS = Object.keys(ETHO);
const MODES = ['eye', 'chase', 'tele', 'over', 'cine'];
const MODE_HINT = { eye: 'ハトの視野（約320°）を1枚に展開', chase: 'ドラッグで回り込み・ピンチで距離', tele: '望遠レンズで観察。ドラッグで回り込み', over: '上空から群れを俯瞰。タップでハト選択・エサ', cine: '自動カメラ' };

export async function start(app) {
  const { Q, qs, scene, world, camera, post, renderer } = app, nav = world.nav;
  const stage = app.stage || (async () => { }); await stage('birds', 'ハトの群れを配置中');
  const KITES = qs.get('studio') ? 0 : 3, birds = new Birds(scene, Q, numq(qs.get('n'), Q.birds, 2, 240) | 0, KITES), flock = new Flock(app, birds); app.birds = birds; app.flock = flock;
  if (qs.get('studio')) return studio(app, flock);
  const shadows = new BirdShadow(renderer, scene, birds, Q);
  const crumbs = new Crumbs(scene, cityMaterial('frnp', Q, { rough: 0.9, uniforms: { uTint: { value: new THREE.Color(0.78, 0.66, 0.44) }, uGrain: { value: 0.25 } } }));
  await stage('scenery', '木と橋を配置中');
  try { app.scenery = buildScenery(app); const rs = app.scenery.roosts; if (rs && rs.length) { flock.roosts = rs; for (const st of flock.sites) if (Math.hypot(st.x + 64, st.z - 153) < 70) st.perch = st.perch.concat(rs.filter((_, i) => i % 3 === 0)); } } catch (e) { console.warn('scenery: ' + e.message); }
  let people = null, traffic = null; await stage('people', '人と車を配置中');
  try { if (!qs.get('nolife')) { people = new People(app, { walkers: Q.tier === 'low' ? 8 : 14, couples: Q.tier === 'low' ? 6 : 9 }); flock.threats = people.threats; traffic = new Traffic(app, app.scenery && app.scenery.deckY, { kawabata: Q.tier === 'low' ? 8 : 12, shijo: Q.tier === 'low' ? 5 : 7 }); app.people = people; app.traffic = traffic; } } catch (e) { console.warn('life: ' + e.message); }
  await stage('cover', '足元の小石と草を配置中');
  let cover = null; try { if (Q.cover && !qs.get('nocover')) cover = new Cover(app); app.cover = cover; } catch (e) { console.warn('cover: ' + e.message); }
  const snd = new Sound(); app.snd = snd;
  // black kites soaring over the river (a familiar sight on the Kamo); the pigeons watch the sky for them
  const kites = []; for (let k = 0; k < KITES; k++) { const kb = flock._spawn(flock.n + k); birds.setMorph(kb.i, [0.15, 0.095, 0.06, 3], [0.21, 0.14, 0.085, 0]);
    Object.assign(kb, { air: true, st: 'fly', glide: true, landing: 0, takeoff: 5, alarm: false, vy: 0, bank: 0, perch: null, kite: { cx: -40 + rr(-30, 70), cz: rr(-150, 110), r: rr(40, 75), a: rr(0, TAU), h: rr(60, 115), w: rr(0.10, 0.15) * (R() < 0.5 ? 1 : -1), drift: rr(0, TAU) } }); kb.pose.scale = 2.3; kites.push(kb); }
  let kiteCall = rr(12, 30);
  function flyKites(dt) { const day = world.env.night < 0.3;
    for (const kb of kites) { const K = kb.kite, s = Math.sign(K.w); K.a += K.w * dt; K.drift += dt * 0.012; const cx = K.cx + Math.sin(K.drift) * 60, cz = K.cz + Math.cos(K.drift * 0.7) * 90;
      kb.x = cx + Math.cos(K.a) * K.r; kb.z = cz + Math.sin(K.a) * K.r; kb.y = (day ? K.h : 600) + Math.sin(K.a * 0.37) * 9; kb.yaw = Math.atan2(-Math.sin(K.a) * s, Math.cos(K.a) * s); kb.bank = damp(kb.bank, -0.32 * s, 2, dt); kb.glide = Math.sin(K.a * 2.3 + K.h) > -0.75; flock.animate(kb, dt); birds.write(kb.i, kb.pose); }
    birds.commit(); if (!day || !kites.length) return;
    kiteCall -= dt; if (kiteCall <= 0) { kiteCall = rr(35, 95); const kb = kites[(R() * kites.length) | 0]; try { snd.kite(Math.hypot(kb.x - camera.position.x, kb.y - camera.position.y, kb.z - camera.position.z)); } catch (e) { } }
    if (S.started && R() < dt / 170) { const kb = kites[(R() * kites.length) | 0]; let n = 0; for (const q of flock.B) if (!q.air && q.st === 'forage' && Math.hypot(q.x - kb.x, q.z - kb.z) < 28) n++; if (n >= 4 && flock.scare(kb.x, kb.z, 28, true) >= 4) toast('上空をトビが通過 — ハトが一斉に飛び立った'); } }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, uniforms: { uA: { value: 0 } }, vertexShader: `varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: `precision highp float; varying float vD; uniform float uA; void main(){ gl_FragColor = vec4(vec3(1.6, 0.42, 0.2), uA); }` }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5; ring.visible = false; ring.frustumCulled = false; scene.add(ring);

  // ---------------------------------------------------------------- state
  const S = { mode: qs.get('m') || 'eye', focus: 0, manual: false, t: 0, snap: true, lastDrag: -9, chaseYaw: 0, eyeYaw: 0, eyePitch: 0, eyeRoll: 0, overT: V(), shot: null, shotT: 0, wet: +(qs.get('wet') || 0), started: !!qs.get('auto'), hudT: 0, act: '', seen: {}, fpsT: 0, fpsN: 0, slow: 0, fast: 0, ui: true };
  const ORB = { chase: { yaw: 0, pitch: 0.2, dist: 0.78, min: 0.3, max: 6 }, tele: { yaw: -1.35, pitch: 0.035, dist: 5.2, min: 1.2, max: 60 }, over: { yaw: 0.5, pitch: 0.9, dist: 10, min: 4, max: 420 } };
  const cam = { pos: V(), look: V(), fov: 50 }, tA = V(), tB = V(), tC = V(), tD = V(), tE = V();
  const input = { mx: 0, my: 0, flap: false, peck: false, keys: {} };
  try { S.seen = JSON.parse(localStorage.getItem('hato.seen') || '{}'); } catch (e) { }
  app.S = S; app.ORB = ORB;
  if (qs.get('orb')) { const o = listq(qs.get('orb'), null), t = ORB[S.mode] || ORB.tele; if (o && o.length >= 3) { t.yaw = o[0]; t.pitch = o[1]; t.dist = clamp(o[2], 0.05, 4000); } }
  if (qs.get('f')) S.focus = clamp(+qs.get('f') | 0, 0, flock.n - 1);
  const B = () => flock.B[S.focus];
  const dirOf = (yaw, pitch, o) => o.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const placeOf = (x, z) => x < -88 ? '先斗町' : x < -57 ? '鴨川 西岸・納涼床の下' : x < -12 ? '鴨川' : x < 38 ? '川端通' : (z < -18 ? '祇園白川' : '祇園');

  // ---------------------------------------------------------------- actions
  // the one strip that both eyes see is the point of the pigeon's-eye view: it is lit up for a few seconds the first two times the view opens
  function bandIntro() { if (!S.started || (S.bandN || 0) >= 2) return; S.bandN = (S.bandN || 0) + 1; const c = document.body.classList; c.remove('band'); void document.body.offsetWidth; c.add('band'); clearTimeout(S.bandT); S.bandT = setTimeout(() => c.remove('band'), 6500); }
  function setMode(m) { if (!MODES.includes(m)) return; S.mode = m; S.snap = true; S.shot = null; S.shotT = 0; if (m === 'chase') { S.chaseYaw = B().yaw; ORB.chase.yaw = 0; } if (m === 'over') S.overT.set(B().pose.x, B().pose.y, B().pose.z); if (m === 'eye') { S.eyeYaw = B().yaw; bandIntro(); } if (m === 'tele') teleYaw(ORB.tele.yaw); if (S.manual && (m === 'tele' || m === 'cine')) setManual(false); ui.modes(); toast(MODE_HINT[m]); }
  // how much of the line from the lens to the bird is blocked. The map is 2.5-D (ground, roofs, furniture tops), which is enough to keep the lens out of walls, decks and fences.
  const crowns = app.scenery && app.scenery.crowns || [];
  const inCrown = (x, y, z) => { for (const c of crowns) { if (y < c[1] + c[3] * 0.2 || y > c[1] + c[3] + 0.4) continue; const dx = x - c[0], dz = z - c[2], r = c[4] * 1.05; if (dx * dx + dz * dz < r * r) return true; } return false; };
  function sight(b, yaw, pitch, dist) { const cp = Math.cos(pitch), sx = -Math.sin(yaw) * cp, sz = -Math.cos(yaw) * cp, sy = Math.sin(pitch), y0 = b.y + 0.09; let hit = 0; for (let t = 0.3; t <= dist; t += 0.25) { const x = b.x + sx * t, z = b.z + sz * t, y = y0 + sy * t; if (nav.top(x, z) > y + 0.04 || inCrown(x, y, z)) hit++; } return hit; }
  function teleYaw(base) { // pick a viewing direction with a clear line of sight to the subject; for a bird on a ledge, also look from higher up if every level view is blocked
    const b = B(), o = ORB.tele, high = b.y - nav.ground(b.x, b.z) > 0.6 && !b.air; if (S.pitchAuto !== undefined && !high) { o.pitch = S.pitchAuto; S.pitchAuto = undefined; } let best = base, bp = o.pitch, bs = 1e9;
    for (const pitch of high ? [o.pitch, 0.30, 0.58] : [o.pitch]) { for (let k = 0; k < (high ? 15 : 9); k++) { const yaw = base + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42), sx = -Math.sin(yaw), sz = -Math.cos(yaw); let sc = k * 0.35 + (pitch === o.pitch ? 0 : 3 + pitch * 3);
      for (const q of flock.B) { if (q === b) continue; const dx = q.x - b.x, dz = q.z - b.z, t = dx * sx + dz * sz; if (t < 0.15 || t > o.dist + 1) continue; const perp = Math.abs(dx * sz - dz * sx); if (perp < 0.3 + t * 0.035) sc += 3; }
      const cx = b.x + sx * o.dist, cz = b.z + sz * o.dist; if (!high && (nav.cls(cx, cz) === 3 || nav.waterY(cx, cz) > nav.ground(cx, cz) + 0.3)) sc += 4; if (high) sc += sight(b, yaw, pitch, o.dist) * 5; if (sc < bs) { bs = sc; best = yaw; bp = pitch; } } if (bs < 3) break; }
    o.yaw = best; if (bp !== o.pitch) { if (S.pitchAuto === undefined) S.pitchAuto = o.pitch; o.pitch = bp; } }
  function setFocus(i, quiet) { if (i === S.focus) return; if (S.manual) setManual(false); S.focus = i; S.snap = true; teleYaw(ORB.tele.yaw); S.chaseYaw = B().yaw; S.eyeYaw = B().yaw; S.overT.set(B().pose.x, B().pose.y, B().pose.z); if (!quiet) ui.card(true); }
  // at night most of the flock sleeps where the street lamps reach; a bird in the dark would leave the screen black, so the camera picks a lit one
  const litOf = b => b.st === 'roost' && b.home ? (b.home.lit || 0) : 0;
  const openTo = b => { let m = 99; for (let k = 0; k < 12 && m > 0; k++) m = Math.min(m, sight(b, k * 0.5236, 0.035, 4.5)); return m === 0 ? 1 : m < 3 ? 0.5 : 0.15; };   // can a level lens 4.5 m away see it from somewhere?
  function litFocus() { if (litOf(B()) > 0.3 && openTo(B()) === 1) return; let best = -1, bs = 0.1; for (const q of flock.B) { const l = litOf(q); if (l < 0.1) continue; const v = l * openTo(q) * (0.8 + 0.4 * R()); if (v > bs) { bs = v; best = q.i; } } if (best >= 0) setFocus(best, true); }
  function nextBird() { // prefer birds doing something worth watching
    const score = b => (b.st === 'court' ? 6 : b.st === 'bathe' ? 6 : b.st === 'drink' ? 5 : b.st === 'loaf' && b.sub !== 'rest' ? 3 : b.st === 'forage' ? 2.5 : b.air ? 2 : b.st === 'roost' ? 0.2 + 6 * litOf(b) : 1) * (0.5 + R());
    let best = -1, bs = -1; for (const b of flock.B) { if (b.i === S.focus) continue; const s = score(b); if (s > bs) { bs = s; best = b.i; } } if (best >= 0) setFocus(best);
  }
  function setManual(on) { const b = B(); S.manual = on; b.manual = on; if (on) { b.st = b.air ? 'fly' : 'forage'; b.pause = 0; b.peck = 0; b.food = null; b.alarm = false; if (S.mode !== 'eye' && S.mode !== 'chase') setMode('chase'); toast(coarse ? '左のスティックで移動、「はばたく」で飛ぶ' : 'WASDで移動、Spaceで羽ばたく、Eでついばむ'); } else { if (b.air) { const g = flock._groundPoint(b.site, 6); flock.flyTo(b, g.x, g.y, g.z, 'forage'); } else { b.st = 'forage'; b.think = 0.2; } } ui.manual(); }
  function feedAt(x, z, n = 30) { if (!nav.walkable(x, z) || nav.cls(x, z) === 1) { toast('そこにはまけません'); return false; }
    const y = nav.ground(x, z), near = flock.sites.reduce((a, s) => (Math.hypot(s.x - x, s.z - z) < Math.hypot(a.x - x, a.z - z) ? s : a), flock.sites[0]), site = { x, z, r: 2.4, n: 'エサ場', w: 1, y, perch: near.perch };
    for (let k = 0; k < n; k++) flock._crumb(site, 0.9);
    let called = 0, asleep = 0; for (const q of flock.B) { if (q.manual) continue; if (q.st === 'roost' || flock.asleep(q, app.hour)) { asleep++; continue; } const d = Math.hypot(q.x - x, q.z - z);
      if (q.air) { if (q.alarm && q.t < 2.5) continue; if (d < 110 && R() < (d < 45 ? 0.9 : 0.6)) { q.callT = rr(0.2, 1.4) + d * 0.02; q.callS = site; q.hunger = Math.max(q.hunger, 0.6); called++; } }   // a pigeon on the wing sees the scatter from further away than one on the ground
      else if (d < 55 && R() < (d < 20 ? 0.9 : 0.5)) { q.callT = rr(0.3, 1.2) + d * 0.05; q.callS = site; q.hunger = Math.max(q.hunger, 0.6); called++; } }
    snd.step(1, 0); return asleep > flock.n * 0.6 ? 'エサをまいた（夜はねぐらで眠っていて、降りてこない）' : 'エサをまいた'; }
  app.feedAt = feedAt;
  function clap() { const b = B(), p = cam.look; try { snd.clap(); } catch (e) { } const n = flock.scare(p.x, p.z, 17, true); if (!n) toast('近くに地上のハトがいません'); }
  // messages take turns: one that has just appeared is not overwritten by the next (a reply to a tap would vanish behind an ethogram note in the same frame)
  function toast(msg, low) { const el = $('toast'); if (!el || !msg) return; const T = toast.s || (toast.s = { q: [], on: false, at: 0, t: 0, low: false });
    if (T.q.some(m => m[0] === msg) || (T.on && !T.q.length && el.textContent === msg)) return;
    // a reply to something the visitor just did goes ahead of the ethogram notes, and replaces one that is on screen
    if (!low) T.q = T.q.filter(m => !m[1]); T.q.push([msg, !!low]); if (T.q.length > 3) T.q.shift();
    const show = () => { const m = T.q.shift(); if (m === undefined) { el.classList.remove('on'); T.on = false; return; } T.on = true; T.low = m[1]; T.at = performance.now(); el.textContent = m[0]; el.classList.add('on'); T.t = setTimeout(show, T.q.length ? 2400 : 3600); };
    if (!T.on) show(); else { clearTimeout(T.t); T.t = setTimeout(show, !low && T.low ? 0 : Math.max(0, 2000 - (performance.now() - T.at))); } }

  // ---------------------------------------------------------------- manual flight / walking
  flock.manualStep = (b, dt) => {
    const k = input.keys, mx = clamp(input.mx + (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), -1, 1), my = clamp(input.my + (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), -1, 1), flap = input.flap || k.Space, m = Math.min(1, Math.hypot(mx, my));
    const ref = S.mode === 'eye' ? S.eyeYaw : S.chaseYaw + ORB.chase.yaw;
    if (!b.air) {
      b.st = 'forage'; b.t += dt;
      if (b.peck > 0) { b.v = 0; }
      else if (m > 0.12) { const want = ref + Math.atan2(-mx, my), v = lerp(0.22, 0.85, m); b.yaw = dampAng(b.yaw, want, 9, dt); const nx = b.x + Math.sin(b.yaw) * v * dt, nz = b.z + Math.cos(b.yaw) * v * dt; if (flock.canStep(b, nx, nz)) { b.x = nx; b.z = nz; b.v = damp(b.v, v, 10, dt); } else b.v = damp(b.v, 0, 12, dt); if (b.y - nav.ground(b.x, b.z) < 0.6) b.y = nav.ground(b.x, b.z); }
      else b.v = damp(b.v, 0, 12, dt);
      if ((input.peck || k.KeyE) && b.peck === 0) { let best = null, bd = 0.05; for (const f of flock.food) { const d = (f.x - b.x) ** 2 + (f.z - b.z) ** 2; if (d < bd) { bd = d; best = f; } } flock.peckAt(b, best); input.peck = false; }
      if (flap && b.peck === 0) { b.air = true; b.st = 'fly'; b.takeoff = 0; b.vx = Math.sin(b.yaw) * 2.2; b.vz = Math.cos(b.yaw) * 2.2; b.vy = 3.2; b.dest = { x: b.x, y: b.y, z: b.z }; b.perch = null; flock.events.push({ t: 'takeoff', b, alarm: false }); }
    } else {
      if (input.peck || k.KeyE) { input.peck = false; if (S.t - (S.peckHint || -9) > 3) { S.peckHint = S.t; toast('空中ではついばめない。着地してから'); } }
      b.st = 'fly'; b.t += dt; let sp = Math.hypot(b.vx, b.vz);
      b.yaw -= mx * 1.9 * dt; b.bank = damp(b.bank, clamp(-mx * 0.75, -0.9, 0.9), 5, dt);
      const tsp = flap ? 12.5 : Math.max(6.5, sp - 2.0 * dt); sp = damp(sp, tsp, flap ? 1.6 : 0.5, dt); b.glide = !flap && sp > 5;
      const tvy = flap ? 2.2 + my * 4.5 : -1.3 + my * 3.5; b.vy = damp(b.vy, tvy, 3.5, dt);
      let nx = b.x + Math.sin(b.yaw) * sp * dt, nz = b.z + Math.cos(b.yaw) * sp * dt; const lim = 560; nx = clamp(nx, -lim, lim + 140); nz = clamp(nz, -lim - 80, lim);
      const wall = nav.roof(nx, nz); if (wall > b.y + 0.35) { sp *= 0.5; b.vy = Math.max(b.vy, 5.5); nx = b.x; nz = b.z; b.yaw += 1.6 * dt * (mx <= 0 ? 1 : -1); }
      b.vx = Math.sin(b.yaw) * sp; b.vz = Math.cos(b.yaw) * sp; b.x = nx; b.z = nz; b.y = Math.min(b.y + b.vy * dt, 230); b.speed = Math.hypot(sp, b.vy);
      const top = nav.top(b.x, b.z), h = b.y - top; b.landing = b.vy < 0.4 && !flap ? clamp(1 - h / 1.6, 0, 1) : 0;
      if (h <= 0.03) { const water = nav.waterY(b.x, b.z) > nav.ground(b.x, b.z) + 0.07 && nav.roof(b.x, b.z) < -900 && nav.furn(b.x, b.z) < -900;
        if (water || flap) { b.y = top + 0.03; b.vy = Math.max(b.vy, water ? 4.5 : 2.5); if (water) flock.events.push({ t: 'splash', b }); }
        else { b.y = top; b.air = false; b.vx = b.vy = b.vz = 0; b.v = 0; b.bank = 0; b.landT = 0.5; b.glide = false; b.gait.init = false; b.head.hold = null; b.landing = 0; flock.events.push({ t: 'land', b }); } }
    }
  };

  // ---------------------------------------------------------------- cinema director
  const CRANES = [
    { a: [-61, 1.3, 48], b: [-63, 2.6, 8], l: [-84, 2.4, -60], fov: 44, dur: 12 },
    { a: [-101.6, 3.5, 96], b: [-101.9, 3.7, 60], l: [-102, 3.4, -40], fov: 50, dur: 11 },
    { a: [150, 4.6, -66], b: [178, 4.4, -65], l: [230, 4.2, -62], fov: 52, dur: 12 },
    { a: [203, 4.7, -46], b: [207, 4.3, -50], l: [219, 4.0, -61], fov: 52, dur: 10 },
    { a: [-70, 46, 150], b: [-36, 64, 70], l: [80, 0, -90], fov: 46, dur: 13 },
    { a: [-30, 1.2, -40], b: [-30, 2.0, -8], l: [-80, 3.5, 40], fov: 38, dur: 11 },
  ];
  function direct(dt) {
    S.shotT -= dt; if (S.shot && S.shotT > 0) return; if (qs.get('crane')) { const c = CRANES[+qs.get('crane') % CRANES.length]; S.shot = { k: 'crane', c, dur: c.dur, t0: S.t }; S.shotT = c.dur; S.snap = true; return; } const night = world.env.night > 0.6, r = R();
    let k = r < 0.36 ? 'low' : r < 0.52 ? 'chase' : r < 0.66 ? 'over' : r < 0.78 ? 'eye' : 'crane'; if (night && k !== 'crane') k = R() < 0.5 ? 'low' : 'over'; const first = !S.shot && !S.opened; if (first) { k = 'low'; S.opened = true; }
    if (k !== 'crane') { const want = k === 'chase' ? (b => b.air ? 5 : b.v > 0.1 ? 2 : 0.3) : k === 'eye' ? (b => b.st === 'forage' && !b.air ? 3 : 0.5) : (b => b.st === 'court' ? 7 : b.st === 'bathe' ? 6 : b.st === 'drink' ? 5 : (b.st === 'loaf' && b.sub !== 'rest') ? 3 : (b.st === 'forage' && !b.air) ? 3 : 0.6);
      let best = 0, bs = -1; for (const b of flock.B) { const s = want(b) * (0.4 + R()) * (b.st === 'roost' ? 0.15 + 4 * litOf(b) : 1); if (s > bs) { bs = s; best = b.i; } } if (!first) setFocus(best, true); }
    const sh = { k, dur: rr(7, 11), t0: S.t }; if (first) { setFocus(0, true); ORB.tele.pitch = 0.05; ORB.tele.dist = 1.7; teleYaw(-1.2); sh.dur = 9; sh.dy = -0.11; } else if (k === 'low') { ORB.tele.pitch = rr(-0.02, 0.07); ORB.tele.dist = rr(2.2, 5.5); teleYaw(rr(-2.4, -0.5)); } if (k === 'over') { ORB.over.dist = rr(9, 26); ORB.over.pitch = rr(0.7, 1.05); ORB.over.yaw = rr(0, TAU); } if (k === 'chase') { ORB.chase.yaw = rr(-0.6, 0.6); ORB.chase.dist = rr(0.6, 1.1); }
    if (k === 'crane') { sh.c = CRANES[(R() * CRANES.length) | 0]; sh.dur = sh.c.dur; }
    S.shot = sh; S.shotT = sh.dur; S.snap = true; S.chaseYaw = B().yaw; S.eyeYaw = B().yaw; S.overT.set(B().pose.x, B().pose.y, B().pose.z);
  }

  // ---------------------------------------------------------------- camera rig
  function clearCam(look, pos) { // pull the camera towards the subject while it is inside a building footprint
    for (let i = 0; i < 6; i++) { const rf = nav.roof(pos.x, pos.z); if (rf > pos.y - 0.2 && nav.cls(pos.x, pos.z) === 3) pos.lerp(look, 0.3); else break; }
    const g = Math.max(nav.ground(pos.x, pos.z), nav.waterY(pos.x, pos.z)); if (pos.y < g + 0.07) pos.y = g + 0.07; }
  const FREE = (f => f && f.length >= 6 ? f : null)(listq(qs.get('free'), null)); app.FREE = FREE; app.kites = kites;
  function rig(dt) {
    if (FREE) { app.pano = null; camera.position.set(FREE[0], FREE[1], FREE[2]); camera.up.set(0, 1, 0); camera.lookAt(FREE[3], FREE[4], FREE[5]); if (FREE[6] && camera.fov !== FREE[6]) { camera.fov = FREE[6]; camera.updateProjectionMatrix(); } cam.pos.copy(camera.position); cam.look.set(FREE[3], FREE[4], FREE[5]); app.focus.copy(cam.look); S.camDist = cam.pos.distanceTo(cam.look); post.opts.dofOn = false; return; }
    const b = B(), P = b.pose, mode = S.mode === 'cine' ? (S.shot ? S.shot.k : 'low') : S.mode; let pos = tA, look = tB, fov = 50, kPos = 8, kLook = 10, dofK = 0, focusD = 5;
    app.pano = null; S.view = mode; const idle = S.t - S.lastDrag > 3;
    if (mode === 'eye') {
      const H = b.head; S.eyeYaw = dampAng(S.eyeYaw, b.yaw + H.yaw * 0.8, 12, dt); S.eyePitch = damp(S.eyePitch, b.air ? clamp(b.vy * 0.025, -0.15, 0.15) : (b.peck > 0 || b.st === 'drink' ? clamp((H.pitch + 0.18) * 0.72, -1.0, 0.3) : clamp((H.pitch + 0.18) * 0.3, -0.25, 0.2)), 14, dt); S.eyeRoll = damp(S.eyeRoll, b.air ? b.roll * 0.35 : H.tilt * 0.3, 8, dt);
      const F = dirOf(S.eyeYaw, -S.eyePitch, tC), Rt = tD.set(-Math.cos(S.eyeYaw), 0, Math.sin(S.eyeYaw)), Up = tE.crossVectors(Rt, F).normalize(); Rt.crossVectors(F, Up).normalize();
      const cr = Math.cos(S.eyeRoll), sr = Math.sin(S.eyeRoll), Rx = Rt.x * cr + Up.x * sr, Ry = Rt.y * cr + Up.y * sr, Rz = Rt.z * cr + Up.z * sr; Up.set(Up.x * cr - Rt.x * sr, Up.y * cr - Rt.y * sr, Up.z * cr - Rt.z * sr); Rt.set(Rx, Ry, Rz);
      { const rows = innerWidth / innerHeight < 0.9 ? 2 : 1; if (post.panoRows !== rows) { post.panoRows = rows; document.body.dataset.pano = rows; } }
      const eye = cam.pos.set(H.x, H.y, H.z).addScaledVector(F, 0.013).addScaledVector(Up, 0.009); cam.look.copy(eye).add(F); app.pano = { eye, F, R: Rt, Up }; pF.copy(F); pR.copy(Rt); pU.copy(Up); pE.copy(eye);
      camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(cam.look); app.focus.copy(eye); post.opts.dofOn = false; S.camDist = 0.3; return;
    }
    if (mode === 'crane') { const c = S.shot.c, t = clamp((S.t - S.shot.t0) / S.shot.dur, 0, 1), e = t * t * (3 - 2 * t); pos.set(lerp(c.a[0], c.b[0], e), lerp(c.a[1], c.b[1], e), lerp(c.a[2], c.b[2], e)); look.set(c.l[0], c.l[1], c.l[2]); fov = c.fov; kPos = 30; kLook = 30; dofK = 0; focusD = 30; }
    else if (mode === 'chase') { const o = ORB.chase, fast = b.air || S.manual; S.chaseYaw = dampAng(S.chaseYaw, b.yaw, fast ? 3.2 : 0.45, dt); if (idle && fast) o.yaw = damp(o.yaw, 0, 1.5, dt);
      const dist = o.dist * (b.air ? 1.5 : 1), d = dirOf(S.chaseYaw + o.yaw, o.pitch + (b.air ? 0.05 : 0), tC); look.set(P.x + Math.sin(b.yaw) * 0.08, P.y + 0.04, P.z + Math.cos(b.yaw) * 0.08); pos.copy(look).addScaledVector(d, -dist); clearCam(look, pos);
      fov = 58; kPos = b.air ? 14 : 6; kLook = 18; dofK = 0.55; focusD = dist; }
    else if (mode === 'tele' || mode === 'low') { const o = ORB.tele, d = dirOf(o.yaw, o.pitch, tC); look.set(P.x, P.y + 0.015 + (S.mode === 'cine' && S.shot && S.shot.dy || 0), P.z); if (b.air) look.addScaledVector(tD.set(b.vx, b.vy, b.vz), 0.12); pos.copy(look).addScaledVector(d, -o.dist); clearCam(look, pos);
      fov = clamp(2 * Math.atan(0.34 / Math.min(1, camera.aspect / 1.25) / o.dist) * DEGR, 3.5, 48); kPos = b.air ? 2.2 : 1.3; kLook = b.air ? 9 : 5; dofK = 1.15; const far = cam.pos.distanceTo(look); if (far > o.dist * 3.2 + 4 || far < o.dist * 0.25) S.snap = true; focusD = S.snap ? o.dist : far; }
    else { const o = ORB.over; if (idle) o.yaw += dt * 0.025; S.overT.x = damp(S.overT.x, P.x, 2.2, dt); S.overT.y = damp(S.overT.y, P.y, 2.2, dt); S.overT.z = damp(S.overT.z, P.z, 2.2, dt); if (S.overT.distanceTo(tD.set(P.x, P.y, P.z)) > 60) S.overT.copy(tD);
      const d = dirOf(o.yaw, o.pitch, tC); look.copy(S.overT); pos.copy(look).addScaledVector(d, -o.dist); const tp = nav.top(pos.x, pos.z); if (pos.y < tp + 1.2) pos.y = tp + 1.2; fov = 38; kPos = 7; kLook = 7; dofK = o.dist < 40 ? 0.35 : 0; focusD = o.dist; }
    if (S.snap) { cam.pos.copy(pos); cam.look.copy(look); if ((mode === 'tele' || mode === 'low') && b.air) cam.look.addScaledVector(tD.set(b.vx, b.vy, b.vz), -0.12); cam.fov = fov; S.snap = false; }   // the lead on a flying bird is meant for a lens that trails it; on a cut the lens starts on the bird itself else { const a = 1 - Math.exp(-kPos * dt), c = 1 - Math.exp(-kLook * dt); cam.pos.lerp(pos, a); cam.look.lerp(look, c); cam.fov = damp(cam.fov, fov, 5, dt); }
    camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look); if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    app.focus.copy(cam.look); S.camDist = cam.pos.distanceTo(cam.look);
    post.opts.dofOn = Q.dof && dofK > 0; post.opts.focus = mode === 'tele' || mode === 'low' ? S.camDist : focusD; post.opts.aperture = dofK / Math.tan(cam.fov * 0.5 / DEGR) * (post.h / 720);
  }

  // ---------------------------------------------------------------- per-frame
  const where = (x, y, z) => { const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z, dist = Math.hypot(dx, dy, dz); tD.set(1, 0, 0).applyQuaternion(camera.quaternion); return [dist, clamp((dx * tD.x + dz * tD.z) / (dist + 0.5), -1, 1)]; };
  function events() {
    for (const e of flock.events) try { const b = e.b, p = b ? where(b.x, b.y, b.z) : where(e.x, camera.position.y, e.z);
      if (e.t === 'takeoff') { snd.flap(p[0], p[1], e.alarm ? 8 : 6, e.alarm); if (b && b.i === S.focus) mark('takeoff'); }
      else if (e.t === 'flush') { snd.flush(p[0], p[1], e.n); S.flushT = S.t; }
      else if (e.t === 'coo') snd.coo(p[0], p[1]); else if (e.t === 'peck') snd.peck(p[0], p[1]); else if (e.t === 'land') snd.flap(p[0], p[1], 3, false); else if (e.t === 'splash') snd.splash(p[0], p[1]); } catch (err) { }
    flock.events.length = 0;
  }
  function actOf(b) {
    if (b.air) return b.alarm ? 'flush' : (b.landing > 0.3 ? 'land' : (b.takeoff !== undefined && b.takeoff < 0.9 ? 'takeoff' : (b.glide ? 'glide' : 'fly')));
    if (b.peck > 0) return 'peck'; if (b.st === 'court' || b.st === 'drink' || b.st === 'bathe' || b.st === 'roost') return b.st;
    if (b.st === 'loaf') return b.sub === 'preen' ? 'preen' : b.sub === 'sleep' ? 'sleep' : b.sub === 'sun' ? 'sun' : 'rest';
    return b.v > 0.03 ? 'walk' : 'look';
  }
  function mark(k) { if (S.seen[k] || !S.started) return; S.seen[k] = 1; try { localStorage.setItem('hato.seen', JSON.stringify(S.seen)); } catch (e) { } ui.etho(k); }

  const clapAt = numq(qs.get('clapAt'), 0, 0, 1e6);
  app.tick = dt => {
    S.t += dt; if (clapAt && S.t >= clapAt && !S.clapped) { S.clapped = true; flock.scare(B().x, B().z, 24, true); }
    for (const q of flock.B) { q.pose.hide = false; if (q.callT !== undefined) { q.callT -= dt; if (q.callT <= 0) { q.callT = undefined; if (!q.manual && q.st !== 'court' && q.st !== 'roost' && !(q.air && q.next === 'roost')) { const s = q.callS, d = Math.hypot(q.x - s.x, q.z - s.z); q.site = s; if (q.air || d > 5 || Math.abs(q.y - s.y) > 0.5) { const g = flock._groundPoint(s, q.air ? 2.2 : 1.6); flock.flyTo(q, g.x, g.y, g.z, 'forage'); } else { q.st = 'forage'; q.pause = 0; } } } } }
    if (S.mode === 'cine') direct(dt);
    if ((S.mode === 'eye') || (S.mode === 'cine' && S.shot && S.shot.k === 'eye')) B().pose.hide = true;
    if (people) people.update(dt, app.hour); if (traffic) traffic.update(dt);
    flock.update(dt, app.hour); flyKites(dt); events();
    rig(dt); if (people) people.pose();
    // shadows for the birds near the subject
    const sunOn = world.env.elev > 1.5 && world.env.sunI > 0.3; if (!app.fast) shadows.update(app.pano ? app.pano.eye : cam.look, clamp(S.camDist * 0.8 + 2.5, 4, 42), U.uSunDir.value, sunOn);
    if (cover) { const f = app.pano ? app.pano.eye : cam.look, cp = camera.position, dx = f.x - cp.x, dz = f.z - cp.z; if (Math.hypot(dx, dz, f.y - cp.y) < 12) { if (f.y - nav.ground(f.x, f.z) < 3.5) cover.update(f.x, f.z); } else { const k = 3 / Math.max(1e-3, Math.hypot(dx, dz)); cover.update(cp.x + dx * k, cp.z + dz * k); } }
    if (flock.foodDirty) { crumbs.sync(flock.food); flock.foodDirty = false; }
    { const b = B(), on = S.view === 'over' && S.started && !b.air, a = ring.material.uniforms.uA; a.value = damp(a.value, on ? 0.75 : 0, 6, dt); ring.visible = a.value > 0.02; if (ring.visible) { const r = clamp(S.camDist * 0.022, 0.16, 3); ring.scale.setScalar(r); ring.position.set(b.pose.x, b.y + 0.012, b.pose.z); } }
    if (app.scenery) app.scenery.update(dt, camera);
    // weather, exposure, reflections
    U.uWet.value = damp(U.uWet.value, S.wet, 0.6, dt);
    { const k = nav._ci(camera.position.x, camera.position.z), h = camera.position.y - nav.ground(camera.position.x, camera.position.z), ao = k >= 0 && h < 14 ? nav.AO[k] / 255 : 1; let nk = 0.8; if (world.env.night > 0.5 && (S.view === 'tele' || S.view === 'low' || S.view === 'chase' || S.view === 'eye')) { const q = B(); nk = lerp(2.3, 0.85, smooth(0.04, 0.4, flock.lampAt(q.x, q.y + 0.06, q.z))); }
      app.expoK = damp(app.expoK, lerp(lerp(1.7, 1.0, smooth(0.15, 0.85, ao)), nk, world.env.night), 1.1, dt); }
    { const wy = nav.waterY(-36, clamp(camera.position.z, -215, 170)), h = camera.position.y - nav.ground(camera.position.x, camera.position.z); const nearRiver = camera.position.x > -170 && camera.position.x < 75; app.reflY = (U.uWet.value > 0.3 && h < 6) ? nav.ground(cam.look.x, cam.look.z) : (nearRiver ? (wy > -300 ? wy : -2.8) : null); }
    // sound bed
    if (snd.on) { const cx = camera.position.x, cz = camera.position.z, dR = Math.max(0, Math.abs(cx + 36) - 22), hC = Math.max(0, camera.position.y - 6), b = B(); snd.ambience(1 / (1 + (dR / 28) ** 2) / (1 + hC / 60), (0.10 + 0.12 / (1 + (Math.abs(cx - 0) / 30) ** 2)) * (1 - 0.6 * world.env.night), clamp(hC / 80, 0, 0.5) + ((S.view === 'eye' || S.view === 'chase') && b.air ? clamp((b.speed || 0) / 16, 0, 1) * 0.8 : 0)); }
    if (S.bellH !== undefined && Math.floor(app.hour) !== S.bellH && Math.floor(app.hour) === 18) snd.bell(); S.bellH = Math.floor(app.hour);
    // HUD
    const a = actOf(B()); if (a !== S.act) { S.act = a; mark(a); ui.card(); } if (S.flushT && S.t - S.flushT < 0.2) mark('flush');
    S.hudT -= dt; if (S.hudT <= 0) { S.hudT = 0.25; ui.tick();
      // the ethogram also records what other pigeons in view are doing, once it has gone on for a second and a half: a rare behaviour no longer depends on having picked that bird
      if (S.started) { const w = S.wit || (S.wit = {}), v = S._wv || (S._wv = new THREE.Vector3()), pano = S.mode === 'eye', now = {}; for (const q of flock.B) { if (q.i === S.focus) continue; const d = Math.hypot(q.x - camera.position.x, q.y - camera.position.y, q.z - camera.position.z); if (d > (pano ? 18 : 60)) continue; if (!pano) { v.set(q.x, q.y, q.z).project(camera); if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9) continue; } now[actOf(q)] = 1; }
        for (const k in now) { w[k] = (w[k] || 0) + 0.25; if (w[k] >= 1.5) mark(k); } for (const k in w) if (!now[k]) w[k] = 0; } }
    // dynamic resolution
    S.fpsT += app.rawDt; S.fpsN++; if (S.fpsT >= 1) { const ms = S.fpsT / S.fpsN * 1000; S.ms = ms; S.fpsT = 0; S.fpsN = 0; if (ms > 30) { S.slow++; S.fast = 0; } else if (ms < 19) { S.fast++; S.slow = 0; } else { S.slow = 0; S.fast = 0; }
      const lo = S.lite ? 0.42 : 0.55;
      // still slow at the lowest resolution: drop the costly extras on the spot (no reload), then allow a lower resolution
      if ((S.slow >= 4 && app.drs <= lo + 0.01 || qs.get('lite')) && !S.lite && S.started) { S.lite = true; Q.dof = false; Q.shadowEvery = Math.max(Q.shadowEvery || 1, 6); if (cover) { cover.peb.visible = false; cover.gr.visible = false; cover = null; } S.slow = 0; toast('動きが重いので、ぼけ・小石・草の表示を省きました'); }
      if (S.slow >= 5 && app.drs <= lo + 0.01 && S.lite && !S.lite2 && S.started) { S.lite2 = true; Q.refl = false; app.reflY = null; if (Q.msaa) { Q.msaa = 0; post.w = 0; app.resize(); } S.slow = 0; toast('まだ重いので、水面の映り込みと輪郭の補正を省きました'); }
      if (S.slow >= 8 && app.drs <= lo + 0.01 && S.lite && Q.tier !== 'low' && !S.hinted && S.started) { S.hinted = true; toast('まだ重いときは左上の時刻 → 画質「軽」へ'); }
      if (S.slow >= 2 && app.drs > lo) { app.drs = Math.max(lo, app.drs * 0.85); app.resize(); S.slow = 0; } else if (S.fast >= 6 && app.drs < 1) { app.drs = Math.min(1, app.drs * 1.1); app.resize(); S.fast = 0; } }
  };

  // ---------------------------------------------------------------- input
  const coarse = matchMedia('(pointer: coarse)').matches, cv = renderer.domElement, ptr = new Map(); let pinch = 0, tapT = 0, tapX = 0, tapY = 0, moved = 0;
  const orb = () => S.mode === 'cine' ? (S.shot && S.shot.k === 'over' ? ORB.over : S.shot && S.shot.k === 'chase' ? ORB.chase : ORB.tele) : ORB[S.mode];
  cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (err) { } if (e.isPrimary && ptr.size) { ptr.clear(); pinch = 0; }   /* a primary pointer going down means nothing else is down: a release that never arrived (lost to another window, a system gesture) must not leave every later tap looking like a pinch */ ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) { tapT = e.timeStamp; tapX = e.clientX; tapY = e.clientY; moved = 0; } if (ptr.size === 2) { const p = [...ptr.values()]; pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } });
  cv.addEventListener('pointermove', e => { const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; const o = orb();
    if (ptr.size === 1 && o) { moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) { o.yaw -= dx * 0.0055; o.pitch = clamp(o.pitch + dy * 0.004, S.mode === 'over' ? 0.25 : -0.12, 1.5); S.lastDrag = S.t; } }
    else if (ptr.size === 2 && o) { const q = [...ptr.values()], d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y); if (pinch > 0) o.dist = clamp(o.dist * pinch / Math.max(d, 1), o.min, o.max); pinch = d; S.lastDrag = S.t; moved = 99; } });
  const up = e => { const had = ptr.has(e.pointerId); ptr.delete(e.pointerId); pinch = 0; if (had && ptr.size === 0 && moved < 60 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 14 && e.timeStamp - tapT < 600) tap(tapX, tapY); };   // the events' own times: a slow frame must not turn a tap into a long press
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); pinch = 0; });
  cv.addEventListener('wheel', e => { e.preventDefault(); const o = orb(); if (o) { o.dist = clamp(o.dist * Math.exp(e.deltaY * 0.0012), o.min, o.max); S.lastDrag = S.t; } }, { passive: false });
  // where a tap points: the ray through the lens or, in the pigeon's-eye panorama, the direction that the tapped pixel shows (the inverse of the projection in post.js)
  const tapDir = V(), pF = V(), pR = V(), pU = V(), pE = V();
  function tapRay(px, py, dir) { const r = cv.getBoundingClientRect(), u = (px - r.left) / r.width, v = 1 - (py - r.top) / r.height;
    if (app.pano) { const hf = 320 * Math.PI / 180, rows = post.panoRows || 1; let yaw, pit, ppr;
      if (rows > 1) { const vf = Math.min(1.75, (hf / 2 + 0.2618) * (r.height / 2) / r.width); yaw = v >= 0.5 ? lerp(-hf / 2, 0.2618, u) : lerp(-0.2618, hf / 2, u); pit = ((v * 2) % 1 - 0.5) * vf; ppr = r.width / (hf / 2 + 0.2618); }
      else { yaw = (u - 0.5) * hf; pit = (v - 0.5) * Math.min(2.0, hf * r.height / r.width); ppr = r.width / hf; }
      dir.copy(pF).multiplyScalar(Math.cos(pit) * Math.cos(yaw)).addScaledVector(pR, Math.cos(pit) * Math.sin(yaw)).addScaledVector(pU, Math.sin(pit)).normalize(); return { o: pE, ppr }; }
    dir.set(u * 2 - 1, v * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize(); return { o: camera.position, ppr: r.height / 2 / Math.tan(camera.fov * 0.5 / DEGR) }; }
  const tapFx = (px, py) => { const el = document.createElement('i'); el.className = 'tapfx'; el.style.left = px + 'px'; el.style.top = py + 'px'; document.body.appendChild(el); setTimeout(() => el.remove(), 560); };
  // for the checks: where a tap at this screen point would land (ground point, wall, or nothing)
  app.ptrN = () => ptr.size;
  app.tapProbe = (px, py) => { const dir = tapDir, ray = tapRay(px, py, dir), o = ray.o; let t = 0.2; for (let i = 0; i < 400 && t < 900; i++) { const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t; if (y <= nav.ground(x, z)) return { hit: [+x.toFixed(2), +z.toFixed(2)], t: +t.toFixed(2), walk: nav.walkable(x, z), cls: nav.cls(x, z) }; const rf = nav.roof(x, z); if (rf > -900 && y < rf - 0.05 && !nav.walkable(x, z)) return { wall: true, t: +t.toFixed(2) }; t += Math.max(0.04, t * 0.03); } return { none: true, dir: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)], o: [+o.x.toFixed(1), +o.y.toFixed(2), +o.z.toFixed(1)] }; };
  function tap(px, py) {
    if (!S.started) return; const dir = tapDir, ray = tapRay(px, py, dir), o = ray.o; tapFx(px, py);
    // a pigeon under the finger: within 40 px, or within its own apparent size when it is close
    let best = -1, bd = 1; for (const b of flock.B) { if (b.i === S.focus) continue; const dx = b.pose.x - o.x, dy = b.pose.y + 0.02 - o.y, dz = b.pose.z - o.z, dist = Math.hypot(dx, dy, dz) || 1e-3, c = (dx * dir.x + dy * dir.y + dz * dir.z) / dist; if (c < 0.2) continue;
      const off = Math.acos(Math.min(1, c)) * ray.ppr / Math.max(40, 0.16 / dist * ray.ppr); if (off < bd) { bd = off; best = b.i; } }
    if (best >= 0) { setFocus(best); const b = B(); toast(`観察する相手を変更：No.${String(b.i + 1).padStart(2, '0')}　${b.morph.n}　${b.male ? '♂' : '♀'}`); return; }
    // otherwise the ground under the finger; a wall or a roof in the way stops the throw
    let t = 0.2, hit = null, wall = false;
    for (let i = 0; i < 400 && t < 900; i++) { const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t; if (y <= nav.ground(x, z)) { hit = [x, z]; break; } const rf = nav.roof(x, z); if (rf > -900 && y < rf - 0.05 && !nav.walkable(x, z)) { wall = true; break; }   /* under a deck on stilts or an eave the ground is open: only a roof with no walkable ground below stops the throw */ t += Math.max(0.04, t * 0.03); }
    if (hit) { const msg = feedAt(hit[0], hit[1]); if (msg) toast(msg); } else if (wall) toast('建物にはまけない。地面をタップ');
  }
  addEventListener('keydown', e => { if (e.repeat) return; input.keys[e.code] = true; const k = e.code; if (k.startsWith('Digit')) { const m = MODES[+k.slice(5) - 1]; if (m) setMode(m); } else if (k === 'KeyN') nextBird(); else if (k === 'KeyF') feedFront(); else if (k === 'KeyC') clap(); else if (k === 'KeyM') setManual(!S.manual); else if (k === 'KeyH') { S.ui = !S.ui; document.body.classList.toggle('noui', !S.ui); } if (k === 'Space' && !document.querySelector('.modal.on')) e.preventDefault(); });
  addEventListener('keyup', e => { input.keys[e.code] = false; });
  function feedFront() { const b = B(), d = b.air ? 0 : rr(0.5, 1.1), x = (b.air ? cam.look.x : b.x) + Math.sin(b.yaw) * d, z = (b.air ? cam.look.z : b.z) + Math.cos(b.yaw) * d; const msg = feedAt(x, z); if (msg) toast(msg); }

  // ---------------------------------------------------------------- HUD
  const ui = {
    modes() { document.querySelectorAll('#modes button').forEach(el => { const o = el.dataset.m === S.mode; el.classList.toggle('on', o); el.setAttribute('aria-pressed', o ? 'true' : 'false'); }); document.body.dataset.mode = S.mode; },
    manual() { document.body.classList.toggle('manual', S.manual); const el = $('btnFly'); if (el) { el.classList.toggle('on', S.manual); el.setAttribute('aria-pressed', S.manual ? 'true' : 'false'); el.innerHTML = S.manual ? '観察に<br>もどる' : 'ハトに<br>なる'; } },
    card(flash) { const b = B(), e = ETHO[S.act] || ETHO.look; $('bname').textContent = `No.${String(b.i + 1).padStart(2, '0')}　${b.morph.n}　${b.male ? '♂' : '♀'}`; $('bact').textContent = e[0]; $('bnote').textContent = e[1]; if (flash) { const c = $('card'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); } },
    etho(k) { const n = ETHO_KEYS.filter(x => S.seen[x]).length; $('ethoN').textContent = `${n}/${ETHO_KEYS.length}`; if (k) { toast(`行動図鑑に追加：${ETHO[k][0]}`, true); if (n === ETHO_KEYS.length) setTimeout(() => toast('行動図鑑コンプリート！'), 2800); } const L = $('ethoList'); if (L) L.innerHTML = ETHO_KEYS.map(x => `<li class="${S.seen[x] ? 'ok' : ''}"><b>${S.seen[x] ? ETHO[x][0] : '？？？'}</b><span>${S.seen[x] ? ETHO[x][1] : 'ヒント：' + ETHO_HINT[x]}</span></li>`).join(''); },
    tick() { const h = app.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60), b = B(); $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; $('place').textContent = placeOf(camera.position.x, camera.position.z); const tr = $('timeRange'); if (tr && document.activeElement !== tr) tr.value = h;
      const st = $('stat'); if (st) { let g = 0, ro = 0, f = 0; for (const q of flock.B) { if (q.air) f++; else if (q.st === 'roost') ro++; else g++; } st.textContent = (ro ? `ねぐら ${ro}羽・` : '') + `地上 ${g}羽・飛行 ${f}羽`; }
      const pk = $('btnPeck'); if (pk) pk.classList.toggle('dis', S.manual && b.air);
      if (app.qs.get('dbg')) { const i = renderer.info.render; $('dbg').textContent = `${(S.ms || 0).toFixed(1)}ms drs${app.drs.toFixed(2)} calls${i.calls} tris${(i.triangles / 1000) | 0}k tex${world.tex.stats().join('/')}`; } },
  };
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', e => { e.stopPropagation(); fn(e); }); };
  document.querySelectorAll('#modes button').forEach(el => el.addEventListener('click', () => setMode(el.dataset.m)));
  on('btnNext', nextBird); on('btnFeed', feedFront); on('btnClap', clap); on('btnFly', () => setManual(!S.manual)); on('btnPeck', () => { input.peck = true; });
  const sndUi = () => { const el = $('btnSound'), st = $('sndState'); if (!el) return; el.classList.toggle('off', snd.muted); el.setAttribute('aria-pressed', String(!snd.muted)); if (st) st.textContent = snd.muted ? '切' : '入'; };
  on('btnSound', () => { try { snd.start(); snd.setMuted(!snd.muted); } catch (e) { } sndUi(); toast(snd.muted ? '音を消した' : (snd.ctx && snd.ctx.state === 'running' ? '音を出している（川、街、羽音、鳴き声）' : '音を出せない。端末の消音とブラウザの設定を確認')); });
  // what this device is actually doing, shown at the bottom of the info sheet (handy when reporting how it runs on a phone)
  const diag = () => { const d = $('diag'); if (!d) return; let gpu = ''; try { const gl = renderer.getContext(), r0 = String(gl.getParameter(gl.RENDERER)), e = /^(WebKit )?WebGL$|^Mozilla$/.test(r0) ? gl.getExtension('WEBGL_debug_renderer_info') : null; gpu = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : r0).slice(0, 200); } catch (err) { }
    const ms = S.ms || 0; d.textContent = `この端末での動作：画質「${{ high: '高', mid: '中', low: '軽' }[Q.tier] || Q.tier}」／${ms ? `1コマ平均 ${ms.toFixed(1)} ms（約 ${Math.round(1000 / ms)} fps）` : '速度は計測中'}／内部解像度 ${Math.round(Q.scale * app.drs * 100)}%${S.lite ? '・軽量化中' : ''}／起動 ${app.boot && app.boot.shown ? `${(app.boot.shown / 1000).toFixed(1)} 秒（取得 ${((app.boot.fetched || 0) / 1000).toFixed(1)}・組み立て ${(((app.boot.ready || 0) - (app.boot.fetched || 0)) / 1000).toFixed(1)}・最初の1コマ ${((app.boot.shown - (app.boot.ready || 0)) / 1000).toFixed(1)}）` : '計測なし'}／音：${snd.ctx ? ({ running: '再生中', suspended: '停止中', closed: '終了' }[snd.ctx.state] || snd.ctx.state) : '未開始'}${snd.muted ? '（消音）' : snd.ctx ? `・出力 ${snd.level().toFixed(0)} dB` : ''}／${gpu}`; };
  // a sheet takes the focus when it opens and hands it back to the button that opened it; Tab stays inside while it is open
  const sheet = { from: null, open(id, by) { const el = $(id); if (!el) return; sheet.from = by || document.activeElement; el.classList.add('on'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); const x = el.querySelector('.x'); if (x) x.focus({ preventScroll: true }); },
    close(id) { const el = $(id); if (!el || !el.classList.contains('on')) return; el.classList.remove('on'); const f = sheet.from; sheet.from = null; if (f && f.focus) f.focus({ preventScroll: true }); } };
  addEventListener('keydown', e => { if (e.key !== 'Tab') return; const el = document.querySelector('.modal.on'); if (!el) return; const fs = [...el.querySelectorAll('button, a[href], summary')].filter(q => q.offsetParent !== null); if (!fs.length) return; const i = fs.indexOf(document.activeElement); e.preventDefault(); fs[(i + (e.shiftKey ? fs.length - 1 : 1)) % fs.length].focus(); });
  // larger type in the sheets (the page itself cannot be pinched larger while the game holds the touches)
  { let big = false; try { big = localStorage.getItem('hato.big') === '1'; } catch (e) { } const set = v => { big = v; document.body.classList.toggle('big', v); document.querySelectorAll('.sheet .fs').forEach(b => { b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.textContent = v ? '文字をもどす' : '文字を大きく'; }); try { localStorage.setItem('hato.big', v ? '1' : '0'); } catch (e) { } }; set(big); document.querySelectorAll('.sheet .fs').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); set(!big); })); }
  on('btnInfo', () => { diag(); sheet.open('info', $('btnInfo')); }); on('infoClose', () => sheet.close('info')); // the sheets also close with Esc and with a press outside the panel
  for (const id of ['ethoPanel', 'info']) { const el = $(id); if (el) el.addEventListener('pointerdown', e => { if (e.target === el) sheet.close(id); }); }
  addEventListener('keydown', e => { if (e.key === 'Escape') for (const el of document.querySelectorAll('.modal.on')) sheet.close(el.id); });
  on('btnEtho', () => { ui.etho(); sheet.open('ethoPanel', $('btnEtho')); }); on('ethoClose', () => sheet.close('ethoPanel'));
  on('btnTime', () => { const o = $('timePanel').classList.toggle('on'); $('btnTime').setAttribute('aria-expanded', o ? 'true' : 'false'); });
  { const bt = $('btnTime'); if (bt) { bt.setAttribute('aria-label', '時刻・天気・画質の設定を開く'); bt.setAttribute('aria-expanded', 'false'); } }
  on('btnWet', () => { S.wet = S.wet > 0.5 ? 0 : 1; $('btnWet').classList.toggle('on', S.wet > 0.5); toast(S.wet > 0.5 ? '雨上がり' : '晴れ'); });
  // the hour set by hand is a cut, not a wait: the flock is placed where it would be (asleep on the roosts at night), and the camera follows the bird it was watching
  const setHour = h => { app.hour = h; world.setHour(h); if (flock.retime(h)) { S.snap = true; if (flock.asleep(B(), h) && !S.manual) { litFocus(); toast('夜はねぐらで眠る（軒先、川床の手すり、橋の下）'); } } };
  const tr = $('timeRange'); if (tr) tr.addEventListener('input', () => setHour(+tr.value));
  document.querySelectorAll('#timePanel [data-h]').forEach(el => el.addEventListener('click', () => setHour(+el.dataset.h)));
  document.querySelectorAll('#timePanel [data-ts]').forEach(el => el.addEventListener('click', () => { app.timeScale = +el.dataset.ts; document.querySelectorAll('#timePanel [data-ts]').forEach(x => x.classList.toggle('on', x === el)); }));
  document.querySelectorAll('#qsel [data-q]').forEach(el => { el.classList.toggle('on', el.dataset.q === Q.tier); el.addEventListener('click', () => app.restartAt(el.dataset.q)); });
  const fb = $('btnFlap'); if (fb) { const dn = e => { e.preventDefault(); input.flap = true; }, upf = () => { input.flap = false; }; fb.addEventListener('pointerdown', dn); fb.addEventListener('pointerup', upf); fb.addEventListener('pointercancel', upf); fb.addEventListener('pointerleave', upf); }
  const stick = $('stick'), knob = $('knob'); if (stick) { let id = null; const set = e => { const r = stick.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2), m = Math.hypot(x, y), k = m > 1 ? 1 / m : 1; input.mx = x * k; input.my = -y * k; knob.style.transform = `translate(${input.mx * 32}px, ${-input.my * 32}px)`; };
    stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); set(e); }); stick.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); }); const end = () => { id = null; input.mx = input.my = 0; knob.style.transform = ''; }; stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end); }
  on('btnStart', () => { try { snd.start(window.__hatoAC || undefined); } catch (e) { console.warn('audio: ' + e.message); } S.started = true; document.body.classList.add('started'); if (S.mode === 'eye') { bandIntro(); setTimeout(() => toast('明るく縁どった帯だけが、両目で見えている範囲（約27°）'), 1200); } setTimeout(() => toast('左上の時刻を押すと、夜や雨上がり、画質を選べます'), 9000); setMode(qs.get('m') || 'eye'); ui.card(true); setTimeout(() => toast('地面をタップでエサ／ハトをタップで観察する相手を変更'), 4200); });
  on('btnHide', () => { $('timePanel').classList.remove('on'); S.ui = false; S.hideT = S.t; document.body.classList.add('noui'); toast('撮影モード：画面をタップで戻る'); });
  addEventListener('pointerdown', () => { if (!S.ui && S.t - (S.hideT || 0) > 0.6) { S.ui = true; document.body.classList.remove('noui'); } }, true);
  if (S.started) document.body.classList.add('started');
  ui.modes(); ui.manual(); S.act = actOf(B()); ui.card(); ui.etho(); ui.tick();
  if (window.__hatoGo && !S.started) $('btnStart').click(); // opened from the landing page: the press there already asked to start, and unlocked the sound
  if (!S.started) { S.mode = 'cine'; ui.modes(); }
  // warm-up: let the flock settle and take one camera step before the first frame
  flock.retime(app.hour); for (let i = 0; i < 40; i++) flock.update(0.05, app.hour); if (qs.get('clap')) { flock.scare(B().x, B().z, 22, true); for (let i = 0; i < +qs.get('clap') * 20; i++) flock.update(0.05, app.hour); }
  flock.events.length = 0; if (flock.asleep(B(), app.hour)) litFocus(); if (!qs.get('orb') || qs.get('ty')) teleYaw(ORB.tele.yaw); S.chaseYaw = B().yaw; S.eyeYaw = B().yaw; S.overT.set(B().pose.x, B().pose.y, B().pose.z);
}

function studio(app, flock) {
  const qs = app.qs, nav = app.world.nav, c = (qs.get('at') || '-66,-28').split(',').map(Number), demo = ['stand', 'walk', 'peck', 'fly', 'land', 'preen', 'sleep', 'sun', 'court', 'glide', 'takeoff', 'drink'];
  flock.manualStep = () => { };
  flock.B.forEach((b, i) => { b.manual = true; const k = i % demo.length, row = (i / demo.length) | 0; b.demo = demo[k]; b.x = c[0] + (k % 6) * 0.42 - 1.0; b.z = c[1] + Math.floor(k / 6) * 0.9 + row * 30; b.y = nav.ground(b.x, b.z); b.yaw = +(qs.get('yaw') || 0.6); b.gait.init = false; b.head.ok = false; if (row > 0) { b.x += 500; } });
  const sh = new BirdShadow(app.renderer, app.scene, app.birds, app.Q), foc = new THREE.Vector3(c[0], nav.ground(c[0], c[1]), c[1]);
  app.tick = dt => {
    for (const b of flock.B) { const d = b.demo; b.st = 'forage'; b.air = false; b.v = 0; b.sub = 'rest'; b.glide = false; b.landing = 0; b.pause = 9;
      if (d === 'walk') { b.v = 0.34; b.x += Math.sin(b.yaw) * b.v * dt; b.z += Math.cos(b.yaw) * b.v * dt; if (b.x > c[0] + 3) { b.x -= 4; b.gait.init = false; b.head.ok = false; } b.y = nav.ground(b.x, b.z); }
      else if (d === 'peck') { if (b.peck === 0) flock.peckAt(b, null); if (qs.get('freeze')) b.peck = 0.45; }
      else if (d === 'fly' || d === 'glide' || d === 'land' || d === 'takeoff') { b.air = true; b.st = 'fly'; b.y = nav.ground(b.x, b.z) + (d === 'land' ? 0.25 : +(qs.get('fh') || 0.5)); b.vy = 0; b.bank = 0; b.glide = d === 'glide'; b.landing = d === 'land' ? 0.9 : 0; b.takeoff = d === 'takeoff' ? 0.1 : 5; b.alarm = false; if (qs.get('wph')) b.wph = +qs.get('wph'); }
      else if (d === 'preen') { b.st = 'loaf'; b.sub = 'preen'; b.side = 1; b.pv = 0.2; }
      else if (d === 'sleep') { b.st = 'loaf'; b.sub = 'sleep'; }
      else if (d === 'sun') { b.st = 'loaf'; b.sub = 'sun'; b.side = 1; }
      else if (d === 'court') { b.st = 'court'; b.tg = flock.B[0]; b.cooT = 9; }
      else if (d === 'drink') { b.st = 'drink'; if (b.t > 3.5) b.t = 0.5; }
      b.t += (d === 'court' || d === 'drink' || d === 'preen') ? dt : 0;
      flock.animate(b, dt); flock.r.write(b.i, b.pose); }
    flock.r.commit(); sh.update(foc, 5, U.uSunDir.value, app.world.env.elev > 1.5);
  };
}
