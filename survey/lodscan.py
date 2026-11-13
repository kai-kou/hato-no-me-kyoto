import json,struct,sys,collections,glob,os
def load(fn):
    b=open(fn,'rb').read()
    jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin0=b[20+jl+8:]
    return j,bin0
def bv(j,bin0,i):
    v=j['bufferViews'][i]; o=v.get('byteOffset',0); return bin0[o:o+v['byteLength']]
def strings(j,bin0,prop,count):
    vals=bv(j,bin0,prop['values']); so=bv(j,bin0,prop['stringOffsets'])
    t=prop.get('stringOffsetType','UINT32'); fmt={'UINT32':'I','UINT16':'H','UINT8':'B','UINT64':'Q'}[t]; sz=struct.calcsize(fmt)
    offs=struct.unpack('<%d%s'%(count+1,fmt),so[:sz*(count+1)])
    return [vals[offs[k]:offs[k+1]].decode('utf8','replace') for k in range(count)]
tot=collections.Counter()
for fn in sorted(glob.glob(sys.argv[1])):
    j,bin0=load(fn)
    sm=j['extensions']['EXT_structural_metadata']; pt=sm['propertyTables'][0]; n=pt['count']; P=pt['properties']
    lods=struct.unpack('<%db'%n,bv(j,bin0,P['_lod']['values'])[:n])
    c=collections.Counter(lods); tot.update(c)
    tris=sum(j['accessors'][p['indices']]['count'] for m in j['meshes'] for p in m['primitives'])//3
    imgb=sum(j['bufferViews'][im['bufferView']]['byteLength'] for im in j.get('images',[]))
    print(os.path.basename(fn)[:15],'feat',n,'lod',dict(c),'tris',tris,'img',round(imgb/1e6,2),'MB')
    if len(sys.argv)>2:
        attrs=strings(j,bin0,P['attributes'],n); ids=strings(j,bin0,P['gml_id'],n)
        for k in range(n):
            if lods[k]>=int(sys.argv[2]):
                try: a=json.loads(attrs[k])
                except Exception as e: a={}
                nm=a.get('gml:name') or a.get('name'); print('    L%d'%lods[k],ids[k][:44],nm,a.get('bldg:measuredHeight'),a.get('bldg:usage'),list(a.keys())[:0])
print('TOTAL',dict(tot))
if len(sys.argv)>3:
    j,bin0=load(sorted(glob.glob(sys.argv[1]))[0]); sm=j['extensions']['EXT_structural_metadata']; pt=sm['propertyTables'][0]
    print(list(pt['properties'].keys())); a=strings(j,bin0,pt['properties']['attributes'],pt['count'])[0]; print(a[:1500])
