# Turns the reports of one or more targets into a Markdown table.  usage: python3 tools/devicecheck/summarize.py DIR [DIR ...] > results.md
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cases import CASES, DIAG
NAME = {'eye': 'ハトの目', 'chase': '追う', 'over': '俯瞰', 'tele': '望遠', 'cine': 'シネマ'}
TARGET = {'mac-chrome': 'macOS の Chrome', 'mac-webkit': 'macOS の WebKit（Safari のエンジン）', 'ios-sim': 'iOS シミュレーターの Safari', 'local': '開発環境'}
R = {}
for d in sys.argv[1:]:
    f = os.path.join(d, 'reports.jsonl')
    if not os.path.exists(f): continue
    for line in open(f, encoding='utf-8'):
        o = json.loads(line); t, _, label = o['id'].partition('--'); R.setdefault(t, {})[label] = o
    s = os.path.join(d, 'simulator.json')
    if os.path.exists(s): R.setdefault('ios-sim', {})['_sim'] = json.load(open(s))
L = []
for t, rs in R.items():
    any_r = next((r for k, r in rs.items() if not k.startswith('_')), {}); g = any_r.get('gpu') or {}; rend = str(g.get('renderer')); soft = any(k in rend.lower() for k in ('swiftshader', 'llvmpipe', 'softpipe', 'software'))
    L += ['### %s' % TARGET.get(t, t), '']
    if '_sim' in rs: L.append('- 機種: %s（%s）。**シミュレーターであり実機ではありません。** 描画はホストの Mac の GPU が行います' % (rs['_sim']['device'], rs['_sim']['runtime']))
    L += ['- レンダラー: `%s`%s' % (rend, '（**ソフトウェア描画**）' if soft else ''), '- 画面: %s（倍率 %s）／タッチ点: %s' % ('x'.join(str(v) for v in (any_r.get('inner') or [])), (any_r.get('screen') or [0, 0, '?'])[2], any_r.get('touch')),
          '- ブラウザ: `%s`' % any_r.get('ua'), '- 浮動小数の描画先: %s／音の API: %s／深度の比較サンプラー: %s' % ('あり' if g.get('floatRT') or g.get('halfFloatRT') else 'なし', any_r.get('audio'), json.dumps(g.get('shadowSampler'), ensure_ascii=False)), '',
          '| 条件 | 1コマ（中央値） | 最大 | 換算 | 内部解像度 | 描画の大きさ | 画質 | 軽量化 | 描画命令 | 三角形 | 起動 | エラー |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for label, q in CASES + [c for c in DIAG if c[0] in rs]:
        r = rs.get(label); P = dict(kv.split('=') for kv in q.split('&'))
        name = '%s・%s%s' % (NAME.get(P['m'], P['m']), '夜' if P['t'] == '20' else '昼', '・読み込みデータの人' if P.get('people') else '') + ('・ハトの影なし' if P.get('nobsh') else '') + ('・画質' + {'high': '高', 'low': '軽'}[P['q']] + '指定' if P.get('q') else '')
        if r is None: L.append('| %s | 報告なし | | | | | | | | | | |' % name); continue
        if r.get('failed'): L.append('| %s | 失敗: %s %s | | | | | | | | | | %d |' % (name, r['failed'], (r.get('text') or '')[:60], len(r.get('errs') or []))); continue
        m = r.get('median')
        L.append('| %s | %s ms | %s ms | %s fps | %d%% | %s | %s | %s | %s | %s | %s 秒 | %d |' % (name, m, r.get('max'), round(1000 / m) if m else '-', round(r['scale'] * r['drs'] * 100), 'x'.join(str(v) for v in r['canvas']),
                 {'high': '高', 'mid': '中', 'low': '軽'}.get(r['tier'], r['tier']), 'あり' if r['lite'] else 'なし', r['calls'], format(r['tris'], ','), r['load'], len(r.get('errs') or [])))
    lost = []
    for label, q in CASES + DIAG:
        r = rs.get(label) or {}; tr = [x for x in (r.get('track') or []) if 'ndc' in x]
        if not tr or r.get('mode') in ('eye', 'cine'): continue
        out = [x for x in tr if abs(x['ndc'][0]) > 1 or abs(x['ndc'][1]) > 1 or x['depth'] <= 0]
        if out: lost.append('%s: %d/%d 回、注視中のハトが画面の外（例 画面座標 %s、距離 %s m、飛行中=%s、視点の選び直し %d 回）' % (label, len(out), len(tr), out[-1]['ndc'], out[-1]['depth'], out[-1]['air'], out[-1]['turn']))
    L += ['', '注視中のハトの位置: ' + ('すべての計測時点で画面内' if not lost else '**画面の外に出た時点あり**')] + ['- ' + x for x in lost]
    errs = sorted({e for k, r in rs.items() if not k.startswith('_') for e in (r.get('errs') or [])})
    if errs: L += ['', 'エラー:'] + ['- `%s`' % e.replace('`', "'") for e in errs[:10]]
    L.append('')
print('\n'.join(L))
