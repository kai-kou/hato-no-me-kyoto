import json,sys,collections
d=json.load(open(sys.argv[1]))['datasets']
print(len(d))
c=collections.Counter((x['type_en'],str(x.get('lod')),str(x.get('texture'))) for x in d)
for k,v in sorted(c.items()): 
    if k[1] not in ('1','2','None','0') or k[0] in('bldg',): print(k,v)
print('---- LOD3+ bldg')
for x in d:
    if x['type_en']=='bldg' and str(x.get('lod')) not in ('1','2','None','0'):
        print(x['pref'],x['city'],x.get('ward'),'lod',x.get('lod'),'tex',x.get('texture'),x['year'],x['registration_year'],'v',x.get('format_version'),round((x.get('file_size') or 0)/1e6,1),'MB',x['id'])
