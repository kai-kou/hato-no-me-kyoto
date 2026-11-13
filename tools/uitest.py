# Interaction checks with real input events (mouse, touch, keyboard) instead of calls into the page:
# the loading steps, tapping a pigeon and the ground in the ordinary views and in the pigeon's-eye panorama,
# a press that wanders, the sound button and the output level, the hour buttons, pecking in the air.
# usage: python3 tools/uitest.py [output prefix for screenshots]
import sys, json, subprocess, time
from _paths import APP, TMP, CHROME
from playwright.sync_api import sync_playwright

out = sys.argv[1] if len(sys.argv) > 1 else TMP + '/ui'
PORT = 8791
res = []


def ok(name, cond, info=''):
    res.append((name, bool(cond)))
    print(('ok   ' if cond else 'FAIL ') + name + (' : ' + str(info) if info != '' else ''))


# projection helpers that run in the page; the panorama one is the inverse of the projection in js/post.js, written out here independently of js/game.js
JS_LIB = r"""
window.__t = {
  frames: () => window.__app.frames,
  toast: () => { const e = document.getElementById('toast'); return e.classList.contains('on') ? e.textContent : ''; },
  counts: () => { const f = __app.flock; let air = 0, roost = 0, gnd = 0; for (const b of f.B) { if (b.manual) continue; if (b.air) air++; else if (b.st === 'roost') roost++; else gnd++; } return { air, roost, gnd, n: f.n, food: f.food.length, focus: __app.S.focus, mode: __app.S.mode, stat: document.getElementById('stat').textContent }; },
  // screen position of a world point through the ordinary camera
  proj: (x, y, z) => { const a = __app, c = a.camera, v = c.position.clone().set(x, y, z).project(c); return v.z > 1 || v.z < -1 ? null : [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; },
  // screen position of a world point in the panorama: yaw and pitch of its direction in the eye's frame, then the layout of post.js (one row, or two rows on a tall screen)
  pano: (x, y, z) => { const p = __app.pano; if (!p) return null; const dx = x - p.eye.x, dy = y - p.eye.y, dz = z - p.eye.z, L = Math.hypot(dx, dy, dz), d = [dx / L, dy / L, dz / L], dot = v => d[0] * v.x + d[1] * v.y + d[2] * v.z;
    const yaw = Math.atan2(dot(p.R), dot(p.F)), pit = Math.asin(Math.max(-1, Math.min(1, dot(p.Up)))), hf = 320 * Math.PI / 180, rows = __app.post.panoRows || 1, w = innerWidth, h = innerHeight;
    if (rows > 1) { const vf = Math.min(1.75, (hf / 2 + 0.2618) * (h / 2) / w), v = pit / vf + 0.5; if (v < 0.03 || v > 0.97) return null; const top = yaw < 0, u = top ? (yaw + hf / 2) / (hf / 2 + 0.2618) : (yaw + 0.2618) / (hf / 2 + 0.2618); if (u < 0.02 || u > 0.98) return null; return [u * w, (1 - (top ? 0.5 + v / 2 : v / 2)) * h, yaw, pit]; }
    const vf = Math.min(2.0, hf * h / w), u = yaw / hf + 0.5, v = pit / vf + 0.5; if (u < 0.03 || u > 0.97 || v < 0.03 || v > 0.97) return null; return [u * w, (1 - v) * h, yaw, pit]; },
  // a pigeon other than the watched one that stands clear of the others on the screen and of the buttons
  pick: (fn) => { const a = __app, f = a.flock, P = []; for (const b of f.B) { if (b.i === a.S.focus) continue; const s = fn(b.pose.x, b.pose.y + 0.02, b.pose.z); if (s) P.push([b.i, s[0], s[1]]); }
    const free = (x, y) => x > 330 && x < innerWidth - 110 && y > 70 && y < innerHeight - 90; let best = null, bd = 0;
    for (const p of P) { if (!free(p[1], p[2])) continue; let m = 1e9; for (const q of P) if (q !== p) m = Math.min(m, Math.hypot(q[1] - p[1], q[2] - p[2])); const me = fn(f.B[a.S.focus].pose.x, f.B[a.S.focus].pose.y, f.B[a.S.focus].pose.z); if (me) m = Math.min(m, Math.hypot(me[0] - p[1], me[1] - p[2])); if (m > bd) { bd = m; best = p; } }
    return best ? { i: best[0], x: best[1], y: best[2], clear: bd } : null; },
  // a spot of walkable ground on the screen that is far from every pigeon, and where a tap really lands
  ground: (fn) => { const a = __app, f = a.flock, nav = a.world.nav, b = f.B[a.S.focus]; let best = null, bd = 0;
    for (let k = 0; k < 240; k++) { const an = k * 0.7, r = 1.2 + (k % 13) * 0.9, x = b.x + Math.cos(an) * r, z = b.z + Math.sin(an) * r; if (!nav.walkable(x, z) || nav.cls(x, z) === 1 || nav.furn(x, z) > -900) continue; const s = fn(x, nav.ground(x, z), z); if (!s || s[0] < 330 || s[0] > innerWidth - 110 || s[1] < 70 || s[1] > innerHeight - 90) continue;
      // the tap itself is asked where it would land: ground under a deck is fair game, a point hidden behind a wall or a bank is not
      if (a.tapProbe) { const pr = a.tapProbe(s[0], s[1]); if (!pr.hit || !pr.walk || pr.cls === 1 || Math.hypot(pr.hit[0] - x, pr.hit[1] - z) > 1.0) continue; } else if (nav.roof(x, z) > -900) continue;
      let m = 1e9; for (const q of f.B) { const t = fn(q.pose.x, q.pose.y, q.pose.z); if (t) m = Math.min(m, Math.hypot(t[0] - s[0], t[1] - s[1])); } if (m > bd) { bd = m; best = { x: s[0], y: s[1], clear: m, wx: x, wz: z }; } }
    return best; },
  near: (wx, wz) => __app.flock.food.filter(q => Math.hypot(q.x - wx, q.z - wz) < 1.6).length,
};
"""

srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1000, 'height': 600})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)
        # record what the loading screen says while the page starts
        pg.add_init_script("window.__stages = []; setInterval(() => { const e = document.getElementById('stage'); if (!e) return; const t = e.textContent.replace(/[0-9.]+ \\/ /, 'N / '); if (t && window.__stages[window.__stages.length - 1] !== t) window.__stages.push(t); }, 30);")
        pg.goto('http://localhost:%d/index.html?auto=1&q=low&scale=0.3&t=12&m=over&orb=0.5,0.95,9' % PORT)
        pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames > 2', timeout=240000)
        pg.evaluate(JS_LIB)
        T = lambda js: pg.evaluate('(() => { const t = window.__t; return ' + js + '; })()')

        def frames(n=2, timeout=90000):
            f0 = T('t.frames()')
            pg.wait_for_function('window.__app.frames >= %d' % (f0 + n), timeout=timeout)

        # ---- 1. loading steps and boot timing
        st = pg.evaluate('window.__stages')
        boot = pg.evaluate('JSON.stringify(window.__app.boot)')
        ok('loading screen names its steps', len(st) >= 6 and any('取得中' in s for s in st) and any('描画の準備中' in s for s in st), ' > '.join(s[:14] for s in st))
        bj = json.loads(boot)
        ok('boot timing is recorded', bj.get('fetched', 0) > 0 and bj.get('ready', 0) >= bj.get('fetched', 0) and bj.get('shown', 0) >= bj.get('ready', 0), {k: bj.get(k) for k in ('fetched', 'ready', 'shown')})

        # ---- 2. tap a pigeon (overview)
        frames(2)
        c0 = T('t.counts()')
        pk = T('t.pick(t.proj)')
        if pk:
            pg.mouse.click(pk['x'], pk['y'])
            c1 = T('t.counts()')
            ok('click on a pigeon changes the watched bird', c1['focus'] == pk['i'], 'wanted %d, got %d (was %d), clear %.0f px, toast "%s"' % (pk['i'], c1['focus'], c0['focus'], pk['clear'], T('t.toast()')))
            ok('the change is announced', '観察する相手を変更' in T('t.toast()'))
        else:
            ok('click on a pigeon changes the watched bird', False, 'no pigeon stands clear on the screen')
        frames(3)

        # ---- 3. tap the ground (overview)
        g = T('t.ground(t.proj)')
        c0 = T('t.counts()')
        if g:
            n0 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            pg.mouse.click(g['x'], g['y'])
            c1 = T('t.counts()')
            n1 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            ok('click on the ground scatters feed there', n1 >= n0 + 15 and c1['focus'] == c0['focus'], 'crumbs within 1.6 m: %d -> %d, clear %.0f px, toast "%s"' % (n0, n1, g['clear'], T('t.toast()')))
        else:
            ok('click on the ground scatters feed there', False, 'no clear ground on the screen')
        pg.screenshot(path=out + '_tap.png')

        # ---- 4. a press that wanders by a few pixels is still a tap (a finger never stays put; the old rule added up the path and dropped such taps)
        frames(2)
        g = T('t.ground(t.proj)')
        c0 = T('t.counts()')
        if g:
            n0 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            # sent from inside the page in one go: through the driver each move waits for a frame of the software renderer, and the press would last seconds
            pg.evaluate('''([x, y]) => { const c = document.getElementById('c'), ev = (t, dx, dy) => c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dy, bubbles: true }));
              ev('pointerdown', 0, 0); for (const [dx, dy] of [[2, 0], [0, 2], [2, 1], [-1, 2], [1, -1], [2, 2], [0, 1], [1, 0]]) ev('pointermove', dx, dy); ev('pointerup', 1, 0); }''', [g['x'], g['y']])
            n1 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            ok('a press that wanders (path 27 px, net 1 px) still counts as a tap', n1 >= n0 + 15, 'crumbs within 1.6 m: %d -> %d' % (n0, n1))
        else:
            ok('a press that wanders still counts as a tap', False, 'no clear ground')

        # ---- 5. pigeon's-eye panorama: tap a pigeon, tap the ground
        pg.keyboard.press('Digit1')
        frames(3)
        c0 = T('t.counts()')
        ok('the water\'s edge has cells for drinking and bathing', T('__app.flock.shore.length') > 0, '%d cells' % T('__app.flock.shore.length'))
        ok('the panorama is on', c0['mode'] == 'eye' and pg.evaluate('!!window.__app.pano'))
        pk = T('t.pick(t.pano)')
        if pk:
            pg.mouse.click(pk['x'], pk['y'])
            c1 = T('t.counts()')
            ok('panorama: click on a pigeon changes the watched bird', c1['focus'] == pk['i'], 'wanted %d, got %d, clear %.0f px' % (pk['i'], c1['focus'], pk['clear']))
        else:
            ok('panorama: click on a pigeon changes the watched bird', False, 'no pigeon stands clear in the panorama')
        frames(3)
        g = T('t.ground(t.pano)')
        for _ in range(12):   # the feed thrown by the earlier steps draws the flock around the camera; wait for a gap
            if g: break
            frames(6); g = T('t.ground(t.pano)')
        c0 = T('t.counts()')
        if g:
            # sent from inside the page: through the driver the press and the release are two commands, and under load they can be more than the 0.6 s of a tap apart
            click = lambda q: pg.evaluate('''([x, y]) => { const c = document.getElementById('c'), ev = t => c.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, bubbles: true })); ev('pointerdown'); ev('pointerup'); }''', [q['x'], q['y']])
            n0 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            click(g)
            n1 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            for _ in range(4):   # a point behind a deck or an eave is refused, rightly: pick again after the bird has moved on
                if n1 >= n0 + 15 or '建物にはまけない' not in T('t.toast()'): break
                frames(8); g2 = T('t.ground(t.pano)')
                if not g2: continue
                g = g2; n0 = T('t.near(%f, %f)' % (g['wx'], g['wz'])); click(g); n1 = T('t.near(%f, %f)' % (g['wx'], g['wz']))
            ok('panorama: click on the ground scatters feed there', n1 >= n0 + 15, 'crumbs within 1.6 m: %d -> %d, toast "%s", probe %s' % (n0, n1, T('t.toast()'), pg.evaluate('([x, y]) => JSON.stringify(window.__app.tapProbe ? window.__app.tapProbe(x, y) : null)', [g['x'], g['y']])))
        else:
            ok('panorama: click on the ground scatters feed there', False, 'no clear ground in the panorama')
        pg.screenshot(path=out + '_pano.png')
        pg.keyboard.press('Digit3')
        frames(2)

        # ---- 6. sound button and output level
        pg.click('#btnSound')   # the first press also starts the sound engine (this page was opened without the start button), and switches it off
        s1 = pg.evaluate("[document.getElementById('sndState').textContent, document.getElementById('btnSound').getAttribute('aria-pressed'), window.__t.toast()]")
        ok('sound button shows "off" after the first press', s1[0] == '切' and s1[1] == 'false' and '音を消した' in s1[2], s1)
        pg.click('#btnSound')
        s2 = pg.evaluate("[document.getElementById('sndState').textContent, document.getElementById('btnSound').getAttribute('aria-pressed'), window.__t.toast(), window.__app.snd.ctx && window.__app.snd.ctx.state]")
        ok('sound button shows "on" after the second press', s2[0] == '入' and s2[1] == 'true', s2)
        pg.wait_for_timeout(2500)
        frames(2)
        lv = pg.evaluate('window.__app.snd.level()')
        ok('the output carries a signal (level above -70 dB)', s2[3] != 'running' or lv > -70, 'state %s, level %.1f dB' % (s2[3], lv))
        pg.click('#btnInfo')
        dg = pg.evaluate("document.getElementById('diag').textContent")
        ok('the info sheet reports start-up time and sound', '起動' in dg and '音：' in dg, dg[-130:])
        pg.click('#infoClose')

        # ---- 7. the hour buttons: night puts the flock on its roosts, morning brings it back, nobody is left in the air
        pg.click('#btnTime')
        pg.click('#timePanel [data-h="20"]')
        frames(2)
        c = T('t.counts()')
        ok('night: every pigeon is on its roost and none is flying', c['roost'] == c['n'] and c['air'] == 0, c['stat'])
        ok('night: the card says so', 'ねぐら' in c['stat'])
        pg.screenshot(path=out + '_night.png')
        pg.click('#timePanel [data-h="9.6"]')
        frames(2)
        c = T('t.counts()')
        ok('morning: nobody is left on the roost, few are in the air', c['roost'] == 0 and c['air'] <= c['n'] * 0.2, c['stat'])
        pg.click('#btnTime')

        # ---- 8. pecking is refused in the air, with a message
        pg.keyboard.press('KeyM')
        frames(1)
        pg.keyboard.down('Space')
        try:
            pg.wait_for_function('window.__app.flock.B[window.__app.S.focus].air', timeout=60000)
            air = True
        except Exception:
            air = False
        # every text the message line shows is kept: in the software renderer a frame takes seconds, so a message that is up for 1.3 s can come and go between two looks at the page
        pg.evaluate("window.__tl = []; new MutationObserver(() => window.__tl.push(document.getElementById('toast').textContent)).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true })")
        pg.keyboard.down('KeyE')   # held: a frame of the software renderer takes seconds, and a key that goes down and up between two frames is never seen
        try:
            pg.wait_for_function("window.__tl.some(t => t.includes('空中ではついばめない'))", timeout=45000)   # messages take turns: it follows the hint for the flying controls
        except Exception:
            pass
        tl = pg.evaluate("window.__tl"); tt = ' / '.join(tl[-4:])
        pg.keyboard.up('KeyE'); pg.keyboard.up('Space')
        ok('pecking in the air is refused with a message', air and any('空中ではついばめない' in t for t in tl), 'airborne %s, messages "%s"' % (air, tt))
        pg.keyboard.press('KeyM')

        ok('no page errors', not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
bad = [n for n, k in res if not k]
print('%d checks, %d failed%s' % (len(res), len(bad), (': ' + '; '.join(bad)) if bad else ''))
