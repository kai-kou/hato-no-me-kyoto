# Safari in the iOS Simulator (macOS with Xcode only). Nothing drives the page from outside: the simulator is told to open
# a URL, the page measures itself and posts the result back to the server on the host, and simctl takes the screenshot.
# This is the iOS build of WebKit with a phone-sized screen and touch input, drawn by the host's GPU: not a real phone.
# usage: python3 tools/devicecheck/ios.py --out DIR [--device "iPhone 16"]
import argparse, json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from cases import CASES, DIAG, url, wait_report
ap = argparse.ArgumentParser(); ap.add_argument('--out', required=True); ap.add_argument('--device', default=''); ap.add_argument('--port', type=int, default=8793); ap.add_argument('--only', default=''); a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
sim = lambda *x, **kw: subprocess.run(['xcrun', 'simctl'] + list(x), capture_output=True, text=True, **kw)
D = json.loads(sim('list', 'devices', 'available', '-j').stdout)['devices']; cand = []
for rt, devs in D.items():
    m = re.search(r'iOS-(\d+)-(\d+)', rt)
    if not m: continue
    for d in devs:
        if d['name'].startswith('iPhone') and (not a.device or d['name'] == a.device):
            n = re.search(r'iPhone (\d+)', d['name']); plain = not re.search(r'Pro|Plus|Max|mini|SE|e$', d['name'])
            cand.append(((int(m.group(1)), int(m.group(2)), int(n.group(1)) if n else 0, plain), d, rt))
if not cand: sys.exit('no iPhone simulator available: ' + ', '.join(D.keys()))
cand.sort(key=lambda c: c[0]); _, dev, rt = cand[-1]; U = dev['udid']
print('simulator:', dev['name'], rt.split('.')[-1], flush=True)
json.dump({'device': dev['name'], 'runtime': rt.split('.')[-1]}, open(os.path.join(a.out, 'simulator.json'), 'w'))
srv = subprocess.Popen([sys.executable, os.path.join(HERE, 'serve.py'), '--port', str(a.port), '--out', a.out]); time.sleep(1.2)
try:
    sim('boot', U); print(sim('bootstatus', U, '-b', timeout=600).stdout[-300:], flush=True)
    for label, query in CASES + DIAG:
        if a.only and label not in a.only.split(','): continue
        rid = 'ios-sim--' + label; r0 = sim('openurl', U, url(a.port, 'ios-sim', label, query))
        if r0.returncode: print(rid, 'openurl failed:', r0.stderr[:200], flush=True)
        r = wait_report(a.out, rid, 360)
        print(rid, 'no report' if r is None else r.get('failed') or '%s ms  %s' % (r.get('median'), (r.get('gpu') or {}).get('renderer')), flush=True)
        s = sim('io', U, 'screenshot', os.path.join(a.out, rid + '.png'))
        if s.returncode: print('  screenshot failed:', s.stderr[:160])
finally:
    srv.terminate(); sim('shutdown', U)
