# 鳩の目、京都。

京都の先斗町・鴨川・祇園白川を、ドバトの目で歩いて飛ぶブラウザ作品です。街は国土交通省の 3D 都市モデル PLATEAU（京都市・2025 年度）の LOD3 建築物から再構成しています。依存ライブラリは three.js r170 だけで、ビルド工程はありません。

作品を開く: <https://claude.ai/artifact/L6dDhAnGZur167TMmp6hdM>

![祇園・新橋通を歩く着物の人と、道を空けるハト](media/stills/gion_kimono.jpg)

実装と検証は AI（Claude Fable 5.2）が行いました。出した指示、AI が下した技術判断、つまずいた点、確かめられたことと確かめられなかったことは [docs/article.md](docs/article.md) にまとめています。約 30 秒の紹介動画は [media/video/hato_kyoto_x.mp4](media/video/hato_kyoto_x.mp4) です。

## 規模

| 項目 | 値 |
| --- | --- |
| 舞台 | 先斗町・鴨川・祇園白川の約 511 m × 399 m。周囲 1.37 km × 1.33 km は簡略表示 |
| 街のポリゴン | 約 64.6 万三角形。LOD3 建築物 138 棟、LOD2 建築物 834 棟、街路設備 985 点 |
| ハト | 最大 90 羽の群れとトビ 3 羽。行動は台本なしで、空腹・渇き・時刻・周囲の動きから決まる |
| 視点 | ハトの目（左右約 320° のパノラマ）、追尾、望遠、俯瞰、シネマの 5 種 |
| 時間と天気 | 0 時から 24 時まで連続に変えられる。雨上がりの濡れた路面に切り替え可能 |
| 配信サイズ | 226 ファイル、約 54 MB。起動時に読むのは約 21 MB |
| 音 | 音声ファイルなし。川音から鳴き声までブラウザ上で合成 |

## リポジトリの構成

| ディレクトリ | 内容 |
| --- | --- |
| [app/](app/) | 作品本体。静的ファイルだけで動く公開ビルド（v21） |
| [pipeline/](pipeline/) | PLATEAU の 3D Tiles と地理院タイルから `app/d`・`app/t` を作る Node.js の変換パイプライン |
| [survey/](survey/) | 舞台を決めるために行った、LOD3 テクスチャ密度の調査スクリプトと結果 |
| [tools/](tools/) | 静止画と動画の撮影、動画の組み立て、ブラウザ 3 エンジンでの検証スクリプト |
| [docs/](docs/) | 記事（`article.md`）と X の投稿文案（`x-post.md`） |
| [media/](media/) | 静止画、紹介動画、動画の素材クリップ |
| [prototype/](prototype/) | 前身の大阪・日本橋版。測量データを使わない手続き生成の試作 |

## 動かす

`app/` を静的ファイルとして配信すれば動きます。ES モジュールと `fetch` を使うので、`file://` で直接開くことはできません。

```sh
python3 -m http.server 8000 --directory app
# http://localhost:8000/ を開く
```

WebGL 2 と `DecompressionStream` に対応したブラウザが必要です。画質は端末に合わせて 3 段階から自動で選ばれ、描画が間に合わないときは実行中に内部解像度を下げます。

URL のパラメータで起動時の状態を指定できます。

| パラメータ | 例 | 内容 |
| --- | --- | --- |
| `q` | `q=low` | 画質。`low`、`mid`、`high` |
| `m` | `m=eye` | 最初の視点。`eye`（ハトの目）、`chase`（追尾）、`tele`（望遠）、`over`（俯瞰）、`cine`（シネマ） |
| `t` | `t=15.5` | 開始時刻。0 から 24 |
| `auto` | `auto=1` | タイトル画面を出さずに始める |
| `n` | `n=46` | ハトの数 |
| `nolife` | `nolife=1` | 人と車を出さない |
| `scale` | `scale=0.5` | 内部解像度の倍率 |
| `rec` | `rec=30` | 録画用の固定時間刻み（1 秒あたりのコマ数）。`tools/rec2.py` が使う |

## 公開する

作品は Claude のアーティファクトとして公開しています（上のリンク）。`app/` はそのまま静的ホスティングにも置けます。GitHub Pages 用に、手動で実行するワークフロー（[.github/workflows/pages.yml](.github/workflows/pages.yml)）を入れてあります。

1. リポジトリの Settings → Pages で、Source を「GitHub Actions」にする
2. Actions タブで「Deploy app to GitHub Pages」を選び、Run workflow を押す

ワークフローは `app/` だけを公開します。GitHub Pages には月 100 GB のソフトな帯域上限があります。全体を読み込むと 1 回あたり約 54 MB になるので、アクセスが集中する見込みがあるなら、帯域の上限がない静的ホスティングも検討してください。最大のファイルは約 15 MB です。

`app/d` と `app/t` の `.txt` は、バイナリを base64 にしたものです。最初の公開先がバイナリ拡張子を配信できなかったための措置で、サイズは約 33% 増えています。

## データを作り直す

`app/d` と `app/t` は、[pipeline/](pipeline/) の 6 段のパイプラインで作ったものです。入力の 3D Tiles（約 1 GB）と地理院タイルはリポジトリに含めていません。取得方法と実行手順は [pipeline/README.md](pipeline/README.md) にあります。

## 検証

実機を持たない AI が手元で確かめた範囲と、そのためのスクリプトは [tools/README.md](tools/README.md) にあります。実機でのフレームレート、耳で聴いた音の印象、実際の GPU とドライバーごとの差は確かめられていません。作品の「i」ボタンの最下段に、その端末で選ばれた画質、1 コマの平均時間、内部解像度、GPU 名が出ます。

## できていないこと

- 季節は納涼床が出ている 10 月中旬に固定している。桜や紅葉は再現できない
- 人の顔と指は簡略で、2〜3 m まで近づくと作り物だと分かる
- LOD3 があるのは先斗町通と祇園白川沿いだけで、少し離れると LOD2 の箱形の建物になる
- LOD3 の壁の写真は、1 m 以内まで近づくとぼける。元データの解像度による
- 川端通と四条通の車線、木の種類、橋の細部、人と車の量は推定と演出である
- ハトの数と行動の頻度は、観察しやすいように調整してある

ハトの行動は実際のドバトの生態をもとにしていますが、観察記録と照合したものではありません。

## 出典とライセンス

本作品は、国土交通省 Project PLATEAU の 3D 都市モデル（京都市、2025 年度）と、国土地理院の地理院タイル（標高タイル、シームレス空中写真）を加工して作成したものです。国土交通省、国土地理院、京都市が内容を保証するものではありません。データごとの出典と利用条件は [NOTICE.md](NOTICE.md) にあります。

`app/d`、`app/t`、`media/` などデータを加工した成果物には、元データの利用条件が適用されます。three.js は MIT License です。それ以外のコードと文章のライセンスは、まだ設定していません。

---

## English

*Hato no Me, Kyoto* ("Pigeon's Eye, Kyoto") is a browser piece in which you walk and fly through Pontocho, the Kamo River and Gion Shirakawa as a feral pigeon. The town is rebuilt from the LOD3 buildings of Project PLATEAU, the open 3D city model published by Japan's Ministry of Land, Infrastructure, Transport and Tourism (Kyoto, FY2025). It runs on three.js r170 with no build step, on phones as well as desktops.

The implementation and its verification were done by an AI (Claude Fable 5.2). The write-up is in [docs/article.md](docs/article.md) (Japanese). To run it, serve `app/` as static files: `python3 -m http.server 8000 --directory app`.

Data sources and terms are listed in [NOTICE.md](NOTICE.md).
