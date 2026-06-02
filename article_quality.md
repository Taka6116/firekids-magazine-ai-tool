# FIRE KIDS Magazine 記事品質基準

このドキュメントは、記事の品質を一定以上に保つための詳細な基準です。
すべてのエージェントは記事完成時にこのチェックリストを実行してください。

---

## 1. 情報ソースの厳密性

### 必須
- 記事内の事実情報は**すべて** `FK記事作成用.xlsx` のBodyフィールドに由来すること
- 商品説明文からの引用は「」で囲む
- 引用元の商品を特定できる情報（ブランド名、Ref番号、年代等）を明記する
- **FK番号（FK000002等）は一切含めない**

### 禁止
- AIの一般知識による事実の補完
- Wikipedia・個人ブログ等の外部情報を記事本文に使用（ファクトチェック目的は可）
- 「一般的に〜と言われている」等の曖昧な出典の記述
- 商品説明に書かれていない仕様・歴史・評価の記載

---

## 2. 構成・文章品質

### 記事構成の標準パターン
```
h2: 導入（フック＋記事の目的）
h2: メインテーマ解説
  h3: サブトピック1（商品説明引用を含む）
  h3: サブトピック2
  h3: サブトピック3
h2: 実践的なアドバイス / まとめ
h2: よくある質問（FAQ）× 3〜5問
CTA: ブランドカテゴリページリンク
関連記事リンク
```

### 文章チェック項目
- [ ] 導入文で**読者が誰か**（既所有者 / 購入検討者）を明確にしている
- [ ] 各セクションに**商品説明からの具体的引用**が最低1つある
- [ ] 同じ情報の繰り返しがない（導入・本文・まとめで同一文を使い回さない）
- [ ] 販売促進的な表現がない（「在庫多数」「お買い得」「今がチャンス」等）
- [ ] 「FIRE KIDSでは〜」の言及は記事全体で2〜3回以内に抑える
- [ ] 専門用語には読者目線の補足がある
- [ ] 文字数: 本文3,000〜5,000文字（メタ情報・JSON-LD除く）

---

## 3. SEOメタ情報

### メタ情報コメントブロック
記事冒頭の `<!-- ... -->` 内に以下を必ず含める:

| 項目 | 形式 | 備考 |
|------|------|------|
| title | 「記事タイトル｜FIRE KIDS Magazine」 | 60文字以内推奨 |
| meta_description | 記事内容の要約 | 120文字以内 |
| meta_keywords | メインKW + 関連KW2〜3 + 「ヴィンテージ時計」「FIRE KIDS」 | カンマ区切り |
| canonical_url | `https://m.firekids.jp/{slug}` | 英語スラッグ |
| og:title | titleと同一 | — |
| og:description | meta_descriptionと同一または短縮版 | — |
| og:type | `article` | 固定 |
| og:url | canonical_urlと同一 | — |
| og:image | `https://cdn.firekids.jp/products/...` | 記事代表画像 |
| og:site_name | `FIRE KIDS Magazine` | 固定 |
| og:locale | `ja_JP` | 固定 |
| twitter:card | `summary_large_image` | 固定 |
| twitter:title | og:titleと同一 | — |
| twitter:description | og:descriptionと同一 | — |
| twitter:image | og:imageと同一 | — |

### JSON-LD構造化データ
- **Article スキーマ**: headline, description, image, author, publisher, datePublished, dateModified
- **FAQPage スキーマ**: FAQ各項目をQuestion/AcceptedAnswer形式で記述
- `author.name`: `"FIRE KIDS"`
- `publisher.name`: `"FIRE KIDS Magazine"`
- `publisher.url`: `"https://m.firekids.jp/"`

---

## 4. HTML形式（Gutenberg準拠）

### ブロック対応表
| ブロック | 開始タグ | 終了タグ |
|---------|---------|---------|
| 段落 | `<!-- wp:paragraph -->` | `<!-- /wp:paragraph -->` |
| 見出し2 | `<!-- wp:heading {"level":2} -->` | `<!-- /wp:heading -->` |
| 見出し3 | `<!-- wp:heading {"level":3} -->` | `<!-- /wp:heading -->` |
| テーブル | `<!-- wp:table -->` | `<!-- /wp:table -->` |
| リスト | `<!-- wp:list -->` | `<!-- /wp:list -->` |
| 画像 | `<!-- wp:image {...} -->` | `<!-- /wp:image -->` |
| HTML | `<!-- wp:html -->` | `<!-- /wp:html -->` |
| ボタン | `<!-- wp:buttons -->` | `<!-- /wp:buttons -->` |

### HTMLチェック項目
- [ ] すべてのGutenbergブロックの開始・終了タグが正しく対応している
- [ ] `<!-- /wp:paragraph -->` 等のタグに誤字がない（`<!-- /wp:parameter>` 等のミス注意）
- [ ] テーブルは `<figure class="wp-block-table"><table>` 形式
- [ ] リストは `<ul class="wp-block-list">` 形式
- [ ] 画像は `<figure class="wp-block-image size-full">` 形式
- [ ] CTAボタンは `<!-- wp:buttons -->` ブロック内

---

## 5. 画像

- 画像URLは `cdn.firekids.jp` ドメインのみ使用
- `scripts/fetch_images.py` で取得したURLを使用
- alt属性にはセクション見出しまたは商品名を設定
- 記事内に最低3枚の画像を含める（代表画像 + セクション画像）

---

## 6. X投稿文の品質基準

- 280文字程度を目安
- 記事本文のコピペではなく、X向けに再構成する
- 記事内の具体的な事実・数値を含める
- URLは含めない
- ハッシュタグは含めない（方針変更済み）
- 「FIRE KIDSでは実際に手に取ってご覧いただけます」等のCTAを含める
- 💬 エンゲージメント質問で締める

---

## 7. 重複防止

### 新規記事作成前の確認手順
1. `data/article_plan_200.md` で計画済みテーマを確認
2. `articles/` フォルダで既存記事のファイル名・内容を確認
3. テーマが重複する場合は、切り口を変えるか統合を検討
4. 類似テーマ（例: 「サブマリーナ 5512」と「サブマリーナ 5512・5513」）は差別化ポイントを明確にする

### 既存記事との関係
- 内部リンク（関連記事リスト）で既存記事を参照する
- canonical_urlが既存記事と重複しないよう確認する
