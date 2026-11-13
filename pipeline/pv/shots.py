import sys,json,subprocess,time,os
from playwright.sync_api import sync_playwright
# usage: shots.py prefix files 'x,y,z;tx,ty,tz|...' [w h]
prefix,files,cams=sys.argv[1],sys.argv[2],sys.argv[3]; W=int(sys.argv[4]) if len(sys.argv)>4 else 1280; H=int(sys.argv[5]) if len(sys.argv)>5 else 720
srv=subprocess.Popen(['python3','-m','http.server','8766','--directory',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('HATO_CHROME','/usr/bin/google-chrome'),args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':W,'height':H}); logs=[]
    pg.on('console',lambda m: logs.append(m.type+': '+m.text[:200]) if m.type=='error' else None); pg.on('pageerror',lambda e: logs.append('PAGEERR '+str(e)[:300]))
    pg.goto('http://localhost:8766/pv/viewer.html?f='+files+(('&gy='+sys.argv[6]) if len(sys.argv)>6 else '')); pg.wait_for_function('window.__loaded===true',timeout=240000)
    print(pg.evaluate('JSON.stringify(window.__info)'))
    for i,c in enumerate(cams.split('|')):
      a,t=c.split(';'); pg.evaluate('shot([%s],[%s])'%(a,t)); pg.wait_for_timeout(1500); pg.evaluate('shot([%s],[%s])'%(a,t)); pg.wait_for_timeout(300); pg.screenshot(path='%s_%d.png'%(prefix,i))
    print('\n'.join(logs[:8])); b.close()
finally: srv.terminate()
