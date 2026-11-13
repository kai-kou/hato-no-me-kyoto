import sys,subprocess,time,os
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
out=sys.argv[1]; W,H=1280,720; qs=[]; i=2
while i<len(sys.argv):
    a=sys.argv[i]
    if a=='--size': W,H=map(int,sys.argv[i+1].split('x')); i+=2
    else: qs.append(a); i+=1
import shutil; PAGE=os.path.join(APP,'_human_test.html'); shutil.copyfile(os.path.join(os.path.dirname(os.path.abspath(__file__)),'dev','human_test.html'),PAGE)
srv=subprocess.Popen(['python3','-m','http.server','8791','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.7)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx=b.new_context(viewport={'width':W,'height':H})
    for n,q in enumerate(qs):
      pg=ctx.new_page(); logs=[]
      pg.on('console',lambda m: logs.append(m.type+': '+m.text[:500]) if m.type in('error','warning') else None); pg.on('pageerror',lambda e: logs.append('PAGEERR '+str(e)[:800]))
      pg.goto('http://localhost:8791/_human_test.html?'+q)
      try: pg.wait_for_function('window.__frames>3',timeout=60000)
      except Exception as e: logs.append('TIMEOUT')
      try: print(pg.evaluate('window.__info()'))
      except Exception as e: pass
      pg.screenshot(path='%s_%d.png'%(out,n)); 
      for l in logs[:8]: print('  ',l)
      pg.close()
    b.close()
finally: srv.terminate(); os.remove(PAGE)
