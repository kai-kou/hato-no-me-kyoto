# Where the main thread spends its time: a CPU profile of the running simulation, summed by file and by function.
#   python3 tools/prof.py [seconds] "<query>" ["<query>" ...]
# The rasterisation itself runs in the GPU process (here: SwiftShader) and is not in this profile; what is counted is the
# JavaScript of the page plus the time the main thread waits inside WebGL calls. That is the part a rewrite in
# WebAssembly could touch at all.
import sys, json, subprocess, time, collections
from _paths import APP, CHROME
from playwright.sync_api import sync_playwright
args = sys.argv[1:]; secs = 8.0
if args and args[0].replace('.', '').isdigit(): secs = float(args.pop(0))
srv = subprocess.Popen(['python3', '-m', 'http.server', '8777', '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
out = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        for q in args:
            pg = ctx.new_page(); pg.goto('http://localhost:8777/index.html?' + q)
            pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2', timeout=240000)
            pg.evaluate("document.body.classList.add('started')"); pg.wait_for_timeout(3000)
            # the simulation step is timed on its own as well
            pg.evaluate("""() => { const a = window.__app, t = a.tick; window.__tk = { n: 0, ms: 0 }; a.tick = dt => { const t0 = performance.now(); t(dt); window.__tk.ms += performance.now() - t0; window.__tk.n++; }; window.__f0 = a.frames; }""")
            c = ctx.new_cdp_session(pg); c.send('Profiler.enable'); c.send('Profiler.setSamplingInterval', {'interval': 500}); c.send('Profiler.start')
            pg.wait_for_timeout(int(secs * 1000))
            prof = c.send('Profiler.stop')['profile']
            st = pg.evaluate("() => ({ frames: window.__app.frames - window.__f0, tick: window.__tk, tris: window.__app.renderer.info.render.triangles, calls: window.__app.renderer.info.render.calls, boot: window.__app.boot })")
            nodes = {n['id']: n for n in prof['nodes']}; dts = prof['timeDeltas']; self_us = collections.Counter()
            for nid, d in zip(prof['samples'], dts): self_us[nid] += d
            total = sum(dts); by_file = collections.Counter(); by_fn = collections.Counter()
            for nid, us in self_us.items():
                cf = nodes[nid]['callFrame']; f = cf['url'].split('/')[-1].split('?')[0] or cf['functionName']; fn = cf['functionName'] or '(anonymous)'
                by_file[f] += us; by_fn[(f, fn, cf.get('lineNumber', 0))] += us
            r = {'query': q, 'seconds': total / 1e6, 'frames': st['frames'], 'tris': st['tris'], 'calls': st['calls'],
                 'tick_ms_per_frame': round(st['tick']['ms'] / max(1, st['tick']['n']), 3),
                 'by_file_pct': {k: round(100 * v / total, 2) for k, v in by_file.most_common(14)},
                 'ms_per_frame_by_file': {k: round(v / 1000 / max(1, st['frames']), 2) for k, v in by_file.most_common(14)},
                 'top_fn_pct': [[f, fn, ln, round(100 * v / total, 2)] for (f, fn, ln), v in by_fn.most_common(22)], 'boot': st['boot']}
            out.append(r); print(json.dumps(r, ensure_ascii=False)); pg.close()
        b.close()
finally: srv.terminate()
