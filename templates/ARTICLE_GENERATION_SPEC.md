# FIRE KIDS Magazine 記事生成 完全仕様書 v2026-05-18

このドキュメントは、FIRE KIDS Magazine の WordPress 記事（HTML）と X 投稿用画像を、**任意のAIエージェントが同等以上の品質で生成できる**ように、構文・ルール・実装ロジックを完全網羅したものです。

参照優先順位（矛盾時は上位を優先）:
1. `data/correction_log.json`（人間チェック修正ログ）
2. `data/caliber_db.json`（キャリバー仕様DB）
3. `data/FK記事作成用.xlsx` Bodyフィールド（仕様裏付け）
4. `https://firekids.jp/` / `https://m.firekids.jp/` 内のWebソース

**外部Web情報（Wikipedia, Watchpedia, Ranfft DB 等）を本文の事実情報として直接採用してはならない。**

---

## 0. 前提情報

### 0-1. 入力ファイル
- **TXT版（マスター）**: Markdown形式 `articles/{BRAND}/article_{slug}.txt`
- TXT本文は**不変原則**。HTML化時に本文テキストを書き換えてはならない（ダブルクオート除去・CTA表記正規化のみ可）

### 0-2. 出力ファイル
| 種類 | 形式 | 保存先 |
|------|------|--------|
| HTML | WordPress Gutenberg | `articles/{BRAND}/article_{slug}.html`（公開時）／作業中は sandbox/work/ |
| X投稿テキスト | Markdown | `x_posts/{BRAND}/x_{slug}.md` |
| X投稿用画像 | JPEG 1200x480 (5:2) | `~/Desktop/x_images_{YYYY-MM-DD}/{番号}_x_{slug}.jpg` |

### 0-3. ブランドカテゴリID
| ブランド | ja名 | category_id | brand_path |
|---------|-----|------------|-----------|
| ロレックス | ロレックス | 8 | rolex |
| オメガ | オメガ | 9 | omega |
| セイコー | セイコー | 10 | seiko |
| シチズン | シチズン | 11 | citizen |
| IWC | IWC | 12 | iwc |
| チューダー | チューダー | 13 | tudor |
| オリエント | オリエント | 14 | orient |
| ロンジン | ロンジン | 15 | longines |
| ジャガー・ルクルト | ジャガー・ルクルト | 16 | jaeger-lecoultre |
| カルティエ | カルティエ | 17 | cartier |
| ユニバーサルジュネーブ | ユニバーサルジュネーブ | 18 | universal-geneve |
| ブライトリング | ブライトリング | 19 | breitling |
| ヴァシュロン・コンスタンタン | ヴァシュロン・コンスタンタン | 20 | vacheron-constantin |
| テーマ/コラム | FIRE KIDS Magazine | (none/top) | column |

---

## 1. 絶対ルール（違反禁止）

### 1-1. 内部管理番号禁止
内部管理番号（パターン: `FK` + 6桁数字 / 正規表現 `FK\d{6}` ）は記事・X投稿の**いかなる箇所にも含めない**。
商品DBから引用する際はこの番号を必ず除外する。

### 1-2. 情報ソース厳守
- **AIの一般知識から記事内容を生成してはならない**
- caliber_db.json / xlsx / firekids.jp内 で裏付けが取れない仕様・年代・歴史は**書かずに省略**
- 「データベース」「DB」「Ranfft」「未登録」「確認できていない」等の内部用語を記事に出さない

### 1-3. 商品説明文の直接流用禁止
- NG「YYYY年製の〇〇は、△△の文字盤に〜と記録されています」（個別商品紹介調）
- NG「〜と評されています」「〜な個体です」「〜が取り付けてあります」「操作はスムース」
- OK「Ref.XXXXは〜という仕様で展開された」「Cal.XXXXは△石、○○振動/時の□□キャリバー」
- OK 文字盤・素材・ブレスレットは**バリエーション**として記述

### 1-4. 文体タブー
- NG「断言します」「正直に言います」「時計屋として」「避けるべきです」「絶対に〜ません」
- NG「『○○ やめとけ』で検索している方は〜」「この記事にたどり着いた方〜」（検索行動への直接言及）
- NG「店頭で〜と聞かれます」「お客様によく質問されます」（擬似エピソード）
- NG「ビジネス職にはRef.1601が万能」（職業×特定モデルの根拠なき紐付け）
- NG「○○＝格下」「○○＝恥ずかしい」（棘のある決めつけ）
- OK「〜ではないでしょうか」「〜かもしれません」「〜という選択肢もあります」（柔らかい語尾）
- OK **漢数字統一**: 「一つ目／二つ目／三つ目」（「ひとつ目」NG）
- OK 「結論から〜」は1記事最大1箇所

### 1-5. 個別商品リンク・価格禁止
- 個別商品ページURL・相場価格・販売価格は記載しない
- CTAは**ブランドカテゴリページ**（テーマ記事はトップ）にUTM付与

---

## 2. HTML構造仕様（リッチデザイン版・正式）

**この順序・形式で出力すること。任意の追加・省略は不可。**

### 2-1. SEOメタ情報コメントブロック

```html
<!-- ============================================
  SEOメタ構文（Yoast SEO / All in One SEO に転記）
============================================= -->

<!--
■ 基本メタ情報
title: [記事タイトル]｜FIRE KIDS Magazine
meta_description: [120字以内、検索意図に応える要約]
meta_keywords: [メインKW], [関連KW], ..., ヴィンテージ時計, FIRE KIDS

■ Open Graph（SNSシェア用）
og:title: [タイトル（｜FIRE KIDS Magazine 除く）]
og:description: [50〜80字のSNS向け要約]
og:type: article
og:image: [1枚目画像URL（cdn.firekids.jp）]
og:site_name: FIRE KIDS Magazine
og:locale: ja_JP

■ Twitter Card
twitter:card: summary_large_image
twitter:title: [タイトル（｜FIRE KIDS Magazine 除く）]
twitter:description: [og:description と同じ]
twitter:image: [1枚目画像URL]
-->
```

**`canonical_url` / `og:url` は出力しない**（WP側で自動付与）。

### 2-2. JSON-LD構造化データ（単一 wp:html に3つの script タグを格納）

```html
<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[タイトル（｜FIRE KIDS Magazine 除く）]",
  "description": "[meta_description と同じ]",
  "image": [
    "[1枚目画像URL]",
    "[2枚目画像URL]",
    "[3枚目画像URL]"
  ],
  "datePublished": "YYYY-MM-DD",
  "dateModified": "YYYY-MM-DD",
  "inLanguage": "ja",
  "author": {"@type": "Organization", "name": "FIRE KIDS Magazine"},
  "publisher": {
    "@type": "Organization",
    "name": "FIRE KIDS",
    "logo": {"@type": "ImageObject", "url": "https://firekids.jp/logo.png"}
  },
  "keywords": "[カンマ区切りKW文字列]",
  "articleSection": "[ブランド日本語名 or FIRE KIDS Magazine]",
  "about": [
    {"@type": "Brand", "name": "[ブランド日本語名]"},
    {"@type": "Thing", "name": "[Cal.xxx]"},
    {"@type": "Thing", "name": "[Ref.xxxx]"}
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "トップ", "item": "https://firekids.jp/"},
    {"@type": "ListItem", "position": 2, "name": "すべての記事", "item": "https://m.firekids.jp/"},
    {"@type": "ListItem", "position": 3, "name": "[ブランド名 or コラム]", "item": "https://m.firekids.jp/category/[brand_path]/"},
    {"@type": "ListItem", "position": 4, "name": "[タイトル]"}
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Q文]",
      "acceptedAnswer": {"@type": "Answer", "text": "[A文]"}
    }
  ]
}
</script>
<!-- /wp:html -->
```

- テーマ記事の `about` から Brand は省略可
- FAQが0問なら FAQPage scriptタグごと省略

### 2-3. リードカード（導入文を装飾divでラップ）

```html
<!-- wp:paragraph -->
<div style="background:#f7f5f2;border-left:3px solid #1a1a1a;padding:26px 30px;margin:28px 0;border-radius:2px;">
<p style="font-size:17px;font-weight:600;color:#1a1a1a;margin:0 0 14px;line-height:1.7;">[1段落目: テーマ提示]</p>
<p style="margin:0;font-size:15px;font-weight:600;color:#5a5248;line-height:1.7;">[2段落目: 読者対象・本記事の範囲]</p>
</div>
<!-- /wp:paragraph -->
```

### 2-4. 目次（TOC）

```html
<!-- wp:html -->
<nav style="background:#fafafa;border:1px solid #e8e4de;padding:20px 24px;margin:24px 0;border-radius:2px;" aria-label="目次">
<p style="font-weight:700;margin:0 0 10px;font-size:14px;color:#1a1a1a;letter-spacing:0.08em;">目次</p>
<ol style="margin:0;padding-left:22px;line-height:2;color:#3a3a3a;font-size:14.5px;">
<li><a href="#sec-1" style="color:#1a1a1a;text-decoration:none;border-bottom:1px solid #c8c0b4;">[セクション1]</a></li>
<li><a href="#sec-2" style="color:#1a1a1a;text-decoration:none;border-bottom:1px solid #c8c0b4;">[セクション2]</a></li>
<!-- 全h2セクション分 -->
</ol>
</nav>
<!-- /wp:html -->
```

### 2-5. セクション区切り（各h2前後）

```html
<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator is-style-wide" style="border-color:#e8e4de;"/>
<!-- /wp:separator -->
```

### 2-6. H2見出し（id付き＋装飾インラインスタイル）

```html
<!-- wp:heading {"level":2} -->
<h2 id="sec-N" style="border-left:4px solid #1a1a1a;padding:2px 0 2px 14px;margin:44px 0 22px;font-size:23px;color:#1a1a1a;font-weight:700;letter-spacing:0.02em;">[セクション名]</h2>
<!-- /wp:heading -->
```

### 2-7. H3見出し（プレーン）

```html
<!-- wp:heading {"level":3} -->
<h3>[サブ見出し]</h3>
<!-- /wp:heading -->
```

### 2-8. 本文ブロック

```html
<!-- 段落 -->
<!-- wp:paragraph --><p>[本文]</p><!-- /wp:paragraph -->

<!-- 箇条書き -->
<!-- wp:list -->
<ul class="wp-block-list">
<li>[項目]</li>
</ul>
<!-- /wp:list -->

<!-- テーブル -->
<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><tbody>
<tr><td><strong>[見出し列]</strong></td><td><strong>[見出し列]</strong></td></tr>
<tr><td>[セル]</td><td>[セル]</td></tr>
</tbody></table></figure>
<!-- /wp:table -->
```

### 2-9. 画像（3枚、本文セクション中に分散）

```html
<!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large is-resized"><img src="https://cdn.firekids.jp/products/[ID]/[name].jpg" alt="[詳細alt]" style="width:480px;border-radius:2px;"/></figure>
<!-- /wp:image -->
```

**配置位置**: FAQ・まとめ以外のh2セクションから1番目・2番目・5番目（5未満なら中盤）の**直後**に1枚ずつ。

### 2-10. FAQセクション（装飾divカード）

```html
<!-- wp:html -->
<div style="background:#fff;border:1px solid #e8e4de;border-radius:3px;padding:18px 22px;margin:10px 0;">
<p style="font-weight:600;font-size:15.5px;color:#1a1a1a;margin:0;line-height:1.6;">
<span style="color:#5a5248;margin-right:8px;font-weight:700;">Q.</span>[質問文]
</p>
<p style="margin:12px 0 0;padding-top:12px;border-top:1px dashed #e8e4de;line-height:1.9;color:#3a3a3a;"><strong style="color:#5a5248;">A.</strong> [回答文]</p>
</div>
<!-- 複数Q&Aは連続配置、1つの wp:html ブロックにまとめる -->
<!-- /wp:html -->
```

### 2-11. CTAボタン（中央配置・計2箇所）

```html
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="[UTM付きURL]">[CTA文言]</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
```

**配置**:
- 中間CTA: 全セクション中の前半1/3地点（FAQ・まとめ以外）
- 末尾CTA: まとめセクション後

### 2-12. CTA URL構成
```
ブランド記事: https://firekids.jp/products/list?category_id={ID}&utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic
テーマ記事:   https://firekids.jp/?utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic
```

### 2-13. ダブルクオーテーション処理
- HTML本文中に `"` `“` `”` を含めない（TXTにあればHTML化時に削除）
- 「」（かぎ括弧）は保持
- JSON-LD内・HTML属性内の `"` はそのまま

---

## 3. CTA文言設計ルール

**「商品一覧を見る」「商品一覧をチェック」のような漠然とした表現は禁止。** 必ず記事内容に紐づいた具体的な文言にする。中間CTAと末尾CTAは異なる文言。

### 3-1. パターン別CTA例

| 記事タイプ | 中間CTA | 末尾CTA |
|----------|---------|---------|
| モデル解説 | 「○○（Ref/Cal含む）をFIRE KIDSで探す」 | 「記事で紹介した○○、FIRE KIDSでの取り扱いはこちら」 |
| キャリバー解説 | 「Cal.xxx搭載モデル（A／B／C）をFIRE KIDSで探す」 | 「Cal.xxx搭載のヴィンテージ○○、FIRE KIDSでの取り扱いはこちら」 |
| コラム（基礎知識） | 「○○のヴィンテージ時計をFIRE KIDSで探す」 | 「○○の経年変化を楽しめるヴィンテージ、FIRE KIDSでの取り扱いはこちら」 |
| 入門・失敗回避 | 「失敗しない最初の一本をFIRE KIDSで探す」 | 「○○をチェック済みのヴィンテージ、FIRE KIDSでの取り扱いはこちら」 |
| 比較記事 | 「AとBを見比べるならFIRE KIDSで」 | 「AもBも、FIRE KIDSで実物写真をご確認いただけます」 |

---

## 4. 画像配置・X画像生成ルール

### 4-1. 本文画像
- 3枚をユーザー指定の `cdn.firekids.jp` URLから取得
- 配置: 1st・2nd・5th（5未満なら中盤）のh2セクション直後（FAQ・まとめ除外）
- altは「ブランド モデル名 部位」形式（例: 「オメガ スピードマスター 4thモデル Ref.ST145.012」）
- 全て `width:480px;border-radius:2px;` で統一

### 4-2. X投稿用画像（自動生成必須）
- HTML生成と**同時**に作成
- ソース: 各記事の**1枚目画像URL**（og:image と同一）
- 仕様: 1200x480（5:2）、ぼかし暗背景＋中央配置（文字盤を潰さない）
- 保存先: `~/Desktop/x_images_{YYYY-MM-DD}/{番号}_x_{slug}.jpg`

### 4-3. X画像生成ロジック（Python/PIL）

```python
from PIL import Image, ImageFilter

TARGET_W, TARGET_H = 1200, 480

def create_x_image(src_path, out_path):
    watch = Image.open(src_path).convert("RGB")
    w, h = watch.size

    # 暗いぼかし背景
    bg = watch.copy().resize((TARGET_W, TARGET_W), Image.LANCZOS)
    top = (TARGET_W - TARGET_H) // 2
    bg = bg.crop((0, top, TARGET_W, top + TARGET_H))
    bg = bg.filter(ImageFilter.GaussianBlur(radius=30))
    dark = Image.new("RGB", (TARGET_W, TARGET_H), (0, 0, 0))
    bg = Image.blend(bg, dark, 0.7)

    # 時計画像を高さ92%でリサイズ→中央配置
    watch_h = int(TARGET_H * 0.92)
    ratio = watch_h / h
    watch_w = int(w * ratio)
    watch_resized = watch.resize((watch_w, watch_h), Image.LANCZOS)
    canvas = bg.copy()
    canvas.paste(
        watch_resized,
        ((TARGET_W - watch_w) // 2, (TARGET_H - watch_h) // 2)
    )
    canvas.save(out_path, "JPEG", quality=92)
```

---

## 5. 必須構成要素（記事に必ず含めるもの）

1. 導入文（リードカード）— テーマ概要・読者対象・記事範囲を明示
2. 目次（TOC）
3. 本文セクション（h2/h3）— モデル・キャリバー・素材の解説
4. 「こんな方におすすめしたい」セクション — FAQ直前に配置（**3〜4パターン**のh3）
5. よくある質問（FAQ）— **3〜5問**
6. まとめ
7. CTAボタン（中間・末尾の2箇所）

**「関連記事」セクションは含めない**

---

## 6. 完成時チェックリスト

記事生成後、以下を全て満たすこと：

### 6-1. ルール準拠
- [ ] 内部管理番号（パターン `FK\d{6}`）が一切含まれていない
- [ ] HTML本文中にダブルクオート（`"` `“` `”`）が含まれていない
- [ ] 商品説明文の直接引用・羅列になっていない
- [ ] AIの一般知識で補った箇所がない
- [ ] 個別商品URL・相場価格が含まれていない
- [ ] 「データベース」「未登録」等の内部用語が含まれていない
- [ ] 検索行動への直接言及・擬似エピソードがない
- [ ] 強い断定調・上から目線表現がない

### 6-2. 構造
- [ ] SEOメタ情報コメントブロックがある
- [ ] JSON-LD（Article+BreadcrumbList+FAQPage）が単一wp:htmlに統合されている
- [ ] リードカードで導入文が装飾されている
- [ ] 目次（nav要素）にすべてのh2へのアンカーがある
- [ ] h2に `id="sec-N"` と装飾インラインスタイルが付与されている
- [ ] CTAボタンが2箇所（中間+末尾）に配置されている
- [ ] CTA URL が UTM付きで正しい（`utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic`）
- [ ] 画像3枚がh2セクション直後に配置（FAQ・まとめ以外）
- [ ] 「こんな方におすすめしたい」がFAQ直前にある
- [ ] FAQ 3〜5問が装飾divカードで描画されている
- [ ] 「関連記事」セクションが含まれていない

### 6-3. CTA文言
- [ ] 中間・末尾CTAが異なる文言
- [ ] 「商品一覧を見る」「商品一覧をチェック」等の漠然表現を使っていない
- [ ] 記事内容（Ref/Cal/モデル/テーマ）を含む具体的文言

### 6-4. X画像
- [ ] X画像が1200x480（5:2）で生成されている
- [ ] 各記事1枚目の画像URLから生成されている
- [ ] `~/Desktop/x_images_{YYYY-MM-DD}/{番号}_x_{slug}.jpg` に保存

### 6-5. 修正ログ
- [ ] キャリバー仕様・モデル呼称・事実関係の変更があれば `data/correction_log.json` に追記
- [ ] 書式変更のみ（クオート除去・CTA正規化）は追記不要

---

## 7. 検証スクリプト（必須実行）

```python
#!/usr/bin/env python3
import re
from pathlib import Path

for f in sorted(Path('.').glob('*.html')):
    txt = f.read_text(encoding='utf-8')
    no_script = re.sub(r'<script[^>]*>.*?</script>', '', txt, flags=re.DOTALL)
    no_comment = re.sub(r'<!--.*?-->', '', no_script, flags=re.DOTALL)
    body_only = re.sub(r'<[^>]+>', '', no_comment)
    issues = []
    if '"' in body_only: issues.append(f'ASCII"x{body_only.count(chr(34))}')
    if '“' in body_only or '”' in body_only: issues.append('全角""')
    if re.search(r'\bFK\d{6}\b', txt): issues.append('内部番号')
    if 'utm_source=firekids_magazine' not in txt: issues.append('UTM')
    if '関連記事' in txt: issues.append('関連記事セクション')
    cta = len(re.findall(r'wp-block-button__link', txt))
    if cta != 2: issues.append(f'CTA数={cta}')
    img = len(re.findall(r'wp-block-image', txt))
    if img != 3: issues.append(f'IMG数={img}')
    print(f"{f.name:<45} {'OK' if not issues else ' / '.join(issues)}")
```

---

## 8. 実装リファレンス

完全動作する変換実装: `/Users/sasakitasuku/mcp-sandbox/firekids/work/html_batch/convert.py`

### 8-1. 主要関数
| 関数 | 役割 |
|------|------|
| `parse_txt(txt)` | TXT → 中間Block表現 |
| `build_html(meta, title, blocks)` | Block → Gutenberg HTML |
| `lead_card(intro_paras)` | 導入段落 → 装飾divカード |
| `toc_block(sections)` | h2リスト → 目次nav |
| `h2_block(sec_id, text)` | h2見出し（id+装飾） |
| `faq_styled(faqs)` | FAQ → 装飾divカード |
| `cta_block(label, url)` | CTAボタン（中央レイアウト） |
| `image_block(url, alt)` | 画像（width:480px+border-radius） |
| `separator_block()` | wp:separator |
| `create_x_image(src, out)` | 1200x480 X投稿画像生成 |
| `generate_x_image(slug, meta)` | 1枚目URLから自動生成 |

### 8-2. 必須メタ情報フィールド（記事1本ごと）
```python
{
    "slug": "url-slug-form",
    "brand_jp": "オメガ",                  # 日本語ブランド名
    "brand_path": "omega",                 # URLパス用
    "category_id": 9,                      # ブランド記事のみ
    "cta_label_mid": "[具体的中間CTA]",
    "cta_label_end": "[具体的末尾CTA]",
    "is_theme": False,                     # テーマ記事はTrue
    "images": ["url1", "url2", "url3"],   # cdn.firekids.jp の3枚
    "image_alts": ["alt1", "alt2", "alt3"],
    "keywords": ["KW1", "KW2", ...],
    "meta_description": "120字以内",
    "og_description": "50〜80字",
    "about_things": ["Cal.xxx", "Ref.xxxx", ...],  # JSON-LD用
}
```

### 8-3. パーサーが対応するFAQフォーマット
- `**Q:** ...` → 次行 `A: ...`
- `### Q: ...` → 次の段落がA
- `### Q1. ...` / `### Q2: ...` 番号付きにも対応（正規表現: `^Q\d*[\.\:：]`）
- 番号欠番（Q1, Q2, Q4 等）はTXT原本のまま反映

---

## 9. ワークフロー（NEW記事生成時の手順）

```
1. TXT準備
   ├── data/correction_log.json を確認（最優先ソース）
   ├── data/caliber_db.json で仕様裏付け
   ├── data/FK記事作成用.xlsx Body で追加裏付け（題材選定+仕様確認）
   └── 既存記事との重複チェック（articles/ + m.firekids.jp 検索）

2. メタ情報設計
   ├── タイトル: 「[テーマ]｜FIRE KIDS Magazine」
   ├── meta_description: 120字以内、検索意図に応える
   ├── keywords: メインKW＋関連KW
   ├── images: ユーザー指定の3枚URL（cdn.firekids.jp）
   ├── CTA文言: 中間・末尾を別々の具体的文言で設計
   └── about_things: Cal/Ref など記事中の主要要素

3. HTML生成
   ├── convert.py の ARTICLES dict に追加
   ├── python3 convert.py 実行
   ├── X画像も自動生成（Desktop/x_images_{date}/）
   └── 出力先: work/ → 確認後 output/

4. 検証
   ├── 検証スクリプト実行（FK/クオート/UTM/CTA数/画像数）
   ├── チェックリスト（§6）を全項目確認
   └── 1記事を目視確認（メタ・JSON-LD・リード・TOC・本文・FAQ・CTA）

5. 修正ログ
   ├── キャリバー仕様・モデル呼称・事実情報の変更があれば correction_log.json 追記
   └── 書式正規化のみなら不要

6. 公開準備
   ├── HTMLを articles/{BRAND}/article_{slug}.html へ移動
   └── X画像を x_posts/{BRAND}/ へ移動
```

---

## 10. 改訂履歴

- **2026-05-18 v2**: リッチデザイン版（リードカード+目次+h2装飾+FAQ装飾+JSON-LD統合）正式化、X画像Desktop自動生成義務化、CTA文言設計ルール明文化、FAQパーサーの番号付き形式対応
- **2026-04-15**: 新規記事レイアウトルール（リード文、結論1文、視覚化）
- **2026-03-12**: 初期Gutenbergテンプレート

---

## 付録A: ブランド別CTA例リスト

| ブランド | 中間CTA例 | 末尾CTA例 |
|---------|----------|----------|
| ロレックス | 「ヴィンテージのRef.XXXXをFIRE KIDSで探す」 | 「記事で紹介したロレックス Ref.XXXX、FIRE KIDSでの取り扱いはこちら」 |
| オメガ | 「Cal.xxx搭載のヴィンテージオメガをFIRE KIDSで探す」 | 「[モデル名]、FIRE KIDSでの取り扱いはこちら」 |
| セイコー | 「ヴィンテージの44GS／57GS／61GSをFIRE KIDSで探す」 | 「彫り文字盤・SDダイヤルのグランドセイコー、FIRE KIDSでの取り扱いはこちら」 |
| IWC | 「Cal.89・Cal.852搭載のIWC 18金モデルをFIRE KIDSで探す」 | 「1950〜60年代IWCドレスウォッチ、FIRE KIDSでの取り扱いはこちら」 |
| テーマ | 「[テーマ要素]を楽しめるヴィンテージ時計をFIRE KIDSで探す」 | 「[テーマ要素]の経年変化を楽しめるヴィンテージ、FIRE KIDSでの取り扱いはこちら」 |

---

## 付録B: ペーストして使える「ARTICLES dict」雛形

```python
"XXX_article_SLUG": {
    "slug": "kebab-case-slug",
    "brand_jp": "[日本語ブランド名 or FIRE KIDS Magazine]",
    "brand_path": "[brand-path]",
    "category_id": [ID or None],
    "cta_label_mid": "[中間CTA文言]",
    "cta_label_end": "[末尾CTA文言]",
    "is_theme": False,  # テーマ記事はTrue
    "images": [
        "https://cdn.firekids.jp/products/[ID]/[file].jpg",
        "https://cdn.firekids.jp/products/[ID]/[file].jpg",
        "https://cdn.firekids.jp/products/[ID]/[file].jpg",
    ],
    "image_alts": [
        "[1枚目alt]",
        "[2枚目alt]",
        "[3枚目alt]",
    ],
    "keywords": ["[メインKW]", "[関連KW1]", ..., "ヴィンテージ時計", "FIRE KIDS"],
    "meta_description": "[120字以内の説明]",
    "og_description": "[50〜80字のSNS要約]",
    "about_things": ["[Cal.xxx]", "[Ref.xxxx]", "[モデル名]"],
},
```

これを convert.py の ARTICLES dict に追加すれば、HTML+X画像が自動生成されます。
