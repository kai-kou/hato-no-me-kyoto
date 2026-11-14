# リアリティのための調査と、採用・不採用の記録

2026-11-14。論文と実務の資料を調べ、この作品に当てはめて試し、効いたものだけを入れた。確認はソフトウェア描画の画面写真で行っており、実機では見ていない。

## 採用したもの

### 1. 物陰の暗さを光線追跡で焼き込む（v35）

高さ地図からの近似をやめ、街の全三角形に対して空の見え方を求めた。経緯と測定は [perf-rust.md](perf-rust.md) の追記にある。

### 2. 首の構造色を薄膜干渉の計算から作る（v36）

- 根拠: ドバトの首の緑と紫は、小羽枝のケラチン皮質 1 層での薄膜干渉で説明でき、緑の羽は見る角度が斜めになると紫に、紫の羽は逆に緑に変わる（Yin ほか 2006）。色が 2 色に限られ、わずかな角度で急に切り替わるのは、高次の干渉条件が可視域に入っているため（Yoshioka・Nakamura・Kinoshita 2007）。
- これまで: 見る角度から色相を決める手作りの式で、光の向きに関係なく地の色に足していた。
- 変更: 屈折率 1.55 の薄膜の反射率を波長ごとに計算し（エアリーの式、380〜730 nm）、CIE 1931 の等色関数で RGB に直した表を、入射角 16 段階 × 厚さ 2 種類ぶん持つ。厚さは約 595 nm（正面で緑、斜めで紫）と約 500 nm（その逆）。595 nm では正面の反射のピークが 527 nm（緑）、738 nm、410 nm に来る。緑の首の羽に緑の主ピークと紫・赤の副ピークがあるという測定（McGraw 2004）と合う。
- 色は地の色ではなく光として足す。空の映り込み（見る角度で決まる）と、太陽（ハーフベクトルまわりの広い反射）の 2 つ。日陰や夜には出すぎない。
- 厚さ 595 nm と 500 nm は、上の文献の説明と反射ピークの位置から逆算した値で、論文の数値をそのまま引いたものではない。強さの係数（空 1.6、太陽 5）は見た目で決めた。

比較（左が 2 方向から見た v36）: [img/iridescence_v36.jpg](img/iridescence_v36.jpg)、変更前: [img/iridescence_before.jpg](img/iridescence_before.jpg)

### 3. 頭を止める時間を歩く速さで変える（v36）

- 根拠: ヘッドボブは「止める」と「送る」の 2 相で、1 歩に 1 回。速く歩くほど 1 歩のうち止めている割合は直線的に減り、約 75 cm/s を超えると止める相がなくなる（Davies & Green 1988、Necker 2007 の総説）。
- これまで: 0.72 m/s 未満のとき、1 歩の 60% を一律に止めていた。
- 変更: 止める割合を、ゆっくり歩くときの 70% から 0.72 m/s 手前の 28% まで、速さに比例して減らす。70% と 28% は文献の「直線的に減る」に合わせて置いた値で、測定値ではない。

## 調べて、変えなかったもの

### 羽ばたきの周波数

作品は 6.3〜9.0 Hz（遅い飛行と飛び立ちで高い）。文献では上昇・水平・下降の飛行で 6.1〜9.6 Hz（Berg & Biewener 2008）、飛び立ちで最も高い（Berg & Biewener 2010）。範囲に収まっているので変更なし。

### 「ハトの目」に視力のぼかしを入れるか

ハトの視力は側方で約 12.6 周期/度（Hahmann & Güntürkün 1993 ほか）、前方では目から 10 cm で約 11 周期/度が上限（2005 年の測定）。下の視野は近視で、地面に焦点が合う（Hodos & Erichsen 1990）。一方、この作品のパノラマは 320° を画面の幅に広げるので、幅 1,280 px の画面で 1 度あたり 4 px、表せるのは 2 周期/度まで。画面のほうがハトの視力より粗く、ぼかしを足す意味がない。紫外線が見えることは画面では表せない。

### トーンカーブを AgX に替えるか

- 調べたこと: 今のカーブは ACES の近似（チャンネルごとの曲線）。AgX は明るく鮮やかな光が白へ抜けるときに色相がずれにくく、Blender などで標準になっている。Khronos の PBR Neutral は素材の色を保つ用途向け。
- 試したこと: AgX（Wrensch の簡易版に「punchy」ルック）を切り替えで入れ、昼・夕方で撮り比べた。空の青と地面の明部は残るが、全体が暗く沈む。露出、時刻ごとの空と太陽の強さ、色の傾け方は今のカーブに合わせて決めてあり、替えるならそれらを全部決め直すことになる。
- 判断: 既定は変えない。`?tm=agx` で試せるようにだけしてある。比較: [img/tonemap_aces_agx_dusk.jpg](img/tonemap_aces_agx_dusk.jpg)（左が今、右が AgX）

### 繰り返し模様を消す確率的テクスチャリング

Heitz & Neyret 2018 と、その簡易版（Mikkelsen 2022 の六角タイル）を確認した。この作品の地面と壁は繰り返しテクスチャではなく、航空写真・LOD3 の写真・手続き生成なので、当てはまる場所がない。

## 出典

- Yin, H. ほか (2006). Iridescence in the neck feathers of domestic pigeons. Physical Review E 74, 051916. https://doi.org/10.1103/PhysRevE.74.051916
- Yoshioka, S., Nakamura, E., Kinoshita, S. (2007). Origin of two-color iridescence in rock dove's feather. J. Phys. Soc. Jpn 76, 013801. https://doi.org/10.1143/JPSJ.76.013801
- McGraw, K. J. (2004). ハトの首の羽の反射スペクトル（https://rcannon992.com/2020/04/25/iridescent-feathers-of-pigeons の引用による）
- Wyman, C., Sloan, P.-P., Shirley, P. (2013). Simple analytic approximations to the CIE XYZ color matching functions. JCGT 2(2).
- Davies, M. N. O., Green, P. R. (1988). Head-bobbing during walking, running and flying. J. Exp. Biol. 138, 71–91.
- Necker, R. (2007). Head-bobbing of walking birds. J. Comp. Physiol. A 193, 1177–1183.
- Berg, A. M., Biewener, A. A. (2008). Kinematics and power requirements of ascending and descending flight in the pigeon. J. Exp. Biol. 211, 1120.
- Berg, A. M., Biewener, A. A. (2010). Wing and body kinematics of takeoff and landing flight in the pigeon. J. Exp. Biol. 213, 1651–1658. https://doi.org/10.1242/jeb.038109
- Hodos, W., Erichsen, J. T. (1990). Lower-field myopia in birds. Vision Research 30, 653–657. https://doi.org/10.1016/0042-6989(90)90091-X
- Limits of visual acuity in the frontal field of the rock pigeon (2005). Perception. https://journals.sagepub.com/doi/10.1068/p5205
- Heitz, E., Neyret, F. (2018). High-performance by-example noise using a histogram-preserving blending operator. https://doi.org/10.1145/3233304
- Mikkelsen, M. S. (2022). Practical real-time hex-tiling. JCGT 11(3). https://jcgt.org/published/0011/03/05/paper.pdf
- three.js forum: Tone mapping overview. https://discourse.threejs.org/t/tone-mapping-overview/75204
