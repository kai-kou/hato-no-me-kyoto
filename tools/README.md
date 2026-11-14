# 撮影と検証の道具

作品を自動で操作して、静止画と動画を撮り、動作を確かめるためのスクリプトです。実機を持たない AI が、手元で動かせるものだけで確認するために作りました。確認できた範囲と結果は [docs/article.md](../docs/article.md) の「スマートフォン対応と、AI が自分で確かめた範囲」にあります。

## 必要なもの

- Python 3 と Playwright（Chromium、WebKit、Firefox）、Pillow、NumPy
- Google Chrome。ソフトウェア描画（SwiftShader）で起動する
- ffmpeg（動画）、Node.js（構文チェック）、xvfb-run（Firefox の実行）
- 動画の字幕に Noto Sans CJK Bold

ソフトウェア描画なので遅く、2 コアの環境では 1 コマに 4〜15 秒かかります。5 秒のクリップ 1 本の録画に 20 分ほどかかりました。

場所は環境変数で変えられます（`_paths.py`）。

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `HATO_DIR` | `<リポジトリ>/app` | 対象のアプリ |
| `HATO_OUT` | `<リポジトリ>/media` | 素材クリップと動画の置き場所 |
| `HATO_TMP` | `<一時ディレクトリ>/hato` | コマ画像などの作業用 |
| `HATO_CHROME` | `/usr/bin/google-chrome` | Chrome の実行ファイル |

## まとめて確認する

```sh
tools/run_checks.sh
```

モジュールの構文、Chromium・WebKit・Firefox での一連の操作、実際の入力イベントでのタップとボタン、ファイルの欠け、公開先の制約（厳しい CSP、入れ子のパス、サンドボックス化した別オリジンの iframe）、紹介ページから作品が始まるまでの流れ、描画コンテキストを失ったあとの再開を順に確かめます。

## スクリプト

| スクリプト | 使い方 | 内容 |
| --- | --- | --- |
| `jscheck.sh` | `tools/jscheck.sh [アプリの場所]` | ES モジュールの構文チェック。`node --check` は `.js` をモジュールとして解釈しないので、`.mjs` に写して調べる。あわせて、three.js のシェーダに差し込むときの置換キー 13 個が `three.module.min.js` の中にあるかを照合する（three.js の更新でキーの名前が変わると、エラーにならずに見た目だけが変わるため） |
| `prof.py` | `python3 tools/prof.py [秒] "<クエリ>" ...` | 描画中のメインスレッドの CPU プロファイルを取り、ファイル別・関数別に集計する。GPU 側の描画時間は含まれない |
| `bench/` | `node tools/bench/bench.mjs`、`python3 tools/bench/tickprof.py "<クエリ>"` | JavaScript と Rust（WebAssembly）の比較と、シミュレーション 1 ステップの内訳。Rust は `cd tools/bench/rust && cargo build --release --target wasm32-unknown-unknown`（SIMD 版は `RUSTFLAGS="-C target-feature=+simd128"` と `--target-dir target_simd`）で先にビルドする。結果は [docs/perf-rust.md](../docs/perf-rust.md) |
| `shoot.py` | `python3 tools/shoot.py <出力の接頭辞> "<クエリ>" [--js ファイルまたは式] [--size 幅x高さ] [--wait 秒] [--mobile]` | 静止画を撮り、描画命令数やコンソールのエラーを出す。クエリは複数並べられ、`--js` は直前のクエリに付く |
| `strip.py` | `python3 tools/strip.py <出力.png> "<クエリ>" [コマ数] [幅x高さ] [切り抜き]` | 連続したコマを 1 枚に並べる。動きの確認用 |
| `rec2.py` | `python3 tools/rec2.py <出力.mp4> "<クエリ>" <コマ数> <幅x高さ> <fps> <ポート> <JS ファイル> [助走コマ数]` | 固定の時間刻みで 1 コマずつ進めて録画する。JS ファイルは録画前にページ内で実行する演出 |
| `rec.py` | `python3 tools/rec.py <出力.mp4> "<クエリ>" <コマ数> <幅x高さ> [fps] [ポート]` | 演出なしの録画 |
| `xvideo.py` | `python3 tools/xvideo.py` | `media/clips` のクリップに字幕を重ね、エンドカードを付けて `media/video/hato_kyoto_x.mp4` にまとめる |
| `lp_night.sh` | `tools/lp_night.sh [app のディレクトリ]` | 紹介ページの動画（`app/lp/hero.mp4`、`hero_s.mp4`、`intro.mp4`）の夜の場面を、撮り直したクリップに差し替える。v27 で使った |
| `xengine.py` | `python3 tools/xengine.py <chromium または webkit> "<クエリ>" <出力.png> [幅x高さ] [JS ファイル]` | 指定したエンジンで起動し、JS の操作を実行して結果とエラーを出す |
| `xengine_ff.py` | 同上（`firefox`） | Firefox 用。`xvfb-run` の下で実行する |
| `csptest.py` | `python3 tools/csptest.py <エンジン> [幅x高さ]` | 入れ子のパス、厳しい CSP、サンドボックス化した別オリジンの iframe で動くかを確かめる。紹介ページの最初の画面を押すところから始める |
| `lptest.py` | `python3 tools/lptest.py <エンジン> <shots または flow> [出力の接頭辞]` | 紹介ページの確認。`shots` は PC とスマートフォンの幅で画面ごとに撮り、欠けた画像と横へのはみ出しを報告する。`flow` は最初の画面を押して作品が始まるまでを確かめ、音が再生状態か、再読み込みで作品に戻るか、リンクで紹介ページに戻れるかを見る。Firefox は `xvfb-run` の下で実行する |
| `uitest.py` | `python3 tools/uitest.py [出力の接頭辞]` | マウスとキーボードの実際の入力イベントで操作を確かめる。読み込み画面の段階表示、ハトと地面のタップ（俯瞰と「ハトの目」のパノラマ）、数ピクセル揺れる押下、音のボタンと出力レベル、時刻ボタンでの夜と朝、空中での「ついばむ」。18 項目の合否を出す |
| `net404.py` | `python3 tools/net404.py "<クエリ>"` | すべての取得を記録し、失敗したものを出す |
| `losttest.py` | `python3 tools/losttest.py` | 描画コンテキストを 3 回強制的に失わせ、画質を下げて再開するかを確かめる |
| `audiochk.py` | `python3 tools/audiochk.py` | `audiotest.js` で 11 種の音をオフラインで合成し、ピークとスペクトルを計算する。WAV も書き出す |
| `daysim.py` | `python3 tools/daysim.py` | 群れだけを 4 つの時刻で 30 分ぶんずつ走らせ、行動ごとの時間の割合を出す |
| `diag.py` | `python3 tools/diag.py <JS ファイル>` | 起動したアプリの中で JS を評価し、結果を出す |
| `hshot.py` | `python3 tools/hshot.py <出力の接頭辞> "<クエリ>"` | 人だけを並べた確認ページ（`dev/human_test.html`）を撮る。実行中だけ `app/` にページを写す |

`choreo/` は、ページ内で実行する演出と操作です。

| ファイル | 内容 |
| --- | --- |
| `flow.js` | 全視点の切り替え、エサ、手たたき、手動飛行、夜への切り替えを順に行う。確認用 |
| `kimono_clip.js` | 動画の冒頭のカット。着物の人の道筋のうちハトが多い場所にエサをまき、人が近づくまで進めてから、地面から 17 cm の高さにカメラを置く |
| `wall.js` | 壁から指定した距離にカメラを置く。`WX` と `DIST` を数値に置き換えて使う |
| `night_dolly.js` | 夜のカット。`free=` で指定したカメラを、新橋通に沿って毎秒 1.1 m で東へ進める |
| `noop.js` | 何もしない |

## 動画のクリップ

`media/clips` のクリップは、次のコマンドで録画しました。出力先は読み替えてください。

```sh
# ハトの目
python3 tools/rec2.py media/clips/v21_clip_1_hato_no_me.mp4 "auto=1&m=eye&t=9.6&tex=30" 122 1280x720 30 8795 tools/choreo/noop.js 14
# 一斉飛翔を俯瞰で
python3 tools/rec2.py media/clips/v21_clip_3_flush_overview.mp4 "auto=1&m=over&t=9.6&tex=30&orb=0.9,0.95,24&clapAt=1.4" 150 1280x720 30 8795 tools/choreo/noop.js 14
# 先斗町
python3 tools/rec2.py media/clips/v21_clip_5_pontocho.mp4 "auto=1&m=cine&crane=1&t=15.5&tex=30" 132 1280x720 30 8795 tools/choreo/noop.js 14
# 夜の祇園・新橋通（v27）
python3 tools/rec2.py media/clips/v27_clip_4_gion_night.mp4 "auto=1&t=20&tex=30&free=169.5,4.1,-64.3,236,4.6,-60.9,46" 162 1280x720 30 8795 tools/choreo/night_dolly.js 14
```

冒頭の祇園のカットは `kimono_clip.js` を使って録画しました。祇園のカットと鴨川のカットは以前のビルドで録画したもので、コマンドは残っていません。夜のカットは v27 で撮り直しました。v11 で録画した以前のカット（`v11_clip_4_gion_night.mp4`）は、壁や看板が実際より強く光っているので、動画には使っていません。どのビルドで撮ったかは [media/README.md](../media/README.md) にあります。
