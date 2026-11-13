import math,sys,os,subprocess
def t(lon,lat,z):
    n=2**z; x=(lon+180)/360*n; y=(1-math.log(math.tan(math.radians(lat))+1/math.cos(math.radians(lat)))/math.pi)/2*n; return x,y
def rng(w,s,e,n,z):
    x0,y0=t(w,n,z); x1,y1=t(e,s,z); return range(int(x0),int(x1)+1),range(int(y0),int(y1)+1)
jobs=[]
DL=os.environ.get('HATO_DL') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','pipeline','dl')
CTX=(135.7655,34.9995,135.7805,35.0115)
for name,url,z,box,ext in [
  ('dem1a','https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png',17,CTX,'png'),
  ('dem5a','https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png',15,CTX,'png'),
  ('ortho','https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png',18,CTX,'png'),
  ('gsiphoto','https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',18,(135.7690,35.0026,135.7766,35.0082),'jpg'),
  ('demfar','https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png',12,(135.62,34.89,135.92,35.13),'png'),
  ('photofar','https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',12,(135.62,34.89,135.92,35.13),'jpg'),
]:
    xs,ys=rng(*box,z); d=os.path.join(DL,'gsi',name); os.makedirs(d,exist_ok=True)
    print(name,z,'x',xs[0],xs[-1],'y',ys[0],ys[-1],'n',len(xs)*len(ys))
    for x in xs:
        for y in ys: jobs.append('%s %s/%d_%d_%d.%s'%(url.format(z=z,x=x,y=y),d,z,x,y,ext))
open(os.path.join(DL,'gsi','tilejobs.txt'),'w').write('\n'.join(jobs))
