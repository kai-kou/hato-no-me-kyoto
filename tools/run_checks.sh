#!/bin/bash
# Run the release checks against the app: module syntax, a full interaction flow on three browser engines,
# missing files, the sandboxed-iframe / CSP conditions of the hosting page, and the landing page that opens first.
# usage: tools/run_checks.sh [app directory]
# needs: node, python3 with playwright (chromium, webkit, firefox), xvfb-run for the Firefox run
HERE=$(cd "$(dirname "$0")" && pwd)
export HATO_DIR=${1:-$HERE/../app}
OUT=${HATO_TMP:-${TMPDIR:-/tmp}/hato}; mkdir -p "$OUT"

echo "== module syntax"; "$HERE/jscheck.sh" "$HATO_DIR"
echo "== chromium flow (high)"; python3 "$HERE/xengine.py" chromium "t=15.5" "$OUT/f_cr_flow.png" 1280x720 "$HERE/choreo/flow.js" 2>&1 | grep -v "GPU stall"
echo "== missing files"; python3 "$HERE/net404.py" "auto=1&t=15.5" 2>&1 | tail -2
echo "== csp chromium (from the landing page)"; python3 "$HERE/csptest.py" chromium 800x480 2>&1 | grep -v "GPU stall" | tail -8
echo "== csp webkit (from the landing page)"; python3 "$HERE/csptest.py" webkit 800x480 2>&1 | tail -8
echo "== landing page -> simulation, chromium"; python3 "$HERE/lptest.py" chromium flow "$OUT/lp" 2>&1 | grep -v '^  File\|^    \|\^' | tail -6
echo "== landing page -> simulation, webkit"; python3 "$HERE/lptest.py" webkit flow "$OUT/lp" 2>&1 | grep -v '^  File\|^    \|\^' | tail -6
echo "== landing page -> simulation, firefox"; LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x800x24" python3 "$HERE/lptest.py" firefox flow "$OUT/lp" 2>&1 | grep -v '^  File\|^    \|\^' | tail -6
echo "== landing page layout"; python3 "$HERE/lptest.py" chromium shots "$OUT/lp" 2>&1 | grep -v '^  File\|^    \|\^' | tail -6
echo "== webkit flow (mid, phone portrait)"; python3 "$HERE/xengine.py" webkit "t=15.5&q=mid" "$OUT/f_wk_flow.png" 390x844 "$HERE/choreo/flow.js" 2>&1 | tail -6
echo "== firefox flow (low)"; LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x800x24" python3 "$HERE/xengine_ff.py" firefox "t=15.5&q=low" "$OUT/f_ff_flow.png" 800x480 "$HERE/choreo/flow.js" 2>&1 | tail -6
echo "== context loss"; python3 "$HERE/losttest.py" 2>&1 | tail -8
echo finished
