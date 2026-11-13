# Serve the site under a nested path with a strict CSP, embedded in a sandboxed cross-origin iframe, and check that it runs.
import sys,threading,time,http.server,socketserver,functools,os
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
ROOT=APP; PREFIX='/artifact/9aa6/v9/'
CSP="default-src 'none'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; font-src https://fonts.gstatic.com data:; worker-src 'self' blob:; frame-ancestors *"
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self,path):
        p=path.split('?')[0]
        if not p.startswith(PREFIX): return '/nonexistent'
        return os.path.join(ROOT,p[len(PREFIX):] or 'index.html')
    def end_headers(self):
        self.send_header('Content-Security-Policy',CSP); self.send_header('X-Content-Type-Options','nosniff'); super().end_headers()
    def log_message(self,*a): pass
class P(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body=('<!DOCTYPE html><html><body style="margin:0;background:#222"><iframe id="f" src="http://127.0.0.1:8781%sindex.html" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="fullscreen" style="border:0;width:%dpx;height:%dpx"></iframe></body></html>'%(PREFIX,W,Hh)).encode()
        self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self,*a): pass
W,Hh=(int(v) for v in (sys.argv[2] if len(sys.argv)>2 else '800x480').split('x')); eng=sys.argv[1] if len(sys.argv)>1 else 'chromium'
socketserver.TCPServer.allow_reuse_address=True
s1=socketserver.ThreadingTCPServer(('127.0.0.1',8781),H); s2=socketserver.ThreadingTCPServer(('127.0.0.1',8782),P)
for s in (s1,s2): threading.Thread(target=s.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']) if eng=='chromium' else p.webkit.launch()
    pg=b.new_page(viewport={'width':W,'height':Hh}); logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text[:300]) if m.type in('error','warning') else None); pg.on('pageerror',lambda e: logs.append('PAGEERR '+str(e)[:400]))
    bad=[]; pg.on('response',lambda r: bad.append((r.status,r.url[-60:])) if r.status>=400 else None)
    pg.goto('http://localhost:8782/'); fr=None
    for i in range(50):
        fr=[f for f in pg.frames if '8781' in f.url]
        if fr: break
        time.sleep(0.2)
    fr=fr[0]; t0=time.time()
    ok=False
    # the page opens on the landing page: press its opening screen, as a visitor would, and the simulation starts from there
    lp=False
    for i in range(40):
        try:
            if fr.evaluate("document.readyState!=='loading'"): lp=fr.evaluate("document.documentElement.classList.contains('lp')"); break
        except Exception as e: pass
        time.sleep(0.25)
    if lp:
        try: print('landing page', fr.evaluate("(()=>{const l=document.getElementById('lp'),v=l.querySelector('.lp-screen video');return JSON.stringify({video:!!(v&&v.currentSrc),paused:v?v.paused:null,broken:[...l.querySelectorAll('img')].filter(i=>i.complete&&!i.naturalWidth).length,booted:!!window.__hatoBooted})})()")); fr.click('.lp-hero .lp-screen',timeout=20000)
        except Exception as e: print('landing page click failed',str(e)[:200])
    for i in range(240):
        try:
            if fr.evaluate('!!(window.__app && window.__app.ready && window.__app.frames>2)'): ok=True; break
        except Exception as e: pass
        time.sleep(1)
    print(eng,'in sandboxed cross-origin iframe with CSP: ready',ok,'%.1fs'%(time.time()-t0),'frame url',fr.url)
    try:
        print(fr.evaluate("(async()=>{const a=window.__app,w=ms=>new Promise(r=>setTimeout(r,ms));if(!a.S.started)document.getElementById('btnStart').click();await w(1500);let ls='ok';try{localStorage.setItem('hato.t','1')}catch(e){ls='blocked'};return JSON.stringify({started:a.S.started,fromLanding:!!window.__hatoGo,mode:a.S.mode,audio:a.snd.ctx?a.snd.ctx.state:'none',tier:a.Q.tier,ls,err:document.getElementById('err').textContent,texLv:a.world.tex.stats()})})()"))
    except Exception as e: print('eval fail',str(e)[:300])
    pg.wait_for_timeout(3000); pg.screenshot(path=TMP+'/csp_%s.png'%eng,timeout=120000)
    print('bad responses',bad[:5]); [print('   ',l) for l in logs[:12]]; b.close()
s1.shutdown(); s2.shutdown()
