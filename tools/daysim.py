# Run the flock model alone at fixed hours and report the share of time per behaviour.
import sys,subprocess,time,json
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
JS = r"""
(() => { const a = window.__app, f = a.flock, out = {}; f.threats.length = 0;
  const hours = [7.5, 12, 15.5, 22], durs = [], t0s = new Map();
  for (const h of hours) { const c = {}, ev = {}; let n = 0;
    const step = (sec, sample) => { const N = Math.round(sec / 0.05); for (let i = 0; i < N; i++) { f.update(0.05, h);
      for (const e of f.events) { if (!sample) continue; ev[e.t] = (ev[e.t] || 0) + 1; if (e.t === 'takeoff') t0s.set(e.b.i, f.t); if (e.t === 'land' && t0s.has(e.b.i)) { durs.push(f.t - t0s.get(e.b.i)); t0s.delete(e.b.i); } }
      f.events.length = 0;
      if (sample && i % 100 === 0) for (const b of f.B) { if (b.manual) continue; const k = b.air ? 'fly' : (b.st === 'loaf' ? (b.sub || 'rest') : b.st); c[k] = (c[k] || 0) + 1; n++; } } };
    step(600, false); t0s.clear(); step(1800, true);
    out[h] = { share: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(100 * v / n).toFixed(1)])), ev }; }
  durs.sort((x, y) => x - y); out.flights = { n: durs.length, median: +durs[durs.length >> 1].toFixed(1), p90: +durs[Math.floor(durs.length * 0.9)].toFixed(1), max: +durs[durs.length - 1].toFixed(1) };
  out.birds = f.B.length; out.timeScale = a.timeScale; return JSON.stringify(out); })()
"""
port=8778
srv=subprocess.Popen(['python3','-m','http.server',str(port),'--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':640,'height':360}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:%d/index.html?q=low&scale=0.3&auto=1&n=90&nolife=1&rec=30'%port); pg.wait_for_function('window.__app && window.__app.ready',timeout=300000)
    t0=time.time(); r=pg.evaluate(JS); print(r); print('sim %.0fs'%(time.time()-t0),'errors',errs[:3]); b.close()
finally: srv.terminate()
