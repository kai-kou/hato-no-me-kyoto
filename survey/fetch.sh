#!/bin/bash
# usage: fetch.sh <dataset id>
HERE=$(cd "$(dirname "$0")" && pwd); DL=${HATO_DL:-$HERE/../pipeline/dl}
ID=$1; D=$DL/$ID; mkdir -p $D/t
URL=$(python3 -I -c "
import json,sys
d=json.load(open(sys.argv[2]+'/catalog/datasets.json'))['datasets']
print([x['url'] for x in d if x['id']==sys.argv[1]][0])" $ID $DL)
BASE=${URL%/tileset.json}
curl -sS -m 120 -o $D/tileset.json "$URL"
python3 -I $HERE/leaves.py $D/tileset.json > $D/leaves.txt
N=$(wc -l < $D/leaves.txt)
cat $D/leaves.txt | xargs -P 16 -I{} sh -c 'f=$(echo {} | tr "/" "_"); [ -s '$D'/t/$f ] || curl -sS -m 600 --retry 2 -o '$D'/t/$f "'$BASE'/{}"'
echo "$ID leaves=$N files=$(ls $D/t | wc -l) size=$(du -sh $D/t | cut -f1)"
