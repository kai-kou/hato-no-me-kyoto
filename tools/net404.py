import sys,subprocess,time
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8777','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':420,'height':260}); bad=[]; n=[0]; tot=[0]
    def onresp(r):
        n[0]+=1
        if r.status>=400: bad.append((r.status,r.url))
    pg.on('response',onresp)
    pg.goto('http://localhost:8777/index.html?'+sys.argv[1]); pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>2',timeout=180000); pg.wait_for_timeout(8000)
    print('responses',n[0],'bad',bad); b.close()
finally: srv.terminate()
