# 変換パイプライン

PLATEAU の 3D Tiles と国土地理院の地理院タイルから、作品が実行時に読むデータ（`app/d` と `app/t`）を作る Node.js のスクリプト群です。入力は京都市の 8 データセット約 1 GB、出力は 211 ファイル約 53 MB です。設計の理由は [docs/article.md](../docs/article.md) の「約 1 GB の 3D Tiles を 54 MB にする」にあります。

Node.js 22 で実行しました。

## 段

| 段 | スクリプト | 内容 |
| --- | --- | --- |
| 1 | `extract.mjs` | 3D Tiles（b3dm、Draco 圧縮の glTF）を読み、地心座標から鴨川上の 1 点を原点とするメートル単位の局所座標へ変換して、レイヤーごとにキャッシュする |
| 2 | `terrain.mjs` | 標高タイルと写真タイルを同じ局所座標に再投影する。24 km 四方の遠景用の地形と写真も作る |
| 3 | `raster.mjs` | 建物と設備の上面高さを 25 cm 格子に焼く。隣の建物に隠れて見えない壁の判定と、歩ける場所の判定に使う |
| 4 | `atlas.mjs <レイヤー>` | 元のテクスチャアトラスを場所ごとの 2048 px アトラスへ詰め直し、4 段階の WebP にする。見えない壁と屋根は密度を 1/4 に落とす |
| 5 | `ground.mjs` | 高さの基準合わせ、水面のマスク、50 cm 格子の歩行用グリッド、接地影用の遮蔽グリッドを作る |
| 6 | `export.mjs [出力先]` | 頂点座標と UV を 16 bit、法線を 8 bit に量子化し、頂点ごとの環境遮蔽を焼き込んで deflate で固める。メタデータ（街灯、木、祠などの位置）も書き出す |
| 後処理 | `pack.mjs [出力先]` | バイナリの pak を base64 の `.txt` に変える。アプリはこの形を読む |

段 5 の基準合わせは、PLATEAU の 3D Tiles が楕円体高、地理院タイルが標高であることへの対処です。LOD3 の道路面と地形の差の中央値（37.36 m）を求めて差し引きます。

舞台の範囲と原点は `cfg.mjs` にあります。

| 定数 | 内容 |
| --- | --- |
| `ORIGIN` | 局所座標の原点。北緯 35.0052°、東経 135.7722°、楕円体高 73.0 m |
| `CORE` | 詳細に作る範囲。東経 135.7700°〜135.7756°、北緯 35.0036°〜35.0072° |
| `CTX` | 簡略表示する周囲の範囲。東経 135.7655°〜135.7805°、北緯 34.9995°〜35.0115° |

## 入力データの取得

入力はリポジトリに含めていません。既定の置き場所は `pipeline/dl`、中間データは `pipeline/cache` で、環境変数 `HATO_DL` と `HATO_CACHE` で変えられます。

3D Tiles は、PLATEAU VIEW のデータカタログ API の応答からデータセット ID で URL を引いて取得します。

```sh
cd pipeline
mkdir -p dl/catalog
curl -o dl/catalog/datasets.json https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets
for id in 26104_bldg_lod3 26105_bldg_lod3 26106_bldg_lod3 \
          26100_frn_lod3 26100_tran_lod3 26100_brid_lod3 \
          26100_veg_PlantCover_lod3 26100_veg_SolitaryVegetationObject_lod3; do
  ../survey/fetch.sh $id
done
```

| データセット ID | 内容 | 大きさ |
| --- | --- | --- |
| `26104_bldg_lod3` | 建築物モデル（中京区） | 393 MB |
| `26105_bldg_lod3` | 建築物モデル（東山区） | 197 MB |
| `26106_bldg_lod3` | 建築物モデル（下京区） | 290 MB |
| `26100_frn_lod3` | 都市設備モデル（京都市） | 78 MB |
| `26100_tran_lod3` | 交通（道路）モデル（京都市） | 0.5 MB |
| `26100_brid_lod3` | 橋梁モデル（京都市） | 0.4 MB |
| `26100_veg_PlantCover_lod3` | 植生モデル 植被（京都市） | 0.1 MB |
| `26100_veg_SolitaryVegetationObject_lod3` | 植生モデル 単独木（京都市） | 1.6 MB |

タイルは合わせて 368 枚、約 28 MB です（地理院タイル 224 枚と、比較用の PLATEAU オルソ画像 144 枚）。`../survey/tiles.py` が URL と保存先の一覧を作るので、それを順に取得します。

```sh
python3 ../survey/tiles.py
xargs -P 4 -L 1 sh -c 'curl -sS -o "$1" "$0"' < dl/gsi/tilejobs.txt
```

| 保存先（`dl/gsi/`） | タイル | ズームレベル | 用途 |
| --- | --- | --- | --- |
| `dem1a` | 標高タイル DEM1A | 17 | 舞台の地形 |
| `dem5a` | 標高タイル DEM5A | 15 | DEM1A が欠けている場所の補完 |
| `demfar` | 標高タイル DEM10B | 12 | 遠景の山並み |
| `gsiphoto` | シームレス空中写真 | 18 | 舞台の地表の色 |
| `photofar` | シームレス空中写真 | 12 | 遠景の地表の色 |
| `ortho` | PLATEAU オルソ画像（2023） | 18 | 比較用。出力には使っていない |

PLATEAU のオルソ画像は、この範囲のタイルで緑と青が同じ値になっていたため、地表の色には使っていません。

## 実行

```sh
npm ci
npm run all          # 段 1 から 6 と後処理を順に実行し、../app/d と ../app/t を書き換える
```

段ごとに実行することもできます。

```sh
node extract.mjs
node terrain.mjs
node raster.mjs
node atlas.mjs bldg3 && node atlas.mjs bldg2 && node atlas.mjs frn
node ground.mjs
node export.mjs /tmp/out && node pack.mjs /tmp/out    # 出力先を指定する場合
```

`atlas.mjs` は、アトラスの大きさを第 2 引数、密度の上限と倍率を環境変数（`MAXDENS`、`BASE_SCALE`、`HIDDEN_SCALE`、`ROOF_SCALE`）で変えられます。既定値は上限 128 px/m、見えない壁と屋根が 1/4 です。

## 再現性

確認できているのは最後の段だけです。キャッシュ済みの中間データに対して、このディレクトリの `export.mjs` と `pack.mjs` を実行し、出力の 211 ファイルが `app/d`・`app/t` とバイト単位で一致することを確かめました。

段 1 から 5 を、入力の取得からやり直して同じ結果になるかは確かめていません。PLATEAU と地理院タイルの配信内容が更新されれば、結果は変わります。

## 調査と確認のための道具

| スクリプト | 内容 |
| --- | --- |
| `texstat.mjs` | 経緯度の範囲にあるタイルについて、LOD ごとのテクスチャの有無と画素密度の分布を出す。舞台選びに使った |
| `atlasinv.mjs` | 範囲内の建物が使っているテクスチャアトラスの一覧を出す |
| `inbox.mjs` | 範囲に入るタイルの数、大きさ、地物の数を出す |
| `frnstat.mjs` | 都市設備の種類ごとの数を出す |
| `alphachk.mjs` | テクスチャに透過があるかを調べる |
| `preview.mjs` | 範囲内のタイルから確認用の GLB を作る。`pv/viewer.html` と `pv/shots.py` で表示、撮影する |
