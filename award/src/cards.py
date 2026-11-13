#!/usr/bin/env python3
"""Render the full-screen cards of the submission video (1280x720 PNG) from HTML with headless Chrome."""
import os, sys
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = HERE + '/cards/'
URL = 'https://claude.ai/artifact/L6dDhAnGZur167TMmp6hdM'; REPO = 'https://github.com/kai-kou/hato-no-me-kyoto'
CSS = '''
:root { --ink: #100e0c; --ink2: #1a1a19; --paper: #f3ede2; --dim: rgba(243,237,226,.7); --faint: rgba(243,237,226,.16); --shu: #e2532f; --disp: "Noto Serif CJK JP", serif; --body: "Noto Sans CJK JP", sans-serif; }
* { box-sizing: border-box; } html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: var(--ink); color: var(--paper); font-family: var(--body); }
.c { position: absolute; inset: 0; padding: 70px 84px; display: flex; flex-direction: column; justify-content: center; }
h1 { font-family: var(--disp); font-weight: 900; font-size: 112px; letter-spacing: .08em; margin: 0; line-height: 1.15; }
h2 { font-family: var(--disp); font-weight: 700; font-size: 50px; letter-spacing: .06em; margin: 0 0 30px; line-height: 1.4; }
p { margin: 0; } .lead { font-family: var(--disp); font-size: 31px; line-height: 1.8; letter-spacing: .07em; margin-top: 22px; }
.tag { display: inline-block; font-size: 20px; letter-spacing: .1em; padding: 5px 16px 6px; border-radius: 999px; background: var(--shu); color: #fff; font-weight: 700; margin-right: 10px; }
.tag.o { background: none; border: 1px solid rgba(243,237,226,.6); font-weight: 500; }
.small { font-size: 17px; line-height: 1.8; color: var(--dim); }
ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 20px; } li { position: relative; padding-left: 28px; font-size: 31px; line-height: 1.6; } li::before { content: ""; position: absolute; left: 0; top: .78em; width: 14px; height: 3px; background: var(--shu); }
.num { font-family: var(--disp); font-weight: 700; font-variant-numeric: tabular-nums; }
.bars { display: grid; gap: 22px; } .bars .r { display: grid; grid-template-columns: 330px 1fr; gap: 20px; align-items: center; font-size: 25px; }
.bars .b { height: 30px; border-radius: 0 4px 4px 0; background: #3987e5; } .bars .v { font-size: 30px; font-weight: 700; margin-left: 14px; white-space: nowrap; } .bars .v small { font-size: 18px; font-weight: 400; color: var(--dim); margin-left: 6px; }
.pipe { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-top: 10px; } .pipe div { background: var(--ink2); border: 1px solid var(--faint); border-radius: 6px; padding: 16px 12px; font-size: 19px; line-height: 1.5; text-align: center; } .pipe i { display: block; font-style: normal; font-family: var(--disp); color: var(--shu); font-size: 26px; }
.io { display: flex; align-items: baseline; gap: 34px; margin-bottom: 26px; } .io .num { font-size: 84px; line-height: 1; } .io .num small { font-size: 34px; font-family: var(--body); font-weight: 500; margin-left: 6px; } .io .ar { font-family: var(--disp); font-size: 60px; color: var(--shu); }
.url { font-size: 27px; letter-spacing: .02em; }
'''
CARDS = {
 'title': '''<div class="c"><div><span class="tag">PLATEAU AWARD 2026</span><span class="tag o">一般部門　アイデア・アプリ提案</span></div><h1 style="margin-top:44px">鳩の目、京都。</h1><p class="lead">PLATEAU の LOD3 で再構成した先斗町・鴨川・祇園白川を、<br>ドバトの目で歩いて飛ぶブラウザ作品</p><p class="small" style="margin-top:56px">この動画は、作品の画面を録画したものです。音声は入っていません。</p></div>''',
 'density': '''<div class="c"><h2 style="font-size:45px">舞台は、壁の写真の細かさを実測して選んだ。</h2><div class="bars">
<div class="r"><span><b>京都市 先斗町・祇園白川</b></span><span style="display:flex;align-items:center"><span class="b" style="width:600px"></span><span class="v">85.8<small>px/m</small></span></span></div>
<div class="r"><span>沼津市 沼津駅から沼津港</span><span style="display:flex;align-items:center"><span class="b" style="width:181px"></span><span class="v">25.9<small>px/m</small></span></span></div>
<div class="r"><span>東京都港区 虎ノ門・新橋</span><span style="display:flex;align-items:center"><span class="b" style="width:35px"></span><span class="v">5.0<small>px/m</small></span></span></div></div>
<p class="small" style="margin-top:34px;font-size:21px">LOD3 建築物の壁のテクスチャ密度（中央値）。LOD3 の 3D Tiles を持つ 24 市区を洗い出し、22 市区ぶん約 11 GB を取得して測った。<br>ハトの目線では壁まで 1〜2 m。形状の LOD より、写真の細かさが見た目を決める。</p></div>''',
 'pipeline': '''<div class="c"><h2>約 1 GB の 3D Tiles を、54 MB に。</h2><div class="io"><p class="num">約 1<small>GB</small></p><p class="ar">→</p><p class="num">約 54<small>MB</small></p><p class="small" style="font-size:22px">226 ファイル。起動時に読むのは約 21 MB<br>依存ライブラリは three.js r170 だけ</p></div>
<div class="pipe"><div><i>1</i>抽出</div><div><i>2</i>地形と写真</div><div><i>3</i>高さラスタ</div><div><i>4</i>テクスチャ</div><div><i>5</i>地面モデル</div><div><i>6</i>書き出し</div></div>
<p class="small" style="margin-top:30px;font-size:21px">局所座標への変換、101 枚のアトラスへの詰め直し、16 bit への量子化。楕円体高と標高の差 37.36 m も補正した。</p></div>''',
 'verify': '''<div class="c"><h2>実装と検証は、AI が行った。</h2><ul>
<li>Chromium、WebKit、Firefox の 3 エンジンで、全視点と操作を自動で確認</li>
<li>スマートフォンの画面は、縦 390×844 と横向きをエミュレートして確認</li>
<li>実機での速度、耳で聴いた音の印象、GPU ごとの差は確かめられていない</li></ul>
<p class="small" style="margin-top:36px;font-size:21px">確認はソフトウェア描画で行った。作品の「i」ボタンに、その端末での動作状況が出る。</p></div>''',
 'end': '''<div class="c" style="justify-content:flex-start;padding-top:64px"><h1 style="font-size:76px">鳩の目、京都。</h1>
<p class="url" style="margin-top:34px">''' + URL + '''</p><p class="small" style="font-size:19px">作品。紹介ページの画面を押すと始まります</p>
<p class="url" style="margin-top:20px">''' + REPO + '''</p><p class="small" style="font-size:19px">ソースコード、変換パイプライン、制作の記録</p>
<p class="small" style="margin-top:36px;font-size:18.5px;color:rgba(243,237,226,.86)">出典：本作品は、国土交通省 Project PLATEAU の 3D 都市モデル（京都市、2025 年度）と、国土地理院の地理院タイル（標高タイル、シームレス空中写真）を加工して作成したものです。国土交通省、国土地理院、京都市が内容を保証するものではありません。</p>
<p class="small" style="margin-top:12px;font-size:17px">遠景の地表の色は地理院タイル（シームレス空中写真、ズームレベル 12）を加工して作成。データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）。描画は three.js r170（MIT License）。<br>指示は応募者、実装と検証は AI（Claude Fable 5.2）。コードは MIT License、文章・画像・動画は CC BY 4.0。</p></div>''',
}
def main(only=None):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get('HATO_CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        for k, body in CARDS.items():
            if only and k not in only: continue
            pg.set_content('<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>%s</style></head><body>%s</body></html>' % (CSS, body)); pg.wait_for_timeout(250)
            over = pg.evaluate("(()=>{let m=0;document.querySelectorAll('.c *').forEach(e=>{const r=e.getBoundingClientRect();if(r.bottom>m)m=r.bottom});return Math.round(m)})()")
            pg.screenshot(path=OUT + k + '.png'); print(k, 'content bottom', over)
        b.close()
if __name__ == '__main__': main(sys.argv[1:])
