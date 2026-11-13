#!/usr/bin/env python3
"""Build the presentation deck: slides.html -> slides.pdf (16:9, one page per slide).
usage: python3 -I build.py            (writes slides.html; print with print.py)"""
import os, html
HERE = os.path.dirname(os.path.abspath(__file__))
IMG = HERE + '/img/'
URL = 'https://claude.ai/artifact/L6dDhAnGZur167TMmp6hdM'
REPO = 'https://github.com/kai-kou/hato-no-me-kyoto'
CRIT = [('A', '3D都市モデルの活用'), ('I', 'アイデア'), ('U', 'UI・UX・デザイン'), ('T', '技術力'), ('P', '実用性')]
NAME = os.environ.get('HATO_AWARD_NAME', '').strip()   # the applicant's public name for the last page; left out of the copy kept in the repository
NAME_HTML = '<p class="note" style="margin-top:10px">応募者　%s</p>' % html.escape(NAME) if NAME else ''
CREDIT = '画面は、国土交通省 Project PLATEAU の 3D 都市モデル（京都市、2025 年度）と国土地理院の地理院タイルを加工して作成'
slides = []

def slide(on, title, body, sub=None, credit=True, cls=''):
    crit = ''.join('<span%s>%s</span>' % (' class="on"' if k in on else '', n) for k, n in CRIT)
    slides.append(dict(crit=crit, title=title, body=body, sub=sub, credit=credit, cls=cls))

def fig(name, cap, alt=''):
    return '<figure><img src="img/%s" alt="%s"><figcaption>%s</figcaption></figure>' % (name, html.escape(alt or cap), cap)

# ---------------------------------------------------------------- charts
def chart_density():
    rows = [('京都市 先斗町・祇園白川', 85.8), ('沼津市 沼津駅から沼津港', 25.9), ('東京都港区 虎ノ門・新橋', 5.0)]
    W, x0, bw, rh = 540, 0, 430, 56
    o = ['<svg viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="壁のテクスチャ密度の中央値の比較">' % (W, rh * 3 + 6, W, rh * 3 + 6)]
    for i, (n, v) in enumerate(rows):
        y = i * rh; w = max(4, bw * v / 85.8)
        o.append('<text x="0" y="%d" font-size="16" %s>%s</text>' % (y + 17, 'font-weight="700"' if i == 0 else 'fill-opacity="0.82"', n))
        o.append('<path d="M0,%d h%.1f a4,4 0 0 1 4,4 v%d a4,4 0 0 1 -4,4 h-%.1f z" fill="#3987e5"/>' % (y + 27, w - 4, 14, w - 4))
        o.append('<text x="%.1f" y="%d" font-size="19" font-weight="700" style="font-variant-numeric:tabular-nums">%.1f<tspan font-size="13" font-weight="400" dx="4" fill-opacity="0.7">px/m</tspan></text>' % (w + 10, y + 45, v))
    o.append('</svg>'); return ''.join(o)

def chart_behaviour():
    cats = [('採餌', '#3987e5'), ('休息', '#d95926'), ('飛行', '#199e70'), ('求愛', '#c98500'), ('水飲み・水浴び', '#d55181'), ('ねぐら', '#008300')]
    data = [('7:30', [88.1, 4.2, 5.4, 1.9, 0.4, 0]), ('12:00', [51.2, 41.3, 6.0, 1.2, 0.3, 0]), ('15:30', [88.2, 4.6, 5.1, 1.9, 0.3, 0]), ('22:00', [0, 0, 0, 0, 0, 100])]   # tools/daysim.py on v27, mean of 3 runs
    W, lx, bw, bh, gap = 560, 62, 498, 36, 16
    H = len(data) * (bh + gap) + 56
    o = ['<svg viewBox="0 0 %d %d" width="%d" height="%d" role="img" aria-label="時刻ごとの行動の割合">' % (W, H, W, H)]
    for r, (t, vals) in enumerate(data):
        y = r * (bh + gap); x = lx
        o.append('<text x="%d" y="%d" font-size="16" text-anchor="end" style="font-variant-numeric:tabular-nums">%s</text>' % (lx - 12, y + bh / 2 + 6, t))
        for (n, c), v in zip(cats, vals):
            if v <= 0: continue
            w = bw * v / 100.0
            o.append('<rect x="%.1f" y="%d" width="%.1f" height="%d" rx="2" fill="%s"/>' % (x + 1, y, max(0.8, w - 2), bh, c))
            if v >= 8: o.append('<text x="%.1f" y="%d" font-size="14.5" font-weight="700" fill="#fff" style="font-variant-numeric:tabular-nums">%s %.1f%%</text>' % (x + 9, y + bh / 2 + 5, n, v))
            x += w
    ly = len(data) * (bh + gap) + 6; x = lx
    for n, c in cats:
        o.append('<rect x="%d" y="%d" width="12" height="12" rx="2" fill="%s"/><text x="%d" y="%d" font-size="13.5" fill-opacity="0.85">%s</text>' % (x, ly, c, x + 17, ly + 11, n))
        x += 30 + 14 * len(n)
    o.append('<text x="%d" y="%d" font-size="12.5" fill-opacity="0.62">90 羽、人とトビなし。各時刻 30 分ぶんを 3 回走らせた平均</text>' % (lx, ly + 36))
    o.append('</svg>'); return ''.join(o)

FOV = '''<svg viewBox="0 0 380 300" width="330" height="260" role="img" aria-label="ハトを真上から見た視野の図">
<path d="M190,150 L227.62,253.37 A110,110 0 0 1 152.38,253.37 Z" fill="rgba(0,0,0,0.45)" stroke="rgba(243,237,226,0.4)" stroke-dasharray="3 4"/>
<path d="M190,150 L152.38,253.37 A110,110 0 0 1 215.68,43.04 Z" fill="rgba(47,156,122,0.45)"/>
<path d="M190,150 L164.32,43.04 A110,110 0 0 1 227.62,253.37 Z" fill="rgba(122,87,180,0.45)"/>
<ellipse cx="190" cy="151" rx="12" ry="16" fill="#f3ede2"/><path d="M190,126 L185.5,137 L194.5,137 Z" fill="#f3ede2"/><circle cx="179.5" cy="147" r="2.6" fill="#e2532f"/><circle cx="200.5" cy="147" r="2.6" fill="#e2532f"/>
<text x="190" y="24" text-anchor="middle" font-size="15">両眼視 最大 27°</text><text x="104" y="148" text-anchor="middle" font-size="15">左目の視野</text><text x="276" y="148" text-anchor="middle" font-size="15">右目の視野</text><text x="190" y="288" text-anchor="middle" font-size="15">死角 約 40°</text>
<text x="104" y="168" text-anchor="middle" font-size="12" fill-opacity="0.65">真上から見た図</text><text x="276" y="168" text-anchor="middle" font-size="12" fill-opacity="0.65">あわせて約 320°</text></svg>'''
SCALE = '''<div style="position:relative;height:30px;margin-top:6px;font-size:11.5px;color:var(--dim)"><i style="position:absolute;left:0;right:0;top:0;height:8px;background:repeating-linear-gradient(90deg,rgba(243,237,226,.5) 0 1px,transparent 1px 3.125%);border-right:1px solid rgba(243,237,226,.5)"></i><i style="position:absolute;left:45.78%;width:8.44%;top:0;height:8px;background:linear-gradient(90deg,#2f9c7a,#7a57b4)"></i><span style="position:absolute;left:0;top:12px">左 160°</span><span style="position:absolute;left:50%;top:12px;transform:translateX(-50%);color:var(--paper)">両眼視 27°</span><span style="position:absolute;right:0;top:12px">右 160°</span></div>'''

# ---------------------------------------------------------------- slides
slide('', 'リンクを開くと、京都のハトになる。', '''<div class="body c46" style="margin-top:18px">
%s
<div><table style="font-size:16.5px">
<tr><td class="k">舞台</td><td>先斗町・鴨川・祇園白川の約 511 m × 399 m。周囲 1.37 km × 1.33 km は簡略表示</td></tr>
<tr><td class="k">街</td><td>約 64.6 万三角形。LOD3 建築物 138 棟、LOD2 建築物 834 棟、街路設備 985 点</td></tr>
<tr><td class="k">ハト</td><td>最大 90 羽の群れとトビ 3 羽。行動は台本なし</td></tr>
<tr><td class="k">視点</td><td>ハトの目（左右約 320°）、追尾、望遠、俯瞰、シネマの 5 種</td></tr>
<tr><td class="k">時間と天気</td><td>0 時から 24 時まで連続に変えられる。雨上がりの路面に切り替え可能</td></tr>
<tr><td class="k">配信</td><td>作品本体は 226 ファイル、約 54 MB。起動時に読むのは約 21 MB。依存は three.js r170 のみ</td></tr>
<tr><td class="k">音</td><td>音声ファイルなし。川音から鳴き声までブラウザ上で合成</td></tr>
</table></div>
</div>''' % fig('tele.jpg', '鴨川西岸、納涼床の下を歩くドバト。地面の小石は 1 個ずつ立体で置いている'),
      sub='京都の先斗町・鴨川・祇園白川を、ドバトの目で歩いて飛ぶブラウザ作品です。各ページの上に、そのページが答える審査基準を朱色で示します。')

slide('I', '地面から 20 cm。視野は 320°。', '''<div class="body c2">
<div style="display:grid;gap:18px;align-content:start">
<ul>
<li>3D 都市モデルを、上空からでも人の目の高さからでもなく、街に暮らす生き物の視点で体験する</li>
<li>ハトの視野は左右あわせて約 320°。両眼で見えるのは正面の最大 27°、真後ろの約 40° は死角。その視野を 1 枚の画面に展開した</li>
<li>眺めるだけで終わらない。エサをまく、手をたたく、1 羽を選んで自分で飛ぶ</li>
</ul>
<div style="display:flex;align-items:center;gap:18px">%s<p class="note" style="max-width:15em">ハトの目は頭の横についている。両眼視野の幅は Martin &amp; Young (1983) による。</p></div>
</div>
<figure style="align-self:start"><img src="img/eye.jpg" alt="ハトの目の画面" style="flex:none;height:auto;aspect-ratio:16/9">%s<figcaption>「ハトの目」の画面。目盛りは 10° きざみ。歩けば首振りで景色が止まっては進み、ついばめば視界が地面へ倒れ込む。下の中央の黒いくさびは、自分のくちばし</figcaption></figure>
</div>''' % (FOV.replace('width="330" height="260"', 'width="262" height="207"'), SCALE))

slide('AT', '舞台は、壁の写真の細かさを実測して選んだ。', '''<div class="body c2">
<ul>
<li>ハトの目線では、壁まで 1〜2 m。形状の LOD より、壁に貼られた写真の解像度が見た目を決める</li>
<li>データカタログ API から、LOD3 建築物の 3D Tiles を持つ 24 市区を洗い出し、22 市区ぶん約 11 GB を取得した</li>
<li>三角形ごとに「テクスチャ上の面積 ÷ 実面積」を計算し、面積で重み付けした分布を比べた</li>
<li>先斗町・祇園白川は中央値 85.8 px/m。1 画素が約 1.2 cm にあたる<br><small>都市設備、道路、橋梁、植生の LOD3 が同じ範囲に揃っていることも決め手になった</small></li>
</ul>
<div style="display:grid;gap:12px;align-content:start">
<div class="card" style="padding:14px 18px 8px"><p class="note" style="margin-bottom:8px">LOD3 建築物の壁のテクスチャ密度（中央値）</p>%s</div>
<table style="font-size:16px"><tr><th>地域</th><th class="n">LOD3 の棟数</th><th class="n">テクスチャ付きの面積</th><th class="n">密度の上位 10%% 点</th></tr>
<tr><td>京都市</td><td class="n">138</td><td class="n">88%%</td><td class="n">170.9 px/m</td></tr>
<tr><td>沼津市</td><td class="n">473</td><td class="n">74%%</td><td class="n">63.9 px/m</td></tr>
<tr><td>東京都港区</td><td class="n">102</td><td class="n">95%%</td><td class="n">18.2 px/m</td></tr></table>
<p class="note">数値は、それぞれの計測範囲にある LOD3 建築物だけが対象。市区全体の値ではない。</p>
</div>
</div>''' % chart_density(), credit=False)

slide('AU', '測量データはそのまま使い、足りないところをコードで描く。', '''<div class="body c64">
<div><table>
<tr><th>データ</th><th>使い方</th></tr>
<tr><td class="k">建築物 LOD3<br><span class="note">138 棟</span></td><td>壁の写真テクスチャをそのまま使う。看板や格子まで写っている</td></tr>
<tr><td class="k">建築物 LOD2<br><span class="note">834 棟</span></td><td>周囲の街並み</td></tr>
<tr><td class="k">都市設備 LOD3<br><span class="note">985 点</span></td><td>街灯・柵・祠の位置と形。街灯 184 基は夜の光源にも使う</td></tr>
<tr><td class="k">道路 LOD3</td><td>石畳の形と、地形の高さ合わせの基準</td></tr>
<tr><td class="k">植生 LOD3</td><td>木 81 本の位置と樹高。枝葉はコード</td></tr>
<tr><td class="k">地理院タイル</td><td>地形（標高タイル）と、地面の色（シームレス空中写真）</td></tr>
</table>
<p class="note" style="margin-top:12px">コードで描いたもの：石畳の模様、足元の小石と草、鴨川の水、空、鴨川の橋、ハト、トビ、人、車、音。その場所だと分かる情報は測量データのまま、時間で変わるもの・近づくと粗くなるもの・データに無いものをコードにした。</p></div>
<div style="display:grid;grid-template-rows:1fr 1fr;gap:12px;min-height:0">%s%s</div>
</div>''' % (fig('pontocho.jpg', '先斗町通。壁は PLATEAU LOD3 の写真、石畳はコード'), fig('night.jpg', '夜の祇園白川。街灯の位置は都市設備のデータどおり')))

slide('TA', '約 1 GB の 3D Tiles を、54 MB の実行時データに。', '''<div class="body" style="gap:20px;align-content:start">
<div class="io"><div><p>入力：PLATEAU の 3D Tiles、京都市の 8 データセット</p><p class="num">約 1<small>GB</small></p></div><div class="arrow">→</div><div><p>出力：作品本体 226 ファイル。起動時に読むのは約 21 MB</p><p class="num">約 54<small>MB</small></p></div></div>
<div class="pipe">
<div><b><i>1</i>抽出</b>b3dm（Draco 圧縮の glTF）を読み、地心座標から鴨川上の 1 点を原点とする局所座標へ</div>
<div><b><i>2</i>地形と写真</b>標高タイルと写真タイルを、同じ局所座標に再投影</div>
<div><b><i>3</i>高さラスタ</b>上面の高さを 25 cm 格子に。見えない壁と、歩ける場所の判定に使う</div>
<div><b><i>4</i>テクスチャ</b>101 枚の 2048 px アトラスに詰め直し、4 段階の WebP に</div>
<div><b><i>5</i>地面モデル</b>水面のマスク、50 cm 格子の歩行グリッド、接地影の遮蔽</div>
<div><b><i>6</i>書き出し</b>座標と UV を 16 bit、法線を 8 bit に量子化して deflate</div>
</div>
<ul style="grid-template-columns:1fr 1fr 1fr;gap:10px 26px;margin-top:6px">
<li style="font-size:18px">PLATEAU は楕円体高、地理院タイルは標高。そのまま重ねると建物が浮くので、LOD3 道路面との差の中央値 37.36 m を引いた</li>
<li style="font-size:18px">テクスチャは距離に応じて 4 段階を出し入れする（1.2 / 3.2 / 6.6 / 17.3 MB）。スマートフォンでは最高段階を読まない</li>
<li style="font-size:18px">依存ライブラリは three.js r170 だけ。ビルド工程はなく、静的ファイルとして配信すれば動く</li>
</ul>
</div>''', credit=False)

slide('TU', 'ハトの目と群れを、ブラウザで描く。', '''<div class="body" style="grid-template-columns:1fr 1.12fr">
<ul>
<li>ハトの頭の骨の位置から 6 方向を撮って立方体マップにし、シェーダーで左 160° から右 160° に展開する</li>
<li>縦持ちのスマートフォンでは、上段を左目、下段を右目の 2 段に分ける</li>
<li>ハトは 2,976 頂点、15 本の骨。骨の姿勢をテクスチャに書き込み、最大 93 羽を 1 回の描画命令で描く</li>
<li>地面は空中写真の上に砂利をコードで重ね、ハトのそば半径 3〜4 m には小石を約 2,600〜4,800 個、立体で置く</li>
<li>音は 11 種をブラウザ上で合成する。音声ファイルは 1 つも使っていない</li>
</ul>
<div style="display:grid;grid-template-columns:1fr 0.5fr;gap:14px;min-height:0;align-items:start">%s%s</div>
</div>''' % (fig('ui_tele.jpg', '望遠の視点。操作パネルも含めた実際の画面').replace('<img ', '<img style="flex:none;height:auto" '), fig('m_eye.jpg', '縦持ちでの「ハトの目」。上段が左目、下段が右目').replace('<img ', '<img style="flex:none;height:auto" ')))

slide('U', '5 つの視点と、3 つの関わり方。', '''<div class="body" style="gap:18px;align-content:start">
<div class="shots">
<figure><img src="img/ui_eye.jpg" alt="ハトの目"><figcaption><b>ハトの目</b>左右約 320° を 1 枚に展開</figcaption></figure>
<figure><img src="img/ui_chase.jpg" alt="追う"><figcaption><b>追う</b>すぐ後ろから。自分で歩かせ、飛ばせる</figcaption></figure>
<figure><img src="img/ui_tele.jpg" alt="望遠"><figcaption><b>望遠</b>背景をぼかして 1 羽を観察</figcaption></figure>
<figure><img src="img/ui_over.jpg" alt="俯瞰"><figcaption><b>俯瞰</b>上空から群れ全体を見下ろす</figcaption></figure>
<figure><img src="img/ui_cine.jpg" alt="シネマ"><figcaption><b>シネマ</b>カメラが自動で切り替わる</figcaption></figure>
</div>
<div style="display:grid;grid-template-columns:1.15fr 1fr 0.5fr;gap:26px;min-height:0">
<ul>
<li style="font-size:18px"><b>エサをまく</b>　6 m 以内で採餌中のハトが寄ってくる</li>
<li style="font-size:18px"><b>手をたたく</b>　近くの群れが一斉に飛び立つ</li>
<li style="font-size:18px"><b>ハトになる</b>　1 羽を選び、歩く、ついばむ、羽ばたいて飛ぶ</li>
</ul>
<ul>
<li style="font-size:18px">観察できた行動は「行動図鑑」に記録される。全 16 種、それぞれに短い解説</li>
<li style="font-size:18px">時刻は 0 時から 24 時まで連続に変えられる</li>
<li style="font-size:18px">縦持ちと横持ちの両方に合わせたボタン配置</li>
</ul>
%s
</div>
</div>''' % fig('ui_etho.jpg', '行動図鑑'))

slide('IT', '群れは、台本なしで動く。', '''<div class="body c2">
<ul>
<li>1 羽ずつが空腹と渇きを持ち、時刻と周囲の動きから次の行動を決める。状態は、採餌、休息、求愛、水飲み・水浴び、飛行、一斉飛翔、ねぐらの 7 つ</li>
<li>歩行者が 1.5 m 以内に来ると歩いて避け、ランナーが 3 m 以内に来ると飛び立つ。トビが真上を通ると一斉に飛ぶ</li>
<li>一斉飛翔は、驚きの中心から 1 m ごとに 0.03 秒ずつ遅れて広がる。波が群れを渡るように見える</li>
<li>台本が無くても、朝夕は食べ、正午は休み、夜はねぐらに集まる<br><small>群れだけを早回しで走らせ、時間の割合を見ながら係数を調整した</small></li>
</ul>
<div style="display:grid;gap:14px;align-content:start">
<div class="card"><p class="note" style="margin-bottom:10px">時刻ごとの、行動に使われた時間の割合</p>%s</div>
<p class="note">ハトの行動は実際のドバトの生態をもとにしているが、観察記録と照合したものではない。</p>
</div>
</div>''' % chart_behaviour(), credit=False)

slide('UA', '近づいても粗くならない街にする。', '''<div class="body c2" style="gap:22px 30px;align-content:start">
%s
%s
%s
<ul>
<li style="font-size:18px">空中写真は 1 画素が約 50 cm。ハトの目線では 1 画素が画面いっぱいになるので、砂利・石・草はコードで描いた</li>
<li style="font-size:18px">小石の位置は、地面に固定した格子のハッシュで決まる。同じ場所に戻れば、同じ石がある</li>
<li style="font-size:18px">人は、輪切りの断面を積み上げた曲面で作り直し、13 本の骨で動かす。祇園と先斗町には着物の人もいる</li>
</ul>
</div>''' % tuple(f.replace('<img ', '<img style="flex:none;height:auto" ') for f in (fig('ba_over.jpg', '俯瞰での比較。左は、空中写真の拡大がそのまま見えている'), fig('ba_ground.jpg', '望遠での比較。右は、ハトのそばに小石を立体として置いたもの'), fig('ba_people.jpg', '同じ場所、同じカメラでの比較。右が作り直した人'))))

slide('PT', '実機なしで、どこまで確かめたか。', '''<div class="body c46" style="gap:28px">
<div style="display:grid;gap:14px;align-content:start">
<table><tr><th>画質</th><th>対象</th><th class="n">内部解像度</th><th class="n">ハト</th></tr>
<tr><td class="k">高</td><td>PC</td><td class="n">100%</td><td class="n">90 羽</td></tr>
<tr><td class="k">中</td><td>メモリ 6 GB 以上などのスマートフォン</td><td class="n">75%</td><td class="n">70 羽</td></tr>
<tr><td class="k">低</td><td>それ以外のスマートフォン</td><td class="n">60%</td><td class="n">46 羽</td></tr></table>
<p class="note">画質は端末に合わせて自動で選ぶ。描画が間に合わなければ内部解像度を下げ、描画が止まれば 1 段下げて自動で再開する。</p>
<div class="card" style="border-color:var(--shu)"><p style="font-size:16px;font-weight:700;margin-bottom:6px">確かめられていないこと</p><p style="font-size:15.5px;line-height:1.75">実機でのフレームレート、耳で聴いた音の印象、GPU とドライバーごとの差。作品の「i」ボタンに、その端末で選ばれた画質、1 コマの平均時間、内部解像度、GPU 名を表示して、手元で確かめられるようにした。</p></div>
</div>
<div><table>
<tr><th>確かめたこと</th><th>方法と結果</th></tr>
<tr><td class="k">3 つのエンジン</td><td>Chromium、WebKit 26.6、Firefox で、全視点の切り替え、エサ、手たたき、手動飛行、夜への切り替えを自動操作。エラーなし</td></tr>
<tr><td class="k">スマートフォンの画面</td><td>縦 390×844 と横向きを、タッチ操作つきでエミュレート。ボタンの重なりなし</td></tr>
<tr><td class="k">公開先の制約</td><td>厳しい CSP、入れ子のパス、サンドボックス化した別オリジンの iframe を再現。起動し、音声が再生状態になる</td></tr>
<tr><td class="k">描画の中断</td><td>描画コンテキストを 3 回失わせ、高→中→低と下げて再開することを確認</td></tr>
<tr><td class="k">音</td><td>11 種をオフラインで合成し、ピークとスペクトルを計算。音割れなし</td></tr>
</table>
<p class="note" style="margin-top:10px">確認はすべてソフトウェア描画で行った。実装と検証を担当した AI には、実機がない。</p></div>
</div>''', credit=False)

slide('P', '開けばすぐ動き、作り方もそのまま使える。', '''<div class="body" style="grid-template-columns:1fr 1fr 1fr;gap:20px">
<div class="card"><p style="font-family:var(--disp);font-size:22px;letter-spacing:.08em;margin-bottom:12px">すぐ開ける</p><ul>
<li style="font-size:17px">インストール不要。リンクを開き、紹介ページの画面を 1 回押せば始まる</li>
<li style="font-size:17px">静的ファイルだけで動く。別のホスティングにもそのまま置ける</li>
<li style="font-size:17px">動かない端末でも、紹介ページの動画と画面で内容が分かる</li></ul></div>
<div class="card"><p style="font-family:var(--disp);font-size:22px;letter-spacing:.08em;margin-bottom:12px">作り方を公開している</p><ul>
<li style="font-size:17px">コードは MIT License、文章・画像・動画は CC BY 4.0</li>
<li style="font-size:17px">舞台選びの調査スクリプト、6 段の変換パイプライン、撮影と検証のスクリプトを公開</li>
<li style="font-size:17px">つまずいた 13 か所と、公開後に届いたプレイの報告 9 件への対処を、制作の記録にまとめた</li></ul></div>
<div class="card"><p style="font-family:var(--disp);font-size:22px;letter-spacing:.08em;margin-bottom:12px">想定する使い道<span class="note" style="font-family:var(--body);margin-left:8px">提案。効果は未検証</span></p><ul>
<li style="font-size:17px">3D 都市モデルに初めて触れる人への入口</li>
<li style="font-size:17px">街歩きの前後に、同じ路地を別の高さから見直す</li>
<li style="font-size:17px">都市と身近な生き物を、一緒に学ぶ教材</li></ul></div>
<p class="note" style="grid-column:1 / -1">他の市区への適用は試していない。舞台の範囲と原点は設定ファイルの定数で、調査スクリプトは東京都港区や沼津市の LOD3 にも使った。変換パイプラインは、最後の段の出力が公開中のデータとバイト単位で一致することを確認している。</p>
</div>''', credit=False)

slide('', 'できていないこと。', '''<div class="body c2">
<ul>
<li style="font-size:18.5px">季節は、納涼床が出ている 10 月中旬に固定している。桜や紅葉は再現できない</li>
<li style="font-size:18.5px">人の顔と指は簡略で、2〜3 m まで近づくと作り物だと分かる</li>
<li style="font-size:18.5px">LOD3 があるのは先斗町通と祇園白川沿いだけ。少し離れると LOD2 の箱形の建物になる</li>
</ul>
<ul>
<li style="font-size:18.5px">LOD3 の壁の写真は、1 m 以内まで近づくとぼける。元データの解像度による</li>
<li style="font-size:18.5px">川端通と四条通の車線、木の種類、橋の細部、人と車の量は推定と演出である</li>
<li style="font-size:18.5px">ハトの数と行動の頻度は、観察しやすいように調整してある</li>
</ul>
<div class="card" style="align-self:start"><p style="font-size:17px;line-height:1.8"><b>次にやること</b>　実機での速度と音の確認。ここは人間が手元の端末で確かめる項目として残っている。</p></div>
%s
</div>''' % fig('ba_alley.jpg', '直した例。壁の足元で地面が抜け、空の色が見えていた（左）。地面から 20 cm で壁際を撮るまで気づかなかった').replace('<img ', '<img style="flex:none;height:auto" '))

slide('', '出典と制作体制。', '''<div class="body c2" style="gap:36px">
<div style="display:grid;gap:14px;align-content:start;font-size:15.5px;line-height:1.8">
<p><span class="tag">出典</span>本作品は、国土交通省 Project PLATEAU の 3D 都市モデル（京都市、2025 年度）と、国土地理院の地理院タイル（標高タイル、シームレス空中写真）を加工して作成したものです。国土交通省、国土地理院、京都市が内容を保証するものではありません。</p>
<p class="note">3D 都市モデル：建築物 LOD3・LOD2（中京区、東山区、下京区）、都市設備・道路・橋梁・植生 LOD3。出典 国土交通省 Project PLATEAU（https://www.mlit.go.jp/plateau/）。PLATEAU のサイトポリシーに従って利用。</p>
<p class="note">地理院タイル：標高タイル（基盤地図情報数値標高モデル DEM1A、DEM5A、DEM10B）とシームレス空中写真を加工して作成。遠景の地表の色は地理院タイル（シームレス空中写真、ズームレベル 12）を加工して作成。データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO）。国土地理院コンテンツ利用規約に従って利用。</p>
<p class="note">文献：Martin, G. R. &amp; Young, S. R. (1983) The retinal binocular field of the pigeon. Vision Research 23(9), 911–915.　ソフトウェア：three.js r170（MIT License）。</p>
</div>
<div style="display:grid;gap:16px;align-content:start">
<div class="card"><p class="note">制作体制</p><p style="font-size:18px;line-height:1.75;margin-top:4px">個人の作品です。指示は応募者、実装と検証は AI（Claude Fable 5.2）が行いました。ハト、トビ、人、車、樹木の枝葉、鴨川の橋、水面、空、音は、データを使わずにコードで生成しています。</p>%s</div>
<div class="card"><p class="note">作品（紹介ページから始められます）</p><p style="font-size:17px;margin-top:2px;word-break:break-all">%s</p><p class="note" style="margin-top:12px">ソースコード、変換パイプライン、制作の記録</p><p style="font-size:17px;margin-top:2px;word-break:break-all">%s</p></div>
<p class="note">コードは MIT License、文章・画像・動画は CC BY 4.0。データを加工した成果物は、元データの利用条件に従います。</p>
</div>
</div>''' % (NAME_HTML, URL, REPO), credit=False)

# ---------------------------------------------------------------- page
N = len(slides) + 1
out = ['<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>鳩の目、京都。 PLATEAU AWARD 2026 応募スライド</title><link rel="stylesheet" href="slides.css"></head><body>']
out.append('''<section class="s cover"><img class="bg" src="img/gion.jpg" alt=""><div class="in">
<div class="crit" style="font-size:13.5px"><span class="on">PLATEAU AWARD 2026</span><span style="color:rgba(243,237,226,.9);border-color:rgba(243,237,226,.5)">一般部門　アイデア・アプリ提案</span></div>
<h1>鳩の目、京都。</h1>
<p class="lead">PLATEAU の LOD3 で再構成した先斗町・鴨川・祇園白川を、<br>ドバトの目で歩いて飛ぶブラウザ作品</p>
<div class="meta"><span>%s</span><span>%s</span></div>
<p class="cr">%s。国土交通省、国土地理院、京都市が内容を保証するものではありません。</p>
</div></section>''' % (URL, REPO, CREDIT))
for i, s in enumerate(slides):
    out.append('<section class="s %s"><div class="crit">%s</div><h2>%s</h2>%s%s<div class="foot"><b>鳩の目、京都。</b><span>%s</span><span class="pg">%d / %d</span></div></section>' % (
        s['cls'], s['crit'], s['title'], ('<p class="sub">%s</p>' % s['sub']) if s['sub'] else '', s['body'], CREDIT if s['credit'] else '', i + 2, N))
out.append('</body></html>')
open(HERE + '/slides.html', 'w', encoding='utf-8').write('\n'.join(out))
print('slides', N)
