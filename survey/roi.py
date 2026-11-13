import json,sys,math
t=json.load(open(sys.argv[1])); w,s,e,n=map(float,sys.argv[2].split(','))
out=[]
def walk(nd,d=0):
    bv=nd.get('boundingVolume',{}); c=nd.get('content')
    if 'region' in bv:
        r=[math.degrees(v) for v in bv['region'][:4]]
        if r[0]>e or r[2]<w or r[1]>n or r[3]<s: return
    if c: out.append((d,c.get('uri'),[round(math.degrees(v),5) for v in bv['region'][:4]],[round(v,1) for v in bv['region'][4:]],nd.get('geometricError'),len(nd.get('children',[]))))
    for ch in nd.get('children',[]): walk(ch,d+1)
walk(t['root'])
import collections
print(collections.Counter(o[0] for o in out))
for o in out:
    if len(sys.argv)<4 or str(o[0]) in sys.argv[3].split(','): print(*o)
