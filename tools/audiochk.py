import os,sys,json,base64,subprocess,time,wave
from _paths import APP, MEDIA, TMP, CHROME
import numpy as np
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8777','--directory',APP],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path=CHROME,args=['--no-sandbox']); pg=b.new_page(); pg.goto('http://localhost:8777/index.html?q=low'); 
    res=json.loads(pg.evaluate(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'audiotest.js')).read())); b.close()
finally: srv.terminate()
import os; os.makedirs(TMP+'/snd',exist_ok=True)
for k,v in res.items():
    x=np.frombuffer(base64.b64decode(v['b64']),dtype=np.int16).astype(np.float32)/32767; sr=44100
    w=wave.open(TMP+'/snd/%s.wav'%k,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x*32767).astype(np.int16).tobytes()); w.close()
    sp=np.abs(np.fft.rfft(x*np.hanning(len(x)))); f=np.fft.rfftfreq(len(x),1/sr); pw=sp**2; cen=(f*pw).sum()/max(pw.sum(),1e-9); dom=f[np.argmax(sp[5:])+5]
    cum=np.cumsum(pw)/max(pw.sum(),1e-9); f10=f[np.searchsorted(cum,0.1)]; f90=f[np.searchsorted(cum,0.9)]
    # active duration (above -40 dB of peak)
    env=np.abs(x); thr=max(env.max()*0.01,1e-5); act=np.where(env>thr)[0]; dur=(act[-1]-act[0])/sr if len(act) else 0
    print('%-14s peak %.3f rms %.4f (%.1f dBFS) dominant %6.0f Hz centroid %6.0f Hz band10-90 %5.0f-%5.0f Hz active %.2fs'%(k,v['peak'],v['rms'],20*np.log10(max(v['rms'],1e-6)),dom,cen,f10,f90,dur))
