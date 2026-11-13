(()=>{ const a=__app, P=a.people, n=a.world.nav, path=P.paths[2], F=a.FREE;
  const h = P.H.find(h=>h.walk&&h.kim&&h.path===path) || P.H.find(h=>h.walk&&h.kim); const pp=h.path, q={};
  // the spot on the route with the most pigeons on the ground within 45 m
  let bt=0.5,bc=-1; for(let i=12;i<=88;i++){pp.at(i/100,q);const c=a.flock.B.filter(b=>!b.air&&Math.hypot(b.x-q.x,b.z-q.z)<45).length;if(c>bc){bc=c;bt=i/100;}}
  pp.at(bt,q); const fx=q.x, fz=q.z; let near=0, rounds=0, ticks=0; a.fast=true; const T0=performance.now();
  for(; rounds<5; rounds++){ a.feedAt(fx,fz,30); h.dir=1; h.t=bt-21/pp.len; if(h.t<0.02){h.dir=-1;h.t=bt+21/pp.len;} h.yaw=null; let g=0; a.tick(1/30); while(Math.hypot(h.x-fx,h.z-fz)>6.4&&g++<900){a.tick(1/30);ticks++;}
    near=a.flock.B.filter(b=>Math.hypot(b.x-fx,b.z-fz)<3.2&&!b.air).length; if(near>=6||performance.now()-T0>90000) break; } a.fast=false;
  pp.at(bt,q); const ux=q.ux*h.dir, uz=q.uz*h.dir; F[0]=fx+ux*2.3-uz*0.55; F[2]=fz+uz*2.3+ux*0.55; F[1]=n.ground(F[0],F[2])+0.17; F[3]=fx-ux*3; F[4]=n.ground(fx,fz)+0.62; F[5]=fz-uz*3; F[6]=46;
  return JSON.stringify({within45:bc,food:[fx.toFixed(1),fz.toFixed(1)],walker:[h.x.toFixed(1),h.z.toFixed(1)],dist:Math.hypot(h.x-fx,h.z-fz).toFixed(1),near,rounds,ticks,cam:F.map(v=>+v.toFixed(2))});
})()
