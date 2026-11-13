import sys,subprocess,time
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
eng=sys.argv[1]; q=sys.argv[2]; out=sys.argv[3]; W,H=(int(v) for v in (sys.argv[4] if len(sys.argv)>4 else '800x480').split('x'))
srv=subprocess.Popen(['python3','-m','http.server','8777','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    bt=getattr(p,eng)
    try: b=bt.launch(headless=False, firefox_user_prefs={'webgl.force-enabled':True,'webgl.disabled':False,'webgl.enable-webgl2':True,'gfx.webrender.software':True,'layers.acceleration.force-enabled':True}) if eng=='firefox' else bt.launch()
    except Exception as e: print('LAUNCH FAIL',str(e)[:1500]); sys.exit(0)
    pg=b.new_page(viewport={'width':W,'height':H}); logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text[:300]) if m.type in('error','warning') else None); pg.on('pageerror',lambda e: logs.append('PAGEERR '+str(e)[:500]))
    t0=time.time(); pg.goto('http://localhost:8777/index.html?'+q)
    try: pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2',timeout=240000); ok=True
    except Exception as e: ok=False; logs.append('TIMEOUT '+str(e)[:200])
    print(eng,'ready',ok,'%.1fs'%(time.time()-t0))
    try: print(pg.evaluate("(()=>{const a=window.__app; if(!a) return 'no app: '+document.getElementById('err').textContent; const gl=a.renderer.getContext(); const d=gl.getExtension('WEBGL_debug_renderer_info'); return JSON.stringify({tier:a.Q.tier,frames:a.frames,ms:a.S&&a.S.ms,gl2:gl instanceof WebGL2RenderingContext,rend:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),hf:a.post.type,err:document.getElementById('err').textContent,calls:a.renderer.info.render.calls,progs:a.renderer.info.programs.length})})()"))
    except Exception as e: print('eval fail',str(e)[:300])
    if len(sys.argv)>5:
        try: print('js:',pg.evaluate(open(sys.argv[5]).read()))
        except Exception as e: print('JSERR',str(e)[:400])
    pg.wait_for_timeout(4000)
    try: pg.screenshot(path=out,timeout=120000)
    except Exception as e: print('shot fail',str(e)[:200])
    for l in logs[:14]: print('   ',l)
    b.close()
finally: srv.terminate()
