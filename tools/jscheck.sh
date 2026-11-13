#!/bin/bash
# Syntax-check the ES modules. `node --check` does not parse a .js file as a module, so each file is checked as a .mjs copy.
# usage: tools/jscheck.sh [app directory]
d=${1:-$(cd "$(dirname "$0")/.." && pwd)/app}; t=$(mktemp -d); ok=1
for f in "$d"/js/*.js; do case "$f" in *three.module*) continue;; esac
  cp "$f" "$t/chk.mjs"; node --check "$t/chk.mjs" >"$t/out" 2>&1 || { echo "SYNTAX $f"; head -6 "$t/out"; ok=0; }
done
# The shaders are built by replacing strings inside three.js's own shader source. A key that an update of three.js renamed
# would simply stop matching and only the picture would change, so every key is looked up in the library here.
T="$d/js/three.module.min.js"
grep -o "'#include <[a-z_0-9]*>'" "$d/js/util.js" | tr -d "'" | sort -u > "$t/keys"
echo 'getDirectionalLightInfo( directionalLight, directLight );' >> "$t/keys"
[ -s "$t/keys" ] || { echo "HOOKS no keys found in util.js"; ok=0; }
while IFS= read -r k; do grep -qF -- "$k" "$T" || { echo "HOOK MISSING in three.module.min.js: $k"; ok=0; }; done < "$t/keys"
n=$(wc -l < "$t/keys")
rm -rf "$t"; [ $ok = 1 ] && echo "all modules parse, $n shader hook keys found in three.js"
