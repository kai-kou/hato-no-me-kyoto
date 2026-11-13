import sys,json,subprocess,time,os
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
args=sys.argv[1:]; W,H,wait,frames=1280,720,6,3; mobile=False
qs=[]; prefix=args[0]
i=1
while i<len(args):
    a=args[i]
    if a=='--size': W,H=map(int,args[i+1].split('x')); i+=2
    elif a=='--wait': wait=float(args[i+1]); i+=2
    elif a=='--mobile': mobile=True; i+=1
    elif a=='--js': js=args[i+1]; js=open(js).read() if os.path.isfile(js) else js; qs[-1]=(qs[-1][0],js); i+=2   # a file, or the JavaScript itself
    else: qs.append((a,None)); i+=1
srv=subprocess.Popen(['python3','-m','http.server','8777','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-features=SharedArrayBuffer'])
    ctx=b.new_context(viewport={'width':W,'height':H},device_scale_factor=(2 if mobile else 1),is_mobile=mobile,has_touch=mobile)
    for n,(q,js) in enumerate(qs):
      pg=ctx.new_page(); logs=[]
      pg.on('console',lambda m: logs.append(m.type+': '+m.text[:400]) if m.type in('error','warning') and 'GPU stall' not in m.text else None); pg.on('pageerror',lambda e: logs.append('PAGEERR '+str(e)[:600]))
      t0=time.time(); pg.goto('http://localhost:8777/index.html?'+q)
      try: pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2',timeout=180000)
      except Exception as e: logs.append('TIMEOUT waiting ready')
      t1=time.time()
      if js: 
        try: print('js:',pg.evaluate(js))
        except Exception as e: logs.append('JSERR '+str(e)[:300])
      pg.wait_for_timeout(int(wait*1000))
      try:
        info=pg.evaluate("(()=>{const a=window.__app,i=a.renderer.info;return JSON.stringify({calls:i.render.calls,tris:i.render.triangles,tex:i.memory.textures,geo:i.memory.geometries,progs:i.programs?i.programs.length:0,frames:a.frames,lv:a.world.tex.stats(),bg:!!a.bgDone,extra:a.dbg||null})})()")
      except Exception as e: info='noinfo '+str(e)[:200]
      pg.screenshot(path='%s_%d.png'%(prefix,n),timeout=240000); print('[%d] load %.1fs'%(n,t1-t0),info)
      for l in logs[:10]: print('   ',l)
      pg.close()
    b.close()
finally: srv.terminate()
