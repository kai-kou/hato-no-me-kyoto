import json,struct,sys,collections,glob,os
def load(fn):
    b=open(fn,'rb').read()
    jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin0=b[20+jl+8:]
    return j,bin0
def bvw(j,bin0,i):
    v=j['bufferViews'][i]; o=v.get('byteOffset',0); return bin0[o:o+v['byteLength']]
def strings(j,bin0,prop,count):
    vals=bvw(j,bin0,prop['values']); so=bvw(j,bin0,prop['stringOffsets'])
    t=prop.get('stringOffsetType','UINT32'); fmt={'UINT32':'I','UINT16':'H','UINT8':'B','UINT64':'Q'}[t]; sz=struct.calcsize(fmt)
    offs=struct.unpack('<%d%s'%(count+1,fmt),so[:sz*(count+1)])
    return [vals[offs[k]:offs[k+1]].decode('utf8','replace') for k in range(count)]
D=sys.argv[1]; minlod=int(sys.argv[2]) if len(sys.argv)>2 else 3
tot=collections.Counter(); feats=[]; cls=None
for fn in sorted(glob.glob(D+'/t/*.glb')):
    try:
        j,bin0=load(fn)
        sm=j['extensions']['EXT_structural_metadata']; pt=sm['propertyTables'][0]; n=pt['count']; P=pt['properties']
        if cls is None:
            cls=sm['schema']['classes'][pt['class']]['properties']; 
        lods=struct.unpack('<%db'%n,bvw(j,bin0,P['_lod']['values'])[:n]); tot.update(lods)
        if max(lods)<minlod: continue
        xs=struct.unpack('<%dd'%n,bvw(j,bin0,P['_x']['values'])[:8*n]); ys=struct.unpack('<%dd'%n,bvw(j,bin0,P['_y']['values'])[:8*n])
        attrs=strings(j,bin0,P['attributes'],n)
        imgb=sum(j['bufferViews'][im['bufferView']]['byteLength'] for im in j.get('images',[]))
        for k in range(n):
            if lods[k]>=minlod:
                try: a=json.loads(attrs[k])
                except Exception: a={}
                feats.append((lods[k],xs[k],ys[k],a.get('gml:name'),a.get('bldg:usage'),a.get('bldg:measuredHeight'),os.path.basename(fn)[:15],round(imgb/1e6,1)))
    except Exception as e:
        print('ERR',fn,e)
print(D.split('/')[-1],'LOD totals',dict(tot),'| _x type',cls['_x'] if cls else None)
grid=collections.defaultdict(list)
for f in feats: grid[(round(f[1]/0.004),round(f[2]/0.004))].append(f)
for k,v in sorted(grid.items(), key=lambda kv:-len(kv[1]))[:14]:
    names=[f[3] for f in v if f[3]]
    print('cell lon %.3f lat %.3f n=%d'%(k[0]*0.004,k[1]*0.004,len(v)),'names:',names[:14])
json.dump(feats,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'feats_'+D.rstrip('/').split('/')[-1]+'.json'),'w'),ensure_ascii=False)
