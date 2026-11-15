# Desktop browsers through Playwright: opens each case, lets the page measure and report itself, takes a screenshot.
# usage: python3 tools/devicecheck/desktop.py --target mac-chrome --browser chrome|chromium|webkit --out DIR [--headless] [--swiftshader] [--size 1440x900]
import argparse, json, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); sys.path.insert(0, os.path.join(HERE, '..'))
from cases import CASES, url, wait_report
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--target', required=True); ap.add_argument('--browser', default='chrome'); ap.add_argument('--out', required=True); ap.add_argument('--size', default='1440x900')
ap.add_argument('--warm', action='store_true'); ap.add_argument('--headless', action='store_true'); ap.add_argument('--swiftshader', action='store_true'); ap.add_argument('--port', type=int, default=8793); ap.add_argument('--only', default=''); ap.add_argument('--settle', default='8'); ap.add_argument('--samples', default='8')
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); W, H = (int(v) for v in a.size.split('x'))
srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'serve.py'), '--port', str(a.port), '--out', a.out]); time.sleep(1.2)
try:
    with sync_playwright() as p:
        if a.browser == 'webkit':
            b = p.webkit.launch(headless=a.headless)
        else:
            args = ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] + (['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] if a.swiftshader else ['--enable-gpu'])
            kw = {'headless': a.headless, 'args': args}
            if a.browser == 'chrome': kw['channel'] = 'chrome'
            elif os.environ.get('HATO_CHROME'): kw['executable_path'] = os.environ['HATO_CHROME']
            b = p.chromium.launch(**kw)
        ctx = b.new_context(viewport={'width': W, 'height': H})
        if a.warm:   # the first page a browser opens pays for everything once (caches, shader compilation): open one that is not recorded
            pg = ctx.new_page(); pg.goto(url(a.port, a.target, 'warmup', 't=11&m=tele', 2, 2), timeout=120000); print('warm-up:', 'reported' if wait_report(a.out, a.target + '--warmup', 240) else 'no report', flush=True); pg.close()
        for label, query in CASES:
            if a.only and label not in a.only.split(','): continue
            pg = ctx.new_page(); rid = '%s--%s' % (a.target, label)
            try:
                pg.goto(url(a.port, a.target, label, query, a.settle, a.samples), timeout=120000)
                r = wait_report(a.out, rid, 330)
                if r is None:
                    try: st = pg.evaluate("JSON.stringify({app: !!window.__app, ready: window.__app && window.__app.ready, frames: window.__app && window.__app.frames, stage: window.__app && window.__app.stage, lost: window.__app && window.__app.lost, err: (document.getElementById('err') || {}).textContent, mode: window.__app && window.__app.S && window.__app.S.mode, ms: window.__app && window.__app.S && window.__app.S.ms})")
                    except Exception as e: st = 'page state unavailable: ' + str(e)[:160]
                    print('  page state:', st, flush=True)
                    open(os.path.join(a.out, 'reports.jsonl'), 'a', encoding='utf-8').write(json.dumps({'id': rid, 'failed': 'no report in 330 s', 'text': st, 'errs': []}, ensure_ascii=False) + '\n')
                print(rid, 'no report' if r is None else r.get('failed') or '%s ms  %s' % (r.get('median'), (r.get('gpu') or {}).get('renderer')), flush=True)
                try: pg.screenshot(path=os.path.join(a.out, rid + '.png'), timeout=60000)
                except Exception as e: print('  screenshot failed:', str(e)[:120])
            except Exception as e:
                print(rid, 'ERROR', str(e)[:200], flush=True)
            pg.close()
        b.close()
finally:
    srv.terminate()
