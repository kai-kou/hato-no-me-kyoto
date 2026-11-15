# Serves the app with the self-measuring probe added to index.html, and collects what the pages report.
# usage: python3 tools/devicecheck/serve.py --port 8793 --out DIR      (reports go to DIR/reports.jsonl)
import argparse, http.server, json, os, sys, threading
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from _paths import APP
ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8793); ap.add_argument('--out', required=True); a = ap.parse_args()
os.makedirs(a.out, exist_ok=True); HERE = os.path.dirname(os.path.abspath(__file__)); LOCK = threading.Lock()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kw): super().__init__(*args, directory=APP, **kw)
    def log_message(self, *args): pass
    def _send(self, body, ctype):
        self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p in ('/', '/index.html'):
            s = open(os.path.join(APP, 'index.html'), encoding='utf-8').read(); i = s.rfind('</body>')
            return self._send((s[:i] + '<script src="/__probe.js"></script>' + s[i:]).encode('utf-8'), 'text/html; charset=utf-8')
        if p == '/__probe.js': return self._send(open(os.path.join(HERE, 'probe.js'), 'rb').read(), 'text/javascript')
        return super().do_GET()
    def do_POST(self):
        if self.path != '/report': self.send_error(404); return
        n = int(self.headers.get('Content-Length') or 0); raw = self.rfile.read(min(n, 200000))
        try: o = json.loads(raw)
        except Exception: self.send_error(400); return
        with LOCK: open(os.path.join(a.out, 'reports.jsonl'), 'a', encoding='utf-8').write(json.dumps(o, ensure_ascii=False) + '\n')
        self._send(b'ok', 'text/plain')
http.server.ThreadingHTTPServer(('0.0.0.0', a.port), H).serve_forever()
