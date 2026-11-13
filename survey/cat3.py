import json,sys,collections
d=json.load(open(sys.argv[1]))['datasets']
g=collections.defaultdict(dict)
for x in d:
    if str(x.get('lod')) in ('3','4') and x.get('format')=='3D Tiles':
        key=(x['pref'],x['city'],x.get('ward') or '',x.get('ward_code') or x.get('city_code'))
        t=x['type_en']+str(x['lod'])+('' if x.get('texture') else 'n')
        nm=x['name']
        if x['type_en']=='veg': t+=('P' if '植被' in nm else 'S')
        g[key][t]=g[key].get(t,0)+round((x.get('file_size') or 0)/1e6,1)
for k,v in sorted(g.items(), key=lambda kv: str(kv[0][3])):
    print(k[3],k[0],k[1],k[2],'|',' '.join('%s=%s'%(a,b) for a,b in sorted(v.items())))
