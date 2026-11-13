import json,struct,sys,collections
for fn in sys.argv[1:]:
    b=open(fn,'rb').read()
    magic,ver,ln=struct.unpack('<4sII',b[:12]); jl,jt=struct.unpack('<I4s',b[12:20]); j=json.loads(b[20:20+jl])
    print('==',fn.split('/')[-1],len(b),'bytes; extUsed',j.get('extensionsUsed'),'extReq',j.get('extensionsRequired'))
    print(' scenes',len(j.get('scenes',[])),'nodes',len(j.get('nodes',[])),'meshes',len(j.get('meshes',[])),'mats',len(j.get('materials',[])),'tex',len(j.get('textures',[])),'img',len(j.get('images',[])),'acc',len(j.get('accessors',[])),'bv',len(j.get('bufferViews',[])))
    prims=sum(len(m['primitives']) for m in j.get('meshes',[]))
    vtx=0;idx=0;attrs=collections.Counter()
    for m in j.get('meshes',[]):
        for p in m['primitives']:
            for k in p['attributes']: attrs[k]+=1
            if 'POSITION' in p['attributes']: vtx+=j['accessors'][p['attributes']['POSITION']]['count']
            if 'indices' in p: idx+=j['accessors'][p['indices']]['count']
            for e in p.get('extensions',{}): attrs['ext:'+e]+=1
    print(' prims',prims,'verts',vtx,'tris',idx//3,dict(attrs))
    for i,im in enumerate(j.get('images',[])[:6]):
        bv=j['bufferViews'][im['bufferView']] if 'bufferView' in im else None
        print('  img',i,im.get('mimeType'),im.get('uri','')[:60],bv['byteLength'] if bv else None)
    tot=sum(j['bufferViews'][im['bufferView']]['byteLength'] for im in j.get('images',[]) if 'bufferView' in im)
    print('  images total bytes',tot)
    n0=j['nodes'][0] if j.get('nodes') else None
    print('  node0',{k:(v if k!='children' else len(v)) for k,v in (n0 or {}).items()})
    if j.get('materials'): print('  mat0',json.dumps(j['materials'][0])[:300])
    if 'extensions' in j: print('  rootExt keys',list(j['extensions'].keys()), json.dumps(j['extensions'])[:500])
    pe=j['meshes'][0]['primitives'][0]; print('  prim0',json.dumps(pe)[:400])
    a=j['accessors'][pe['attributes']['POSITION']]; print('  posAcc',a)
