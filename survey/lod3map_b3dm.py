import json,struct,sys,collections,glob,os
D=sys.argv[1]; minlod=int(sys.argv[2]) if len(sys.argv)>2 else 3
tot=collections.Counter(); feats=[]
for fn in sorted(glob.glob(D+'/t/*.b3dm')):
    try:
        b=open(fn,'rb').read()
        magic,ver,bl,ftj,ftb,btj,btb=struct.unpack('<4sIIIIII',b[:28])
        o=28; ft=json.loads(b[o:o+ftj] or b'{}'); n=ft.get('BATCH_LENGTH',0); o+=ftj+ftb
        if n==0: continue
        bt=json.loads(b[o:o+btj] or b'{}'); btbin=b[o+btj:o+btj+btb]
        def col(k,fmt):
            v=bt.get(k)
            if isinstance(v,dict): sz=struct.calcsize(fmt); return struct.unpack('<%d%s'%(n,fmt),btbin[v['byteOffset']:v['byteOffset']+sz*n])
            return v
        lods=col('_lod','b'); tot.update(lods)
        if max(lods)<minlod: continue
        xs=col('_x','d'); ys=col('_y','d'); nm=bt.get('gml:name') or [None]*n; us=bt.get('bldg:usage') or [None]*n; hs=bt.get('bldg:measuredHeight') or [None]*n
        if isinstance(hs,dict): hs=col('bldg:measuredHeight','d')
        for k in range(n):
            if lods[k]>=minlod: feats.append((lods[k],xs[k],ys[k],nm[k],us[k],hs[k],os.path.basename(fn),round(len(b)/1e6,1)))
    except Exception as e:
        print('ERR',fn,repr(e)[:200])
print(D.split('/')[-1],'LOD totals',dict(tot))
grid=collections.defaultdict(list)
for f in feats: grid[(round(f[1]/0.004),round(f[2]/0.004))].append(f)
for k,v in sorted(grid.items(), key=lambda kv:-len(kv[1]))[:16]:
    names=[f[3] for f in v if f[3]]
    print('cell lon %.3f lat %.3f n=%d'%(k[0]*0.004,k[1]*0.004,len(v)),'names:',names[:16])
json.dump(feats,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'feats_'+D.rstrip('/').split('/')[-1]+'.json'),'w'),ensure_ascii=False)
