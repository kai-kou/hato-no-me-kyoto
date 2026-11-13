import json,sys,math
t=json.load(open(sys.argv[1]))
print('asset',t.get('asset'),'geomErr',t.get('geometricError'))
leaves=[]
def walk(n,depth=0,tf=None):
    bv=n.get('boundingVolume',{})
    c=n.get('content')
    if c:
        leaves.append((depth,bv,c.get('uri') or c.get('url'),n.get('geometricError'),n.get('transform')))
    for ch in n.get('children',[]): walk(ch,depth+1)
walk(t['root'])
print('root bv',t['root'].get('boundingVolume'),'refine',t['root'].get('refine'),'transform',t['root'].get('transform'))
print('tiles with content',len(leaves))
import collections
print('depths',collections.Counter(l[0] for l in leaves))
for l in leaves[:int(sys.argv[2]) if len(sys.argv)>2 else 12]:
    bv=l[1]
    if 'region' in bv:
        r=bv['region']; print(l[0],[round(math.degrees(v),5) for v in r[:4]],[round(v,1) for v in r[4:]],l[2],'ge',l[3])
    else: print(l[0],bv,l[2],l[3])
