import json,sys,math
t=json.load(open(sys.argv[1]))
def walk(nd):
    c=nd.get('content'); ch=nd.get('children',[])
    if c and not ch: print(c.get('uri'))
    for x in ch: walk(x)
walk(t['root'])
