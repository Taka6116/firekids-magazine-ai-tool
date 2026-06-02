# 記事HTMLフォーマット仕様書

他のAIエージェント（Claude/GPT/Gemini等）でHTML生成を担当する際のフォーマット仕様のみをまとめた資料。

**対象:** 記事HTMLの構造・装飾・JSON-LD仕様のみ
**最終更新:** 2026-04-24

---

## 1. HTML全体構造

```
[1] メタ情報コメント（<!-- ... -->）
[2] JSON-LD構造化データ（4〜5種類）
[3] 本文（Gutenbergブロック形式）
  ├─ H1タイトル
  ├─ リード文ボックス
  ├─ 目次（TOC）
  ├─ 画像（冒頭）
  ├─ <hr>
  ├─ H2セクション1（id=sec-1）
  │  └─ 段落/テーブル/h3カード等
  ├─ <hr>
  ├─ ...（繰り返し）
  ├─ 画像（中盤）
  ├─ CTAボタン1（中盤）
  ├─ <hr>
  ├─ 「こんな方におすすめ」カード群
  ├─ FAQカード群
  ├─ <hr>
  ├─ まとめハイライト
  ├─ 画像（後半）
  └─ CTAボタン2（末尾）
```

---

## 2. メタ情報ヘッダー（HTMLコメント形式）

```html
<!--
title: {記事タイトル}｜{サイト名}
meta_description: {130-150字}
meta_keywords: {カンマ区切り5-10個}
og:title: {記事タイトル}｜{サイト名}
og:description: {metaと同じ}
og:type: article
og:image: {1枚目画像URL}
og:site_name: {サイト名}
og:locale: ja_JP
twitter:card: summary_large_image
twitter:title: {記事タイトル}
twitter:description: {metaと同じ}
twitter:image: {1枚目画像URL}
-->
```

**含めないもの:**
- `canonical_url`
- `og:url`

---

## 3. JSON-LD構造化データ

`<!-- wp:html -->` で囲み、`<script type="application/ld+json">` 内に記述。

### 3-1. 必須: Article

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{記事タイトル}",
  "description": "{meta_description}",
  "image": "{1枚目画像URL}",
  "author": {"@type": "Organization", "name": "{発行元名}"},
  "publisher": {
    "@type": "Organization",
    "name": "{媒体名}",
    "logo": {"@type": "ImageObject", "url": "{ロゴURL}"}
  },
  "datePublished": "YYYY-MM-DD",
  "dateModified": "YYYY-MM-DD",
  "inLanguage": "ja",
  "keywords": "{カンマ区切りKW}",
  "about": [
    {"@type": "Brand", "name": "{ブランド名}"},
    {"@type": "Product", "name": "{モデル名}", "brand": {"@type":"Brand","name":"{ブランド名}"}},
    {"@type": "Thing", "name": "{技術用語}"}
  ]
}
```

#### about 配列ルール
- 最大5件
- 優先順位: Brand > Product > Thing
- Brand: ブランド名
- Product: モデル名（brand属性でブランドを紐付け可）
- Thing: 技術用語・文化的概念
- `sameAs` は付与しない

### 3-2. 必須: BreadcrumbList（4階層）

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "{サイトトップ名}", "item": "{サイトURL}"},
    {"@type": "ListItem", "position": 2, "name": "すべての記事", "item": "{記事一覧URL}"},
    {"@type": "ListItem", "position": 3, "name": "{カテゴリ名}", "item": "{カテゴリURL}"},
    {"@type": "ListItem", "position": 4, "name": "{記事タイトル}"}
  ]
}
```

### 3-3. 条件付き: FAQPage（FAQセクションがある場合）

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{質問}",
      "acceptedAnswer": {"@type": "Answer", "text": "{回答}"}
    }
  ]
}
```

### 3-4. 条件付き: DefinedTermSet（定義用語が2件以上）

```json
{
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "name": "{用語集名}",
  "hasDefinedTerm": [
    {
      "@type": "DefinedTerm",
      "name": "{用語}",
      "description": "{本文からの定義抜粋のみ}",
      "inDefinedTermSet": "{用語集名}"
    }
  ]
}
```

### 3-5. 条件付き: ItemList + Product（複数モデル紹介記事）
### 3-6. 条件付き: HowTo（手順解説記事）

### 3-7. JSON-LD禁止事項
- `@id` 使用禁止
- `mainEntityOfPage` 使用禁止
- ItemList・DefinedTermの description は本文抜粋のみ（新規生成禁止）
- `about` の `sameAs` 付与禁止

---

## 4. Gutenbergブロック テンプレート集

### 4-1. H1タイトル

```html
<!-- wp:heading {"level":1} -->
<h1 style="font-size:26px;color:#1a1a1a;font-weight:700;letter-spacing:0.02em;margin:20px 0 10px;">{タイトル}</h1>
<!-- /wp:heading -->
```

### 4-2. H2見出し（id付与）

```html
<!-- wp:heading -->
<h2 id="sec-N" style="border-left:4px solid #1a1a1a;padding:2px 0 2px 14px;margin:44px 0 22px;font-size:23px;color:#1a1a1a;font-weight:700;letter-spacing:0.02em;">{見出し}</h2>
<!-- /wp:heading -->
```

### 4-3. H3見出し

```html
<!-- wp:heading {"level":3} -->
<h3 style="font-size:18px;color:#1a1a1a;font-weight:700;margin:28px 0 12px;">{見出し}</h3>
<!-- /wp:heading -->
```

### 4-4. 段落

```html
<!-- wp:paragraph -->
<p>{本文}。強調箇所は<strong>タグで。</p>
<!-- /wp:paragraph -->
```

### 4-5. 画像（角丸2pxのみ）

```html
<!-- wp:image {"sizeSlug":"large","className":"is-resized"} -->
<figure class="wp-block-image size-large is-resized"><img src="..." alt="..." style="width:480px;border-radius:2px;"/></figure>
<!-- /wp:image -->
```

### 4-6. テーブル

```html
<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><tbody>
<tr><td><strong>項目</strong></td><td><strong>仕様</strong></td></tr>
<tr><td>...</td><td>...</td></tr>
</tbody></table></figure>
<!-- /wp:table -->
```

### 4-7. 箇条書きリスト

```html
<!-- wp:list -->
<ul class="wp-block-list">
<li>項目1</li>
<li>項目2</li>
</ul>
<!-- /wp:list -->
```

### 4-8. セクション区切り

```html
<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator is-style-wide" style="border-color:#e8e4de;"/>
<!-- /wp:separator -->
```

### 4-9. CTAボタン（**絶対に改変しない**）

```html
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="{URL}">{ボタンテキスト}</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
```

**CTAルール:**
- `style` 属性・`backgroundColor` 属性の追加禁止
- ボタンテキストに `→` 等の矢印記号追加禁止
- WordPressテーマ側のデフォルトスタイルに任せる
- **必ず中盤と末尾の2箇所に配置**

---

## 5. GEO最適化ブロック（装飾）

### 5-1. リード文ボックス（冒頭の導入段落をラップ）

```html
<!-- wp:html -->
<div style="background:#f7f5f2;border-left:3px solid #1a1a1a;padding:26px 30px;margin:28px 0;border-radius:2px;">
<p style="font-size:17px;font-weight:600;color:#1a1a1a;margin:0 0 14px;line-height:1.7;">{冒頭の問いかけ}</p>
<p style="margin:0 0 12px;line-height:1.9;color:#3a3a3a;">{補足段落}</p>
<p style="margin:0;font-size:15px;font-weight:600;color:#5a5248;line-height:1.7;">{記事の目的文}</p>
</div>
<!-- /wp:html -->
```

### 5-2. 目次（TOC）- H1直後に配置

```html
<!-- wp:html -->
<nav style="background:#fafafa;border:1px solid #e8e4de;padding:20px 24px;margin:24px 0;border-radius:2px;" aria-label="目次">
<p style="font-weight:700;margin:0 0 10px;font-size:14px;color:#1a1a1a;letter-spacing:0.08em;">目次</p>
<ol style="margin:0;padding-left:22px;line-height:2;color:#3a3a3a;font-size:14.5px;">
<li><a href="#sec-1" style="color:#1a1a1a;text-decoration:none;border-bottom:1px solid #c8c0b4;">{見出し}</a></li>
</ol>
</nav>
<!-- /wp:html -->
```

### 5-3. 「おすすめNN」カード（リスト形式記事の各モデルH2の代わり）

```html
<div style="background:#ffffff;border:1px solid #e8e4de;border-radius:3px;padding:28px 30px;margin:32px 0;">
<div style="display:inline-block;background:#1a1a1a;color:#fff;padding:5px 12px;font-size:12px;font-weight:600;letter-spacing:0.1em;margin-bottom:12px;">おすすめ 0N</div>
<h2 id="model-N" style="margin:0;font-size:23px;color:#1a1a1a;line-height:1.4;font-weight:700;">{モデル名}<br><span style="font-size:15px;color:#5a5248;font-weight:500;">({サブタイトル})</span></h2>
</div>
```

### 5-4. 「こんな方におすすめ」カード（ペルソナ見出し）

```html
<div style="background:#f7f5f2;border-radius:3px;padding:22px 26px;margin:18px 0;border-top:2px solid #1a1a1a;">
<h3 style="margin:0 0 10px;font-size:17px;color:#1a1a1a;font-weight:700;">{ペルソナ見出し}</h3>
<p style="margin:0;line-height:1.9;color:#3a3a3a;">{本文}</p>
</div>
```

### 5-5. FAQカード（常に展開、`<details>` 使用禁止）

```html
<div style="background:#fff;border:1px solid #e8e4de;border-radius:3px;padding:18px 22px;margin:10px 0;">
<p style="font-weight:600;font-size:15.5px;color:#1a1a1a;margin:0;line-height:1.6;">
<span style="color:#5a5248;margin-right:8px;font-weight:700;">Q.</span>{質問}
</p>
<p style="margin:12px 0 0;padding-top:12px;border-top:1px dashed #e8e4de;line-height:1.9;color:#3a3a3a;"><strong style="color:#5a5248;">A.</strong> {回答}</p>
</div>
```

### 5-6. まとめハイライトボックス

```html
<div style="background:#f7f5f2;border-radius:3px;padding:22px 26px;margin:18px 0;border-left:3px solid #1a1a1a;">
<p style="margin:0;line-height:2;color:#1a1a1a;font-size:15.5px;">{まとめ本文}</p>
</div>
```

---

## 6. カラーパレット

| 用途 | カラーコード |
|---|---|
| メインアクセント（見出し左線・バッジ背景） | `#1a1a1a` |
| サブアクセント（Q/A記号・サブタイトル） | `#5a5248` |
| 背景ボックス（リード文・おすすめカード・まとめ） | `#f7f5f2` |
| TOC背景 | `#fafafa` |
| ボーダー（カード枠・区切り線） | `#e8e4de` |
| TOCリンク下線 | `#c8c0b4` |
| 本文テキスト | `#3a3a3a` |
| 強調テキスト | `#1a1a1a` |

**禁止スタイル:**
- グラデーション
- box-shadow
- 角丸3pxを超える（2-3pxまで）
- 上記パレット以外の色

---

## 7. CTAリンク仕様

### 基本ルール
- CTAリンクベースURLとUTMパラメータは運用者から別途提供される
- ボタンテキストはリンク先カテゴリに合わせて統一
- UTMパラメータは必ず付与する

### CTAリンクの精密化ルール（記事内容に紐づける）

ベースURL構造:
```
https://firekids.jp/products/list?category_id={ID}&name={検索語}&utm_*
```

| 記事タイプ | name= 指定 | 例 |
|---------|-----------|---|
| 単一モデル解説（Ref/Cal特化記事） | モデル名 or Ref番号 | `&name=デイトジャスト`、`&name=Ref.1601` |
| ブランド入門/人気モデル一覧 | 指定なし（ブランド全体） | `category_id=8` のみ |
| やめとけ/恥ずかしい/ダサい系コラム | 指定なし（押しつけ感回避） | `category_id=8` のみ |
| 比較系記事 | 主要片方のモデル名 | `&name=サブマリーナ` |
| テーマ記事（複数ブランド横断） | 指定なし（トップページ） | `https://firekids.jp/?utm_*` |

### CTA配置数（押しつけリスク低減のため最小増加）

| 記事タイプ | CTA箇所数 | 配置位置 |
|---------|----------|----------|
| 単一モデル解説 | **2箇所**（変更なし） | 中盤 + まとめ後 |
| 複数モデル比較・人気モデル一覧 | **3箇所**（+1） | 中盤 + 主要モデルセクション後 + まとめ後 |
| ブランド入門 | **3箇所**（+1） | 中盤 + 代表モデル紹介後 + まとめ後 |
| やめとけ/恥ずかしい/ダサい系コラム | **2箇所**（変更なし） | 中盤 + まとめ後 |
| テーマ記事 | **2箇所**（変更なし） | 中盤 + まとめ後 |

**重要:** 3箇所目を追加する場合も、押しつけにならないよう「主要モデルを語った直後の自然な流れ」で配置する。

### ボタンテキスト精密化

| 記事タイプ | テキスト例 |
|---------|----------|
| 単一モデル | 「FIRE KIDS デイトジャストの取扱一覧」 |
| Ref特化 | 「FIRE KIDSで Ref.1601 を見る」 |
| 比較系の各モデル | 「FIRE KIDS の{モデル名}一覧」 |
| ブランド入門/コラム | 「FIRE KIDS {ブランド名}の商品一覧はこちら」（既存統一テキスト） |

### URL別計測について
URL別のCV計測は**不要**。UTMパラメータはすべて同じ値を使用（`utm_content` 等のセグメント分けは付与しない）。

---

## 8. 画像配置ルール

### 枚数・位置
- 最小3枚
- 1枚目を `og:image` / `twitter:image` / JSON-LD `image` に使用
- 配置: 冒頭（導入後） / 中盤（3-4セクション目後） / 後半（まとめ前）

### 仕様
- 画像URLは運用者から提供される
- 幅: `width:480px`
- 装飾: `border-radius:2px` のみ（box-shadow等禁止）
- alt属性: 記事テーマに即した自然な記述

---

## 9. 本文テキスト処理ルール

### 9-1. ダブルクオーテーション
本文中の `"` は削除または `「」` に置換。

### 9-2. 太字変換
Markdownの `**太字**` を `<strong>` に変換。

### 9-3. 強調対象（`<strong>` 推奨箇所）
- モデル名
- Ref番号
- Cal番号
- ケースサイズ
- 素材表記
- 特徴的な名詞句

---

## 10. HTML出力前チェックリスト

### 必須条件
- [ ] メタ情報コメントブロック配置、`canonical_url` / `og:url` を**含まない**
- [ ] JSON-LD Article + BreadcrumbList 含有
- [ ] FAQ があれば FAQPage 追加
- [ ] 定義用語2件以上なら DefinedTermSet 追加
- [ ] JSON-LDに `@id` / `mainEntityOfPage` が含まれていない
- [ ] Article `about` が配列、Brand/Product/Thing最大5件、`sameAs`なし
- [ ] DefinedTerm description が本文抜粋のみ

### 構造
- [ ] H1直後にTOC、各H2に `id="sec-N"` 付与
- [ ] H2左ボーダー装飾（`#1a1a1a` 4px）
- [ ] 段落・テーブル・リストは Gutenbergブロック形式
- [ ] セクション区切りに `<hr>` 配置
- [ ] 画像3枚以上、`border-radius:2px` のみ、box-shadow禁止
- [ ] CTAボタン2箇所（中盤・末尾）、Gutenbergデフォルト形式維持
- [ ] CTAリンクにUTMパラメータ付与
- [ ] CTAボタンに `style` 属性・矢印記号が追加されていない

### スタイル
- [ ] カラーパレット指定色以外を使用していない
- [ ] グラデーション・box-shadow 未使用
- [ ] 角丸は2-3pxまで

### テキスト
- [ ] `"` を除去または `「」` に置換
- [ ] `**太字**` を `<strong>` に変換

---

## 11. 他AIエージェント向け呼び出しプロンプトテンプレート

```markdown
以下のTXTを指定フォーマットのHTMLに変換してください。
仕様書: HANDOVER_HTML_GENERATION.md を参照

入力:
- TXTファイル: {パス}
- 画像URL 3枚: [URL1, URL2, URL3]
- CTAリンク: {URL}
- ボタンテキスト: {テキスト}
- カテゴリ名: {カテゴリ}

必須:
1. 仕様書§2のメタ情報
2. 仕様書§3のJSON-LD（Article + BreadcrumbList + 条件付きFAQPage/DefinedTermSet）
3. 仕様書§4のGutenbergブロック
4. 仕様書§5のGEO装飾（リード文/TOC/H2装飾/カード/FAQカード/まとめ/hr）
5. 仕様書§10のチェックリスト全項目クリア

出力: HTMLファイル1本
```
