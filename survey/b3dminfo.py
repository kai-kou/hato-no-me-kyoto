import json,struct,sys
fn=sys.argv[1]; b=open(fn,'rb').read()
magic,ver,bl,ftj,ftb,btj,btb=struct.unpack('<4sIIIIII',b[:28])
o=28; ft=json.loads(b[o:o+ftj] or b'{}'); o+=ftj+ftb; bt=json.loads(b[o:o+btj] or b'{}'); o+=btj+btb
print(magic,ver,bl,'ft',ft,'| bt keys',len(bt),list(bt.keys())[:80])
for k,v in list(bt.items())[:80]:
    if isinstance(v,list): print('  ',k,len(v),str(v[:3])[:160])
    else: print('  ',k,str(v)[:100])
glb=b[o:]; jl=struct.unpack('<I',glb[12:16])[0]; j=json.loads(glb[20:20+jl])
print('glb',len(glb),'extUsed',j.get('extensionsUsed'),'meshes',len(j.get('meshes',[])),'mats',len(j.get('materials',[])),'imgs',[(im.get('mimeType'),j['bufferViews'][im['bufferView']]['byteLength']) for im in j.get('images',[])][:8])
print('nodes',json.dumps(j.get('nodes'))[:300]); print('prim0',json.dumps(j['meshes'][0]['primitives'][0])[:300]); print('ext',json.dumps(j.get('extensions'))[:300])
vt=sum(j['accessors'][p['attributes']['POSITION']]['count'] for m in j['meshes'] for p in m['primitives']); print('verts',vt,'tris',sum(j['accessors'][p['indices']]['count'] for m in j['meshes'] for p in m['primitives'] if 'indices' in p)//3)
