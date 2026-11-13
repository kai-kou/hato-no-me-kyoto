import json,sys
d=json.load(open(sys.argv[1]))['datasets']
codes=sys.argv[2].split(',')
for x in d:
    if (x.get('ward_code') in codes) or (x.get('city_code') in codes):
        if x['type_en'] in ('fld','htd','tnm','ifld','lsld','urf','area','rfld'): continue
        print(x['type_en'],'|',x['name'],'| lod',x.get('lod'),'tex',x.get('texture'),x['year'],x.get('format'),x.get('format_version'),round((x.get('file_size') or 0)/1e6,1),'MB |',x['id'],'|',x['url'][-110:])
