# 舞台選びの調査

PLATEAU の LOD3 建築物のうち、壁のテクスチャが最も細かい地域を探すために使ったスクリプトと、その結果です。結論と数値は [docs/article.md](../docs/article.md) の「なぜ京都・先斗町か」にあります。

調査の流れは次のとおりです。

1. PLATEAU のデータカタログ API の応答を保存し、LOD3 の建築物 3D Tiles を持つ市区を洗い出す（`cat1.py`、`cat2.py`、`cat3.py`）
2. 候補の 3D Tiles を取得する（`fetch.sh`）
3. タイルを読み、LOD3 の棟数と分布を集計する（`scan.py`、`lodscan.py`、`lod3map.py`、`lod3map_b3dm.py`）
4. 有力な候補について、テクスチャの画素密度を面積で重み付けして測る（`../pipeline/texstat.mjs`）

## スクリプト

| ファイル | 内容 |
| --- | --- |
| `cat1.py`、`cat2.py`、`cat3.py` | データカタログ（`datasets.json`）を、種類・市区・LOD で絞り込んで一覧にする |
| `fetch.sh` | データセット ID を指定して、tileset.json と葉タイルをすべて取得する |
| `leaves.py` | tileset.json をたどり、葉タイルの URI を列挙する |
| `ts.py`、`roi.py` | tileset の概要を表示する。経緯度の範囲に入るタイルを選ぶ |
| `b3dminfo.py`、`glbinfo.py` | b3dm と glb の中身（特徴テーブル、メッシュ、テクスチャ）を表示する |
| `scan.py`、`lodscan.py` | LOD ごとの棟数を集計し、LOD3 の建物が密集している場所を挙げる |
| `lod3map.py`、`lod3map_b3dm.py` | LOD3 の建物ごとの位置、用途、計測高さを `feats_<データセット ID>.json` に書き出す。glb のタイル用と b3dm のタイル用 |
| `tiles.py` | パイプラインが使うタイル（地理院タイルと PLATEAU オルソ画像）の URL と保存先の一覧を作る |

## 結果

`feats_*.json` は、LOD3 の建物ごとの経緯度、名称、用途、計測高さ、タイル名の一覧です。対象は東京都港区（13103）、台東区（13106）、墨田区（13107）、静岡県沼津市（22203）、京都市中京区（26104）、東山区（26105）です。国土交通省 Project PLATEAU の 3D 都市モデルを加工して作成したもので、出典と利用条件は [NOTICE.md](../NOTICE.md) にあります。

## 取得先

データカタログと 3D Tiles は、PLATEAU VIEW のデータカタログ API から取得しました。保存先は `../pipeline/dl`（環境変数 `HATO_DL` で変更可）です。

```sh
mkdir -p ../pipeline/dl/catalog
curl -o ../pipeline/dl/catalog/datasets.json https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets
./fetch.sh 26104_bldg_lod3
```

調査では 22 市区ぶん、約 11 GB を取得しました。作品に使ったのは京都市の 8 データセット、約 1 GB です。
