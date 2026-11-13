import subprocess,time,os
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8796','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':640,'height':360}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:8796/index.html?auto=1&scale=0.3'); pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2',timeout=240000)
    print('start tier',pg.evaluate('__app.Q.tier'))
    for k in range(3):
        pg.evaluate("window.__gen=(window.__gen||0); window.__mark='m'+Math.random(); __app.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()")
        pg.wait_for_timeout(600)
        st=pg.evaluate("JSON.stringify({on:document.getElementById('lost').classList.contains('on'),msg:document.getElementById('lostMsg').textContent,lost:sessionStorage.getItem('hato.lost'),q:localStorage.getItem('hato.q')})"); print('after loss',k,st)
        if k==2:
            pg.wait_for_timeout(4000); print('still on same page (no auto restart):',pg.evaluate("!!window.__mark")); pg.click('#lostBtn')
        pg.wait_for_function('!window.__mark && window.__app && window.__app.ready && window.__app.frames>2',timeout=240000)
        print('reloaded tier',pg.evaluate('__app.Q.tier'),'url',pg.url[-40:])
    print('errors',errs[:3]); b.close()
finally: srv.terminate()
