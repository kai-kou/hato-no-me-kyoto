#!/usr/bin/env python3
"""Landing page checks.
usage: python3 tools/lptest.py <chromium|webkit|firefox> <shots|flow> [output prefix]
shots: screenshots of the landing page, screen by screen, at desktop and phone widths; reports missing images and sideways overflow.
flow : open the landing page, press the opening screen, wait for the simulation, and report whether it started with sound running;
       then reload (must return to the simulation) and follow the link back (must return to the landing page).
Run the Firefox variant under xvfb-run."""
import sys, subprocess, time, json, os
from _paths import APP, TMP, CHROME
from playwright.sync_api import sync_playwright
app, eng, mode = APP, sys.argv[1], sys.argv[2]; out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(TMP, 'lp')
port = {'chromium': 8851, 'webkit': 8852, 'firefox': 8853}[eng]
srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '--directory', app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
    with sync_playwright() as p:
        if eng == 'chromium': b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        elif eng == 'webkit': b = p.webkit.launch()
        else: b = p.firefox.launch(firefox_user_prefs={'webgl.force-enabled': True})
        url = 'http://localhost:%d/index.html' % port
        if mode == 'shots':
            for name, vw, vh, dsf, mob in [('desk', 1280, 800, 1, False), ('phone', 390, 844, 2, True)]:
                kw = dict(viewport={'width': vw, 'height': vh}, device_scale_factor=dsf)
                if eng != 'firefox': kw.update(is_mobile=mob, has_touch=mob)
                ctx = b.new_context(**kw); pg = ctx.new_page(); logs = []
                pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:200]) if m.type in ('error',) else None); pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)[:300]))
                pg.goto(url); pg.wait_for_timeout(2500)
                info = pg.evaluate("(()=>{const lp=document.getElementById('lp');const v=lp.querySelector('.lp-screen video');return JSON.stringify({lp:document.documentElement.classList.contains('lp'),booted:!!window.__hatoBooted,scrollH:lp.scrollHeight,clientH:lp.clientHeight,vsrc:v&&v.currentSrc,vpaused:v&&v.paused,imgs:[...lp.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src')),font:getComputedStyle(lp.querySelector('h1')).fontFamily.slice(0,40),ovf:lp.scrollWidth>lp.clientWidth})})()")
                print(name, info)
                pg.screenshot(path='%s_%s_top.png' % (out, name))
                H = pg.evaluate("document.getElementById('lp').scrollHeight"); k = 0; y = 0
                while y < H and k < 14:
                    pg.evaluate("y=>{document.getElementById('lp').scrollTop=y}", y); pg.wait_for_timeout(700); pg.screenshot(path='%s_%s_%02d.png' % (out, name, k)); k += 1; y += vh - 40
                print(name, 'pages', k)
                for l in logs[:8]: print('   ', l)
                ctx.close()
        else:
            kw = dict(viewport={'width': 1280, 'height': 720})
            ctx = b.new_context(**kw); pg = ctx.new_page(); logs = []
            pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:200]) if m.type in ('error',) else None); pg.on('pageerror', lambda e: logs.append('PAGEERR ' + str(e)[:300]))
            pg.goto(url); pg.wait_for_timeout(1500)
            print('before', pg.evaluate("JSON.stringify({lp:document.documentElement.classList.contains('lp'),booted:!!window.__hatoBooted,app:!!window.__app,vp:document.querySelector('meta[name=viewport]').content})"))
            t0 = time.time(); pg.click('.lp-hero .lp-screen')
            pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2', timeout=240000)
            pg.wait_for_timeout(1500)
            print('after %.1fs' % (time.time() - t0), pg.evaluate("JSON.stringify({lp:document.documentElement.classList.contains('lp'),hash:location.hash,started:document.body.classList.contains('started'),mode:document.body.dataset.mode,audio:(window.__app.snd&&window.__app.snd.ctx)?window.__app.snd.ctx.state:null,same:window.__app.snd.ctx===window.__hatoAC,flag:sessionStorage.getItem('hato.play'),vp:document.querySelector('meta[name=viewport]').content,err:document.getElementById('err').textContent,startShown:getComputedStyle(document.getElementById('start')).display})"))
            pg.screenshot(path='%s_%s_flow.png' % (out, eng), timeout=240000)
            # reload: must come back to the simulation, not the landing page; then the link back must return to the landing page
            pg.reload(); pg.wait_for_timeout(1200)
            print('reload', pg.evaluate("JSON.stringify({lp:document.documentElement.classList.contains('lp'),booted:!!window.__hatoBooted})"))
            try: pg.evaluate("document.getElementById('toLp').click()")
            except Exception as e: pass   # the page may navigate away while the call returns
            st = None
            for i in range(40):
                pg.wait_for_timeout(500)
                try: st = pg.evaluate("JSON.stringify({lp:document.documentElement.classList.contains('lp'),booted:!!window.__hatoBooted,hash:location.hash,search:location.search})")
                except Exception as e: continue
                if '"lp":true' in st: break
            print('back', st)
            for l in logs[:8]: print('   ', l)
            ctx.close()
        b.close()
finally:
    srv.terminate()
