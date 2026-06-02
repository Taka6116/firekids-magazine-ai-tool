# CLINEへの指示テンプレート（コピペして使用）

このファイルをコピーして、CLINEのチャットに貼り付けてください。
`[　]` の部分を記事に合わせて書き換えてから使用します。

---

## 【標準テンプレート】SEO記事作成指示

```
以下の条件でSEO記事を作成してください。

■ 記事テーマ：[例：ヴィンテージ グランドセイコーの魅力と選び方]
■ 対象ブランド：[例：SEIKO]
■ キーワード：[例：グランドセイコー]
■ データソース：MCPforSEO/data/FK記事作成用.xlsx

■ 記事の条件：
- 文体：https://m.firekids.jp/ の記事に合わせた丁寧語・専門的トーン
- 文字数：3,000〜5,000文字
- 構成：導入→歴史→世代別解説→選び方→FAQ→まとめ
- 個別商品リンクは使用しない（販売状況が変動するため）
- 末尾CTAリンク：https://firekids.jp/products/list?category_id=[ブランドID]
- 相場価格は記載しない

■ ファクトチェック（3段階方式）：
- 【一次照合】まず data/caliber_db.json を読み込み、記事内のCal.番号・Ref.番号・振動数・石数・製造年を照合する
- 【二次照合】caliber_db.json に未登録の項目は、data/FK記事作成用.xlsx のBodyフィールドに記載された仕様（巻き方式、Cal.番号等）と照合する。xlsxに「自動巻き」と記載があるキャリバーを「手巻き付き」と記載してはならない
- 【三次照合】caliber_db.json にも xlsx にも記載がない項目のみ、FIRE KIDSサイト内の情報で確認する：
  - https://firekids.jp/ および https://m.firekids.jp/ の商品ページ・記事ページのみ参照可
  - 外部サイト（Ranfft DB、セイコーミュージアム等）は使用しない
  - Webソースを使用した場合は出典URLを記事生成ログに記録すること
- 【禁止事項チェック】
  - 相場価格の記載なし・個別商品リンクなし・CTAリンクがブランドカテゴリページであることを確認
  - caliber_db.json / xlsx / Webソースのいずれにも裏付けがない仕様・機能・歴史的事実が含まれていないことを確認
  - AIの一般知識で補完した疑いがある箇所はフラグを立てて報告
- 不一致・追記推奨があればフラグを立てて報告
- レポートテンプレート：templates/factcheck_template.md に従って出力

■ 出力形式：TXT + HTML（ブランド別フォルダに保存）
- TXT版（Markdown形式）：MCPforSEO/articles/[ブランド名]/article_[スラッグ].txt
- HTML版（WordPress投稿用）：MCPforSEO/articles/[ブランド名]/article_[スラッグ].html
- ブランド名フォルダ：SEIKO / OMEGA / ROLEX / OTHER
- HTMLテンプレート：MCPforSEO/templates/article_html_template.html に従う
- テーブル・リスト・見出し（h2/h3）・強調（strong）を適切に使用する
- CTAリンクは <a href="..."> タグで出力する

■ SEOメタ構文（HTML版に含める・記事内容から自動生成）：
- title：「[記事タイトル]｜FIRE KIDS Magazine」形式
- meta_description：記事の導入文から120文字以内で要約（検索意図に応える内容）
- meta_keywords：メインキーワード + 関連キーワード2〜3個 + 「ヴィンテージ時計」「FIRE KIDS」
- Open Graph（og:title, og:description, og:type, og:url, og:site_name）
- Twitter Card（twitter:card, twitter:title, twitter:description）
- JSON-LD構造化データ：Article スキーマ + FAQPage スキーマ（FAQ セクションの内容から自動生成）
- ※ メタ情報はHTMLコメント内にまとめて出力し、WordPressのSEOプラグインに転記可能な形式にする

■ 画像（CDN自動取得）：
- 記事作成前に以下のコマンドで関連商品のCDN画像URLを取得する：
  python3 MCPforSEO/scripts/fetch_images.py [ブランド] [キーワード]
  例: python3 MCPforSEO/scripts/fetch_images.py SEIKO グランドセイコー
- 出力されたJSONファイル（data/images_[ブランド]_[キーワード].json）から記事に適した画像を選択する
- 画像URLは cdn.firekids.jp ドメインを使用する
- WordPress形式で挿入：<!-- wp:image --> ブロックを使用
- alt属性はセクション見出しまたは商品名を設定する

■ ファクトチェックレポート保存先：MCPforSEO/factcheck_logs/[ブランド名]/factcheck_[スラッグ].md
```

---

## ブランド別カテゴリID早見表

| ブランド | category_id | CTAリンク |
|---------|------------|---------|
| ロレックス | 8 | https://firekids.jp/products/list?category_id=8 |
| オメガ | 9 | https://firekids.jp/products/list?category_id=9 |
| セイコー | 10 | https://firekids.jp/products/list?category_id=10 |
| シチズン | 11 | https://firekids.jp/products/list?category_id=11 |
| IWC | 12 | https://firekids.jp/products/list?category_id=12 |
| チューダー | 13 | https://firekids.jp/products/list?category_id=13 |
| カルティエ | 17 | https://firekids.jp/products/list?category_id=17 |
| 新着共通 | - | https://firekids.jp/products/list?orderby=2&status[]=1 |

---

## 【X長文投稿生成テンプレート】記事から長文投稿を作成

記事作成後、以下をCLINE/Claude Codeのチャットに貼り付けてX長文投稿を生成します。
`[　]` の部分を記事に合わせて書き換えてから使用します。

```
以下の条件で、完成記事からX長文投稿を生成してください。

■ 対象記事ファイル：MCPforSEO/articles/[ブランド名]/article_[スラッグ].html
■ 対象ブランド：[例：SEIKO]
■ 参照テンプレート：MCPforSEO/templates/x_post_templates.md

■ 生成条件：
- 記事本文をベースに、Xプレミアム長文投稿（1,500〜3,000文字）を1本生成する
- 記事の主要セクション（3〜5セクション）を選定し、見出し＋本文の構成で作成する
- テーブルは箇条書き（・）に変換する
- HTMLタグ・Gutenbergブロックタグはすべて除去する
- URLは含めない（X上の単独コンテンツとして投稿）
- ハッシュタグは使わない
- 相場価格は記載しない
- 個別商品リンクは使用しない
- FK番号は含めない
- トーン：記事本文と同様の専門性ある文体。段落を短くしX上での視認性を高める
- 末尾に「FIRE KIDSでは実際に手に取ってご覧いただけます。」＋💬読者への問いかけ

■ 画像：
- 記事の代表画像をダウンロード済みの場合：data/images/[スラッグ].jpg を投稿時に冒頭画像として添付
- 未ダウンロードの場合：以下のコマンドで取得
  python3 MCPforSEO/scripts/download_article_images.py articles/[ブランド名]/article_[スラッグ].html

■ 保存先：MCPforSEO/x_posts/[ブランド名]/x_[スラッグ].md
```

---

## 記事候補リスト（優先度順）

### SEIKO
1. ヴィンテージ グランドセイコーの魅力と選び方【完全ガイド】 ✅作成済み
2. キングセイコー 全モデル解説｜1960〜70年代の名機を徹底比較
3. セイコー ダイバーズウォッチ 150m・300m の歴史と現在の価値
4. ロードマーベル・ロードマチックとは？セイコー中級機の傑作を解説
5. セイコー クラウン（Crown）の特徴と買い方｜1960年代の高級機
6. セイコーマチック・セイコー自動巻きの歴史｜1960〜70年代の技術革新
7. セイコー 5スポーツ スピードタイマー クロノグラフの魅力
8. 1960年代セイコーの名作まとめ｜アンティーク腕時計入門ガイド
9. セイコー ワールドタイム・スカイライナーとは？旅行者に愛された名機
10. ヴィンテージセイコーの手巻きモデル選び方ガイド

### OMEGA
1. ヴィンテージ オメガ コンステレーション 完全ガイド｜Cライン・パイ盤の魅力
2. オメガ シーマスター アンティーク 選び方｜1950〜70年代モデル徹底解説
3. スピードマスター プロフェッショナル ヴィンテージの見分け方と価値
4. オメガ Cal.564・Cal.565 搭載モデルとは？クロノメーター機の魅力
5. オメガ ジュネーブとは？シンプルな実用機の魅力と相場
6. オメガ デ・ヴィル ヴィンテージ 完全解説｜ドレスウォッチの名作
7. 1960年代オメガの名作まとめ｜黄金時代の自動巻きモデルを徹底紹介
8. オメガ シーマスター300 ヴィンテージ｜ダイバーズの原点を解説
9. オメガ 30mmキャリバー搭載モデルとは？1940〜50年代の傑作
10. オメガ スピードマスター125・マークⅡ｜希少モデルの価値と特徴

### ROLEX
1. ヴィンテージ ロレックス デイトジャスト 完全ガイド｜年代別モデル解説
2. ロレックス オイスターデイト・オイスターパーペチュアルデイト の違いと選び方
3. ロレックス エアキング ヴィンテージ｜シンプルな名機の魅力と相場
4. ロレックス チェリーニ アンティーク｜ドレスウォッチの最高峰を解説
5. ロレックス バブルバック とは？1940〜50年代の丸型ケースの魅力
6. ロレックス エクスプローラーⅠ ヴィンテージ｜冒険家の時計の歴史
7. ロレックス GMTマスター ヴィンテージ｜パイロット御用達の2タイムゾーン機
8. ロレックス サブマリーナ ヴィンテージ｜ダイバーズウォッチの王様を解説
9. ロレックス サンダーバード（ターノグラフ）とは？回転ベゼルの希少モデル
10. 1970年代ロレックス 自動巻きモデルまとめ｜Cal.1570搭載機の価値
