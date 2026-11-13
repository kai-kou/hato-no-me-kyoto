# 静止画と動画

すべて作品の画面をそのまま撮ったものです。撮影はヘッドレス Chrome のソフトウェア描画で行いました。撮影方法は [tools/README.md](../tools/README.md) にあります。

国土交通省 Project PLATEAU の 3D 都市モデル（京都市、2025 年度）と、国土地理院の地理院タイルを加工して作成した画面です。出典と利用条件は [NOTICE.md](../NOTICE.md) にあります。

## 静止画（`stills/`）

| ファイル | 内容 | ビルド |
| --- | --- | --- |
| `gion_kimono.jpg` | 祇園・新橋通。歩いてきた着物の人を避けて、ハトが左右に分かれたところ。地面から 17 cm | v19 |
| `gion_kimono_hato.jpg` | 同じ場面を、ハトに寄せて撮ったもの | v19 |
| `hato_no_me.jpg` | ハトの目の視点。左右約 320° のパノラマ | v16 |
| `pontocho.jpg` | 先斗町通 | v16 |
| `flush_overview.jpg` | 手をたたいた直後の群れを俯瞰で | v18 |
| `kamogawa_tele.jpg` | 鴨川西岸、納涼床の下を歩くハトを望遠で | v14 |
| `gion_shirakawa_night.jpg` | 夜の祇園白川 | v14 |
| `ground_before_after_overview.jpg` | 地面の描き方の変更前と変更後（俯瞰） | 比較用に合成 |
| `ground_before_after_tele.jpg` | 地面の描き方の変更前と変更後（望遠） | 比較用に合成 |
| `people_before_after.jpg` | 人の作り直し前と後。同じ場所、同じカメラ | v18 と v19 を合成 |

## 動画（`video/`、`clips/`）

`video/hato_kyoto_x.mp4` は X への投稿用にまとめた動画です。1280×720、30 fps、音声なし。`tools/xvideo.py` が `clips/` のクリップに字幕を重ねて作ります。

| 順 | クリップ | 字幕 | ビルド |
| --- | --- | --- | --- |
| 1 | `v19_clip_6_gion_kimono.mp4` | 祇園・新橋通。人が近づくと、ハトは歩いて道を空ける | v19 |
| 2 | `v21_clip_1_hato_no_me.mp4` | ハトの目。視野は約320°、下に見えるのは自分のくちばし | v21 |
| 3 | `v21_clip_3_flush_overview.mp4` | 手をたたくと、群れが一斉に飛び立つ | v21 |
| 4 | `v12_clip_2_kamogawa.mp4` | 行動に台本はない。空腹と渇きと時刻で決まる | v12 |
| 5 | `v21_clip_5_pontocho.mp4` | 先斗町。壁は PLATEAU LOD3 の実写テクスチャ | v21 |
| 6 | `v11_clip_4_gion_night.mp4` | 夜の祇園白川 | v11 |

ビルドの番号は公開した版の通し番号で、`app/` にあるのは v21 です。v12 と v11 のクリップは人を作り直す前のビルドで撮ったもので、人が写らないカットだけを使っています。
