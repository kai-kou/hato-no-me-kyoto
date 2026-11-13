# Capture a clip frame by frame with a fixed time step after running a choreography script in the page, then encode with ffmpeg.
# usage: rec2.py out.mp4 "<query>" <frames> <WxH> <fps> <port> <jsfile> [preroll]
import sys,subprocess,time,os,shutil
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
out=sys.argv[1]; q=sys.argv[2]; n=int(sys.argv[3]); W,H=(int(v) for v in sys.argv[4].split('x')); fps=int(sys.argv[5]); port=int(sys.argv[6]); js=open(sys.argv[7]).read(); pre=int(sys.argv[8]) if len(sys.argv)>8 else 12
tmp=TMP+'/rec_'+os.path.basename(out).split('.')[0]; shutil.rmtree(tmp,ignore_errors=True); os.makedirs(tmp)
srv=subprocess.Popen(['python3','-m','http.server',str(port),'--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':W,'height':H}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:%d/index.html?rec=%d&%s'%(port,fps,q)); pg.wait_for_function('window.__app && window.__app.ready',timeout=240000)
    pg.evaluate("document.body.classList.add('noui'); document.getElementById('toast').style.display='none'; window.__rendered=0")
    print('js:',pg.evaluate(js),flush=True)
    t0=time.time(); last=0
    for i in range(n+pre):
        pg.evaluate('window.__next=true'); pg.wait_for_function('window.__rendered>%d'%last,timeout=300000); last=pg.evaluate('window.__rendered')
        if i<pre: pg.wait_for_timeout(350)
        else: pg.screenshot(path='%s/f%04d.png'%(tmp,i-pre),timeout=300000)
        if i%30==0: print('frame',i,'%.0fs'%(time.time()-t0),pg.evaluate("JSON.stringify(window.__app.world.tex.stats())"),flush=True)
    b.close(); print('errors',errs[:3])
finally: srv.terminate()
r=subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate',str(fps),'-i',tmp+'/f%04d.png','-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','slow','-movflags','+faststart',out]); print('ffmpeg',r.returncode,os.path.getsize(out) if os.path.exists(out) else 0)
