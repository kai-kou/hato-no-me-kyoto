#!/bin/bash
# Syntax-check the ES modules. `node --check` does not parse a .js file as a module, so each file is checked as a .mjs copy.
# usage: tools/jscheck.sh [app directory]
d=${1:-$(cd "$(dirname "$0")/.." && pwd)/app}; t=$(mktemp -d); ok=1
for f in "$d"/js/*.js; do case "$f" in *three.module*) continue;; esac
  cp "$f" "$t/chk.mjs"; node --check "$t/chk.mjs" >"$t/out" 2>&1 || { echo "SYNTAX $f"; head -6 "$t/out"; ok=0; }
done
rm -rf "$t"; [ $ok = 1 ] && echo "all modules parse"
