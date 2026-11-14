# Screenshots of the people alone on a plain stage (app/_rbx.html in the working copy; development only).
#   python3 tools/people.py <out prefix> "<query>" ["<query>" ...]      e.g.  "cam=0,1.3,5.2,0,0.9,0,40"
import sys, subprocess, time
from _paths import APP, CHROME
from playwright.sync_api import sync_playwright
out, qs = sys.argv[1], sys.argv[2:] or ['']
srv = subprocess.Popen(['python3', '-m', 'http.server', '8778', '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720}); errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        for i, q in enumerate(qs):
            pg.goto('http://localhost:8778/_rbx.html?' + q); pg.wait_for_function('window.__ready || window.__err', timeout=120000); pg.wait_for_timeout(400)
            pg.screenshot(path='%s_%d.png' % (out, i)); print(i, q, pg.evaluate('JSON.stringify([window.__probe, window.__err])')[:900])
        for e in errs[:6]: print('console:', e[:300])
        b.close()
finally: srv.terminate()
