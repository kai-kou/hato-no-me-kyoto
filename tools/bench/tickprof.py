import sys, json, subprocess, time, collections
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__file__), '..'))
from _paths import APP, CHROME
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3', '-m', 'http.server', '8777', '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        for q in sys.argv[1:]:
            pg = ctx.new_page(); pg.goto('http://localhost:8777/index.html?' + q)
            pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2', timeout=240000)
            pg.evaluate("document.body.classList.add('started')"); pg.wait_for_timeout(2500)
            boot = pg.evaluate("JSON.stringify(window.__app.boot)")
            c = ctx.new_cdp_session(pg); c.send('Profiler.enable'); c.send('Profiler.setSamplingInterval', {'interval': 400}); c.send('Profiler.start')
            # the simulation step alone, 3000 times at 1/60 s, with nothing drawn in between
            r = pg.evaluate("""() => { const a = window.__app, N = 600; const t0 = performance.now(); for (let i = 0; i < N; i++) a.tick(1 / 60); const ms = performance.now() - t0; return { N, ms, per: ms / N }; }""")
            prof = c.send('Profiler.stop')['profile']
            nodes = {n['id']: n for n in prof['nodes']}; self_us = collections.Counter()
            for nid, d in zip(prof['samples'], prof['timeDeltas']): self_us[nid] += d
            by_fn = collections.Counter(); by_file = collections.Counter(); tot = 0
            for nid, us in self_us.items():
                cf = nodes[nid]['callFrame']; f = cf['url'].split('/')[-1].split('?')[0] or cf['functionName']
                if f in ('(program)', '(idle)', '(root)'): continue
                tot += us; by_fn[(f, cf['functionName'] or '(anon)', cf.get('lineNumber', 0) + 1)] += us; by_file[f] += us
            print(json.dumps({'query': q, 'tick': r, 'boot': json.loads(boot), 'by_file_pct': {k: round(100 * v / tot, 1) for k, v in by_file.most_common(10)},
                              'top': [[f, fn, ln, round(100 * v / tot, 1), round(v / 1000 / r['N'], 4)] for (f, fn, ln), v in by_fn.most_common(25)]}, ensure_ascii=False))
            pg.close()
        b.close()
finally: srv.terminate()
