import sys,subprocess,time,io
from _paths import APP, MEDIA, TMP, CHROME
from playwright.sync_api import sync_playwright
from PIL import Image
out=sys.argv[1]; q=sys.argv[2]; n=int(sys.argv[3]) if len(sys.argv)>3 else 6; W,H=(int(v) for v in (sys.argv[4] if len(sys.argv)>4 else '520x320').split('x')); crop=[float(v) for v in sys.argv[5].split(',')] if len(sys.argv)>5 else None
srv=subprocess.Popen(['python3','-m','http.server','8777','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=b.new_page(viewport={'width':W,'height':H}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:300]))
    pg.goto('http://localhost:8777/index.html?'+q); pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames>3',timeout=180000)
    pg.evaluate("document.body.classList.add('noui'); document.getElementById('toast').style.display='none'")
    ims=[]; last=pg.evaluate('window.__app.frames')
    for i in range(n):
        pg.wait_for_function('window.__app.frames>%d'%last,timeout=120000); last=pg.evaluate('window.__app.frames')
        im=Image.open(io.BytesIO(pg.screenshot(timeout=240000))).convert('RGB')
        if crop: im=im.crop((int(crop[0]*W),int(crop[1]*H),int(crop[2]*W),int(crop[3]*H)))
        ims.append(im)
    cols=3 if n>4 else n; rows=(n+cols-1)//cols; w,h=ims[0].size; sheet=Image.new('RGB',(w*cols,h*rows))
    for i,im in enumerate(ims): sheet.paste(im,((i%cols)*w,(i//cols)*h))
    sheet.save(out); print('saved',out,sheet.size,'errors',errs[:3]); b.close()
finally: srv.terminate()
