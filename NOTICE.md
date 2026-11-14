# データの出典と利用条件

本作品は次のデータを加工して作成したものです。国土交通省、国土地理院、京都市が内容を保証するものではありません。

リポジトリ内でこれらのデータに由来するのは、`app/d` と `app/t` の実行時データ、`survey/feats_*.json` の集計結果、`media/` と記事中の画像・動画です。元の 3D Tiles と地理院タイルそのものは含めていません。

## 3D 都市モデル（Project PLATEAU）

| 項目 | 内容 |
| --- | --- |
| データ | 3D都市モデル（Project PLATEAU）京都市（2025 年度）。建築物 LOD3・LOD2（中京区、東山区、下京区）、都市設備・道路・橋梁・植生 LOD3（京都市全域のうち舞台の範囲） |
| 使い方 | 3D Tiles を読み、局所座標への変換、テクスチャの詰め直し、量子化を行って実行時データにした。壁面の写真テクスチャは元データのもの |
| 出典 | 国土交通省 Project PLATEAU <https://www.mlit.go.jp/plateau/>。配布は G空間情報センター <https://www.geospatial.jp/ckan/dataset/plateau> |
| 利用条件 | PLATEAU のサイトポリシー <https://www.mlit.go.jp/plateau/site-policy/> に従う。出典を表記すれば複製、加工、商用利用ができる（[国土交通省の発表資料](https://www.mlit.go.jp/common/001418346.pdf)） |

`survey/` の調査では、比較のために他の市区（東京都港区、静岡県沼津市など）の LOD3 建築物も読んでいます。`survey/feats_*.json` はその集計結果で、同じ出典と利用条件に従います。

## 国土地理院の地理院タイル

| 項目 | 内容 |
| --- | --- |
| 地形、水面の範囲 | 地理院タイル（標高タイル：基盤地図情報数値標高モデル DEM1A、DEM5A、DEM10B）を加工して作成 |
| 舞台と周囲の地表の色、LOD2 建築物の屋根の色 | 地理院タイル（シームレス空中写真、ズームレベル 18）を加工して作成 |
| 遠景の地表の色 | 地理院タイル（シームレス空中写真、ズームレベル 12）を加工して作成。データソース：Landsat8画像（GSI,TSIC,GEO Grid/AIST）, Landsat8画像（courtesy of the U.S. Geological Survey）, 海底地形（GEBCO） |
| 出典 | 国土地理院 地理院タイル一覧 <https://maps.gsi.go.jp/development/ichiran.html> |
| 利用条件 | 国土地理院コンテンツ利用規約 <https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html> に従う |

標高タイルのもとになっている基盤地図情報は、測量法の基本測量成果です。国土地理院の「地図の利用手続」（<https://www.gsi.go.jp/LAW/2930-index.html>）では、地図としての利用を想定しないデザインなどは承認申請が不要で、出典の明示で利用できるとされています。本作品は街とハトを眺めるための作品で、地図としての利用を想定していません。この区分に当たるものとして、出典を明示して利用しています。

## 参照した文献と情報

| 用途 | 出典 |
| --- | --- |
| ハトの両眼視野の幅 | Martin, G. R. & Young, S. R. (1983) The retinal binocular field of the pigeon. Vision Research 23(9), 911–915. <https://pubmed.ncbi.nlm.nih.gov/6636551/> |
| 鴨川納涼床の期間 | 京都観光Navi <https://ja.kyoto.travel/event/single.php?event_id=4902> |

## 人体データ（`?people=asset` を付けたときだけ使う）

| 項目 | 内容 |
| --- | --- |
| データ | Microsoft Rocketbox Avatar Library の成人 12 体（Female_Adult_01, 02, 05, 08, 13, 17、Male_Adult_01, 02, 06, 08, 11, 16）と、動作 6 種（walk_neutral、walk_neutral_02、idle_neutral_01、idle_look_around_01、cell_phone_textmessage、sit_chair_idle_neutral_01） |
| 使い方 | FBX と TGA を読み、形・骨・動作を独自形式（`app/p/<id>.txt`）に、テクスチャを 1024 px の WebP（`app/p/*.webp`）に変換した。変換は `tools/avatar_export.py` |
| 出典 | <https://github.com/microsoft/Microsoft-Rocketbox> |
| 利用条件 | MIT License。Copyright (c) 2020 Microsoft。全文は [app/p/LICENSE.txt](app/p/LICENSE.txt) |

既定の動作ではこのデータを読み込みません。

## ソフトウェア

| ソフトウェア | ライセンス | 場所 |
| --- | --- | --- |
| three.js r170 | MIT License。Copyright 2010-2024 Three.js Authors | `app/js/three.module.min.js` |
| three.js r187 | MIT License。Copyright 2010-2026 Three.js Authors | `prototype/osaka-nipponbashi/three.core.js`、`three.module.js` |

紹介ページは、Google Fonts から Shippori Mincho と Zen Kaku Gothic New（どちらも SIL Open Font License 1.1）を読み込みます。フォントのファイルは同梱していません。読み込めない環境では、端末の明朝体とゴシック体で表示します。

`pipeline/` が使うライブラリ（glTF Transform、draco3dgltf、earcut、meshoptimizer、sharp、three）は同梱していません。`pipeline/package.json` に一覧があります。

## 作成者

指示は kai-kou、実装と検証は Claude Fable 5.2（Anthropic）が行いました。制作と検証には Meta Muse（Meta）も利用しました。ハト、トビ、人、車、樹木の枝葉、鴨川の橋、水面、空、音は、データを使わずにコードで生成しています。`?people=asset` を付けた場合だけ、人の一部が上記の人体データに替わります。
