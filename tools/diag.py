import sys,subprocess,time,os,json
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8779','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
JS=open(sys.argv[1]).read()
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':320,'height':200}); pg.on('pageerror',lambda e: print('PAGEERR',str(e)[:300]))
    pg.goto('http://localhost:8779/index.html?auto=1&q=high&scale=0.15&t=15.5'); pg.wait_for_function('window.__app && window.__app.ready',timeout=180000)
    print(pg.evaluate(JS)); b.close()
finally: srv.terminate()
