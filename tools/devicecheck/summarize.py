# Turns the reports of one or more targets into a Markdown table.  usage: python3 tools/devicecheck/summarize.py DIR [DIR ...] > results.md
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cases import CASES
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
          '- ブラウザ: `%s`' % any_r.get('ua'), '- 浮動小数の描画先: %s／音の API: %s' % ('あり' if g.get('floatRT') or g.get('halfFloatRT') else 'なし', any_r.get('audio')), '',
          '| 条件 | 1コマ（中央値） | 最大 | 換算 | 内部解像度 | 描画の大きさ | 画質 | 軽量化 | 描画命令 | 三角形 | 起動 | エラー |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for label, q in CASES:
        r = rs.get(label); P = dict(kv.split('=') for kv in q.split('&'))
        name = '%s・%s%s' % (NAME.get(P['m'], P['m']), '夜' if P['t'] == '20' else '昼', '・読み込みデータの人' if P.get('people') else '')
        if r is None: L.append('| %s | 報告なし | | | | | | | | | | |' % name); continue
        if r.get('failed'): L.append('| %s | 失敗: %s %s | | | | | | | | | | %d |' % (name, r['failed'], (r.get('text') or '')[:60], len(r.get('errs') or []))); continue
        m = r.get('median')
        L.append('| %s | %s ms | %s ms | %s fps | %d%% | %s | %s | %s | %s | %s | %s 秒 | %d |' % (name, m, r.get('max'), round(1000 / m) if m else '-', round(r['scale'] * r['drs'] * 100), 'x'.join(str(v) for v in r['canvas']),
                 {'high': '高', 'mid': '中', 'low': '軽'}.get(r['tier'], r['tier']), 'あり' if r['lite'] else 'なし', r['calls'], format(r['tris'], ','), r['load'], len(r.get('errs') or [])))
    errs = sorted({e for k, r in rs.items() if not k.startswith('_') for e in (r.get('errs') or [])})
    if errs: L += ['', 'エラー:'] + ['- `%s`' % e.replace('`', "'") for e in errs[:10]]
    L.append('')
print('\n'.join(L))
