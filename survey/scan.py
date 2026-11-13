import json,struct,sys,collections,glob,os
def strings(j,bin0,prop,count):
    def bvw(i):
        v=j['bufferViews'][i]; o=v.get('byteOffset',0); return bin0[o:o+v['byteLength']]
    vals=bvw(prop['values']); so=bvw(prop['stringOffsets'])
    t=prop.get('stringOffsetType','UINT32'); fmt={'UINT32':'I','UINT16':'H','UINT8':'B','UINT64':'Q'}[t]; sz=struct.calcsize(fmt)
    offs=struct.unpack('<%d%s'%(count+1,fmt),so[:sz*(count+1)])
    return [vals[offs[k]:offs[k+1]].decode('utf8','replace') for k in range(count)]
def feats_glb(fn):
    b=open(fn,'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin0=b[20+jl+8:]
    sm=j['extensions']['EXT_structural_metadata']; pt=sm['propertyTables'][0]; n=pt['count']; P=pt['properties']
    def bvw(i):
        v=j['bufferViews'][i]; o=v.get('byteOffset',0); return bin0[o:o+v['byteLength']]
    lods=struct.unpack('<%db'%n,bvw(P['_lod']['values'])[:n])
    xs=struct.unpack('<%dd'%n,bvw(P['_x']['values'])[:8*n]); ys=struct.unpack('<%dd'%n,bvw(P['_y']['values'])[:8*n])
    names=[None]*n
    if max(lods)>=3:
        at=strings(j,bin0,P['attributes'],n)
        for k in range(n):
            if lods[k]>=3:
                try: names[k]=json.loads(at[k]).get('gml:name')
                except Exception: pass
    return lods,xs,ys,names
def feats_b3dm(fn):
    b=open(fn,'rb').read(); magic,ver,bl,ftj,ftb,btj,btb=struct.unpack('<4sIIIIII',b[:28])
    o=28; ft=json.loads(b[o:o+ftj] or b'{}'); n=ft.get('BATCH_LENGTH',0); o+=ftj+ftb
    if n==0: return [],[],[],[]
    bt=json.loads(b[o:o+btj] or b'{}'); btbin=b[o+btj:o+btj+btb]
    def col(k,fmt):
        v=bt.get(k)
        if isinstance(v,dict): sz=struct.calcsize(fmt); return struct.unpack('<%d%s'%(n,fmt),btbin[v['byteOffset']:v['byteOffset']+sz*n])
        return v
    return col('_lod','b'),col('_x','d'),col('_y','d'),(bt.get('gml:name') or [None]*n)
for D in sys.argv[1:]:
    tot=collections.Counter(); F=[]
    for fn in glob.glob(D+'/t/*'):
        try:
            lods,xs,ys,names=(feats_glb if fn.endswith('.glb') else feats_b3dm)(fn)
            tot.update(lods)
            for k in range(len(lods)):
                if lods[k]>=3: F.append((lods[k],xs[k],ys[k],names[k]))
        except Exception as e: print('ERR',os.path.basename(fn),repr(e)[:120])
    print('#',D.split('/')[-1],'LOD totals',dict(sorted(tot.items())))
    # densest 500m neighbourhoods: grid 0.005deg (~450x555m)
    best=[]
    g=collections.defaultdict(list)
    for f in F: g[(int(f[1]/0.0025),int(f[2]/0.0025))].append(f)
    seen=set()
    for (cx,cy) in g:
        n=sum(len(g.get((cx+dx,cy+dy),[])) for dx in (0,1) for dy in (0,1))
        best.append((n,cx,cy))
    for n,cx,cy in sorted(best,reverse=True)[:4]:
        nm=[f[3] for dx in (0,1) for dy in (0,1) for f in g.get((cx+dx,cy+dy),[]) if f[3]]
        print('   n=%d in ~450x550m at lon %.4f..%.4f lat %.4f..%.4f'%(n,cx*0.0025,(cx+2)*0.0025,cy*0.0025,(cy+2)*0.0025),'names:',list(dict.fromkeys(nm))[:18])
