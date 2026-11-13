(async()=>{const a=__app,w=ms=>new Promise(r=>setTimeout(r,ms)),click=id=>document.getElementById(id).click(),out=[];
 const press=c=>{dispatchEvent(new KeyboardEvent('keydown',{code:c}));dispatchEvent(new KeyboardEvent('keyup',{code:c}));};
 if(!a.S.started){click('btnStart');await w(800);}
 for(const k of ['Digit1','Digit2','Digit3','Digit4','Digit5']){press(k);await w(1500);out.push(a.S.mode+':'+a.frames);}
 press('Digit3'); click('btnFeed'); await w(800); click('btnClap'); await w(1200); click('btnFly'); await w(600);
 a.hour=21; a.world.setHour(21); await w(1500); out.push('night:'+a.frames+':walkers '+a.people.H.filter(h=>h.walk&&h.mesh.visible).length);
 a.hour=23.5; a.world.setHour(23.5); await w(1500); out.push('late: walkers '+a.people.H.filter(h=>h.walk&&!h.hidden).length+' still '+(a.people.still?a.people.still.visible:'-'));
 click('btnInfo'); await w(300); out.push(document.getElementById('diag').textContent.slice(0,70));
 out.push('people '+a.people.H.length+' kimono '+a.people.H.filter(h=>h.kim).length+' sit '+a.people.H.filter(h=>h.sit).length+' stand '+a.people.H.filter(h=>h.stand).length);
 return out.join(' | ');})()
