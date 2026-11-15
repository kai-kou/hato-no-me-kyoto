# Speed and picture on a machine with a real GPU (written for a Google Colab T4 runtime, see tools/colab/gpu_check.ipynb).
# Opens the app from a local server in headless Chrome, once per view, hour and kind of people, and records what the
# app itself measures: frame time, internal resolution, quality tier, draw calls and triangles, plus the name of the
# renderer, so that a run that fell back to software rendering is not mistaken for a GPU run.
#
# usage: python3 tools/gpucheck.py [--out DIR] [--backend vulkan|egl|default|swiftshader] [--size 1920x1080]
#                                  [--modes eye,chase,over,tele,cine] [--hours 11,20] [--people code,asset]
#                                  [--settle 8] [--samples 8] [--quality auto|high|mid|low]
# Writes results.json, results.md and one PNG per case into DIR.
import argparse
import json
import os
import statistics
import subprocess
import sys
import time

from _paths import APP, TMP, CHROME
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.join(TMP, 'gpucheck'))
ap.add_argument('--backend', default='vulkan', choices=['vulkan', 'egl', 'default', 'swiftshader'])
ap.add_argument('--size', default='1920x1080')
ap.add_argument('--modes', default='eye,chase,over,tele,cine')
ap.add_argument('--hours', default='11,20')
ap.add_argument('--people', default='code,asset')
ap.add_argument('--settle', type=float, default=8, help='seconds to let the adaptive quality settle before sampling')
ap.add_argument('--samples', type=int, default=8, help='one-second frame time samples per case')
ap.add_argument('--quality', default='auto', choices=['auto', 'high', 'mid', 'low'])
ap.add_argument('--port', type=int, default=8793)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
W, H = (int(v) for v in a.size.split('x'))

# Chrome's own recipe for a GPU in headless mode on Linux (developer.chrome.com/blog/supercharge-web-ai-testing):
# ANGLE on Vulkan, without a window surface. EGL is the older route; "default" leaves the choice to Chrome.
FLAGS = {
    'vulkan': ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface', '--enable-gpu', '--ignore-gpu-blocklist'],
    'egl': ['--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'],
    'default': ['--enable-gpu', '--ignore-gpu-blocklist'],
    'swiftshader': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
}[a.backend] + ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']

GPU_JS = """(() => { const c = document.createElement('canvas'), gl = c.getContext('webgl2'); if (!gl) return { webgl2: false };
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return { webgl2: true, renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), floatRT: !!gl.getExtension('EXT_color_buffer_float'), ua: navigator.userAgent }; })()"""
STATE_JS = """(() => { const a = window.__app, S = a.S, i = a.renderer.info.render; return { ms: S.ms || 0, drs: a.drs, scale: a.Q.scale, tier: a.Q.tier, lite: !!S.lite, calls: i.calls, tris: i.triangles,
  mode: S.mode, frames: a.frames, peopleAsset: a.peopleAsset || 0, boot: a.boot && a.boot.shown ? Math.round(a.boot.shown) : null, w: a.renderer.domElement.width, h: a.renderer.domElement.height }; })()"""

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(a.port), '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
out = {'backend': a.backend, 'flags': FLAGS, 'size': a.size, 'quality': a.quality, 'cases': []}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, headless=True, args=FLAGS)
        ctx = b.new_context(viewport={'width': W, 'height': H})
        pg = ctx.new_page()
        pg.goto('about:blank')
        out['gpu'] = pg.evaluate(GPU_JS)
        r = (out['gpu'].get('renderer') or '').lower()
        out['software'] = any(k in r for k in ('swiftshader', 'llvmpipe', 'softpipe', 'software'))
        print('renderer:', out['gpu'].get('renderer'), '| software rendering:', out['software'], flush=True)
        pg.close()
        for people in a.people.split(','):
            for hour in a.hours.split(','):
                for mode in a.modes.split(','):
                    q = 'auto=1&t=%s&m=%s&seed=7' % (hour, mode) + ('&people=asset' if people == 'asset' else '') + ('' if a.quality == 'auto' else '&q=' + a.quality)
                    case = {'people': people, 'hour': hour, 'mode': mode, 'query': q, 'errors': []}
                    pg = ctx.new_page()
                    pg.on('console', lambda m, c=case: c['errors'].append(m.text[:300]) if m.type == 'error' else None)
                    pg.on('pageerror', lambda e, c=case: c['errors'].append('pageerror: ' + str(e)[:300]))
                    t0 = time.time()
                    try:
                        pg.goto('http://localhost:%d/index.html?%s' % (a.port, q))
                        pg.wait_for_function('window.__app && window.__app.ready && window.__app.frames > 2', timeout=300000)
                        case['load_s'] = round(time.time() - t0, 1)
                        pg.evaluate("document.body.classList.add('started')")
                        pg.wait_for_timeout(int(a.settle * 1000))
                        ms, st = [], None
                        for _ in range(a.samples):
                            pg.wait_for_timeout(1050)
                            st = pg.evaluate(STATE_JS)
                            if st['ms']:
                                ms.append(st['ms'])
                        case.update(st)
                        case['ms_samples'] = [round(v, 2) for v in ms]
                        case['ms_median'] = round(statistics.median(ms), 2) if ms else None
                        case['ms_max'] = round(max(ms), 2) if ms else None
                        case['res_pct'] = round(st['scale'] * st['drs'] * 100)
                        name = '%s_t%s_%s.png' % (people, hour, mode)
                        pg.screenshot(path=os.path.join(a.out, name), timeout=120000)
                        case['shot'] = name
                    except Exception as e:   # one case that fails must not lose the others
                        case['failed'] = str(e)[:300]
                    case['errors'] = case['errors'][:8]
                    out['cases'].append(case)
                    print('%-5s t=%-4s %-5s  %s' % (people, hour, mode, 'FAILED ' + case['failed'] if 'failed' in case else '%6.1f ms  res %3d%%  tier %-4s calls %5d  tris %8d%s' % (
                        case['ms_median'] or 0, case['res_pct'], case['tier'], case['calls'], case['tris'], '  errors: %d' % len(case['errors']) if case['errors'] else '')), flush=True)
                    pg.close()
        b.close()
finally:
    srv.terminate()

json.dump(out, open(os.path.join(a.out, 'results.json'), 'w'), ensure_ascii=False, indent=1)
MODE = {'eye': 'ハトの目', 'chase': '追う', 'over': '俯瞰', 'tele': '望遠', 'cine': 'シネマ'}
L = ['## 実 GPU での計測結果', '',
     '- レンダラー: `%s`' % out['gpu'].get('renderer'),
     '- 描画種別: **%s**' % ('ソフトウェア描画（GPU を使えていません。この結果は実 GPU の値ではありません）' if out['software'] else 'ハードウェア GPU'),
     '- 画面: %s／Chrome の起動方法: %s／画質の指定: %s' % (a.size, a.backend, '自動（端末に合わせて作品が選ぶ）' if a.quality == 'auto' else a.quality),
     '- ブラウザ: `%s`' % out['gpu'].get('ua'), '',
     '| 人 | 時刻 | 視点 | 1コマ（中央値） | 最大 | 換算 | 内部解像度 | 画質 | 軽量化 | 描画命令 | 三角形 | 起動 | エラー |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
for c in out['cases']:
    if 'failed' in c:
        L.append('| %s | %s | %s | 失敗: %s | | | | | | | | | |' % ('読み込みデータ' if c['people'] == 'asset' else 'コード生成', c['hour'], MODE.get(c['mode'], c['mode']), c['failed'][:80].replace('|', '/')))
        continue
    m = c['ms_median']
    L.append('| %s | %s | %s | %s ms | %s ms | %s fps | %d%% | %s | %s | %d | %s | %s 秒 | %d |' % (
        '読み込みデータ' if c['people'] == 'asset' else 'コード生成', c['hour'], MODE.get(c['mode'], c['mode']), m, c['ms_max'], round(1000 / m) if m else '-', c['res_pct'],
        {'high': '高', 'mid': '中', 'low': '軽'}.get(c['tier'], c['tier']), 'あり' if c['lite'] else 'なし', c['calls'], format(c['tris'], ','), c.get('load_s'), len(c['errors'])))
errs = sorted({e for c in out['cases'] for e in c['errors']})
if errs:
    L += ['', '### コンソールのエラー', ''] + ['- `%s`' % e.replace('`', "'") for e in errs[:12]]
L += ['', '1コマの時間は作品自身が 1 秒ごとに出す平均で、その %d 回ぶんの中央値です。ヘッドレスの Chrome は画面の更新周期に縛られないことがあるので、60 fps を超える値が出ることがあります。' % a.samples,
      'データセンター用の GPU（T4 など）での値で、スマートフォンの値ではありません。']
open(os.path.join(a.out, 'results.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('\nwrote', os.path.join(a.out, 'results.md'))
