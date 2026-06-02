# FIRE KIDS SEO記事作成プロジェクト（MCPforSEO）

## このフォルダについて

FIRE KIDSのヴィンテージ時計SEO記事を量産するためのプロジェクトフォルダです。
Google Drive経由でチームメンバーと共有し、各自のPCのCLINE（VSCode拡張機能）から操作します。

---

## フォルダ構成

```
MCPforSEO/
├── README.md                              ← このファイル
├── SEO記事作成フロー設計書.md               ← フロー全体の設計書・手順書
├── data/
│   ├── FK記事作成用.xlsx                   ← 商品データ（8,998件）
│   ├── caliber_db.json                    ← Cal./Ref.番号ファクトチェック用DB
│   └── images_[ブランド]_[キーワード].json  ← CDN画像URL取得結果
├── articles/（ブランド別）
│   ├── SEIKO/
│   │   ├── article_grand_seiko.txt
│   │   ├── article_grand_seiko.md
│   │   ├── article_king_seiko.txt
│   │   └── article_king_seiko.md
│   ├── OMEGA/
│   │   ├── article_omega_constellation.txt
│   │   └── article_omega_constellation.md
│   ├── ROLEX/
│   │   ├── article_rolex_datejust.txt
│   │   └── article_rolex_datejust.md
│   └── OTHER/
│       └── article_audemars_piguet_women.html
├── x_posts/（X投稿文・ブランド別）
│   ├── SEIKO/
│   ├── OMEGA/
│   ├── ROLEX/
│   └── OTHER/
├── factcheck_logs/（ファクトチェックログ・ブランド別）
│   ├── SEIKO/
│   ├── OMEGA/
│   ├── ROLEX/
│   └── OTHER/
├── templates/
│   ├── cline_instructions.md              ← CLINEへの指示テンプレート＋記事候補30本
│   ├── article_html_template.html         ← WordPress Gutenbergブロック形式HTMLテンプレート
│   ├── factcheck_template.md              ← ファクトチェック5段階レポートテンプレート
│   └── x_post_templates.md               ← X投稿文パターン見本集（クイズ・豆知識）
└── scripts/
    ├── analyze.py                         ← ブランド別データ集計
    ├── extract_brand.py                   ← ブランド別データ抽出（Excel→JSON）
    └── fetch_images.py                    ← CDN画像URL自動取得
```

---

## 記事作成フロー（全7ステップ）

```
STEP 1    在庫データ更新（FK記事作成用.xlsx）
   ↓
STEP 1.5  CDN画像URLの取得
           python3 scripts/fetch_images.py [ブランド] [キーワード]
   ↓
STEP 2    CLINEで記事生成（TXT + HTML同時出力）
   ↓
STEP 3    ファクトチェック（2段階：caliber_db.json → Webソース）
   ↓
STEP 4    人間による最終確認
   ↓
STEP 5    記事ファイル保存（articles/[ブランド]/）
   ↓
STEP 6    WordPress投稿（HTML版をコピペ）
   ↓
STEP 7    X長文投稿生成（記事ベースの長文形式）
```

詳細は `SEO記事作成フロー設計書.md` を参照してください。

---

## 現在の進捗

| 記事 | フォルダ | 形式 | 状態 |
|------|---------|------|------|
| グランドセイコー | SEIKO/ | TXT+MD | ✅ 完成・ファクトチェック済み |
| キングセイコー | SEIKO/ | TXT+MD | ✅ 完成 |
| オメガ コンステレーション | OMEGA/ | TXT+MD | ✅ 完成 |
| ロレックス デイトジャスト | ROLEX/ | TXT+MD | ✅ 完成 |
| オーデマピゲ レディース | OTHER/ | HTML | ✅ 完成（WordPress形式） |

次の記事候補は `templates/cline_instructions.md` を参照してください（30本リストあり）。

---

## テンプレート一覧

| テンプレート | ファイル | 用途 |
|-------------|---------|------|
| CLINE指示テンプレート | `templates/cline_instructions.md` | 記事生成・ファクトチェック・X投稿文の指示文 |
| HTML記事テンプレート | `templates/article_html_template.html` | WordPress Gutenbergブロック形式+SEOメタ構文+JSON-LD |
| ファクトチェックテンプレート | `templates/factcheck_template.md` | 5段階チェック（DB照合→Web照合→歴史→禁止事項→まとめ） |
| X投稿文テンプレート | `templates/x_post_templates.md` | Xプレミアム長文投稿フォーマット（記事ベース） |

---

## スクリプト一覧

### データ集計（analyze.py）

```bash
python3 scripts/analyze.py
```

### データ抽出（extract_brand.py）

```bash
python3 scripts/extract_brand.py SEIKO グランドセイコー
python3 scripts/extract_brand.py OMEGA コンステレーション
python3 scripts/extract_brand.py ROLEX デイトジャスト
```

### CDN画像URL取得（fetch_images.py）

```bash
python3 scripts/fetch_images.py SEIKO グランドセイコー
python3 scripts/fetch_images.py OMEGA コンステレーション
python3 scripts/fetch_images.py ROLEX デイトジャスト
python3 scripts/fetch_images.py OTHER オーデマピゲ
```

firekids.jpのカテゴリページから商品画像のCDN URLを自動取得し、キーワードで絞り込んでJSON出力します。
WordPress用の画像ブロックHTMLもコンソールに出力されます。

---

## ファクトチェック用DB（caliber_db.json）

`data/caliber_db.json` にCal.番号・Ref.番号・モデル情報を登録済みです。

| ブランド | Cal.数 | モデル数 | 主なCal. |
|---------|--------|---------|---------|
| SEIKO | 13種 | 7モデル | 3180, 4522, 5645, 5646, 6145, 6146, 6245 等 |
| OMEGA | 9種 | 3モデル | 354, 501, 552, 561, 564, 565, 321, 861, 1012 |
| ROLEX | 6種 | 4モデル | 1520, 1530, 1560, 1570, 1575, 3135 |

**2段階チェック方式:**
1. **一次照合（ローカル）**: caliber_db.json でCal./Ref.番号を即時照合
2. **二次照合（Web）**: 未登録項目のみ Ranfft DB / セイコーミュージアム等で確認

---

## SEOメタ構文（HTML記事に自動付与）

HTML形式の記事には以下のSEO要素が自動生成されます:

- **基本メタ**: title, meta_description, meta_keywords, canonical_url
- **Open Graph**: og:title, og:description, og:image, og:url 等
- **Twitter Card**: summary_large_image 形式
- **JSON-LD構造化データ**: Article スキーマ + FAQPage スキーマ

テンプレート: `templates/article_html_template.html`

---

## セットアップ手順（他PCでの初回設定）

### 1. 必要なソフトウェア

```bash
python3 --version   # Python 3.9以上
pip3 install openpyxl  # Excelファイル読み込み用
```

### 2. VSCode + CLINE

1. [VSCode](https://code.visualstudio.com/) をインストール
2. 拡張機能「Cline」をインストール
3. AnthropicのAPIキーを設定（管理者から共有）
4. MCPforSEOフォルダをワークスペースとして開く

### 3. Google Drive デスクトップ版

1. [Google Drive デスクトップ版](https://www.google.com/drive/download/) をインストール
2. `sasaki_tasuku@cellmuller.com` でログイン
3. 「マイドライブ/MCPforSEO」が自動同期

---

## Google DriveのパスについてのPC別メモ

| OS | パス |
|----|------|
| Mac | `/Users/[ユーザー名]/Library/CloudStorage/GoogleDrive-sasaki_tasuku@cellmuller.com/マイドライブ/MCPforSEO` |
| Windows | `G:\マイドライブ\MCPforSEO` または `C:\Users\[ユーザー名]\Google Drive\マイドライブ\MCPforSEO` |

スクリプトは `Path(__file__).parent.parent` で相対パスを使用しているため、どのPCでも動作します。

---

## 注意事項

- 記事は **ブランド別フォルダ** に保存（`articles/SEIKO/`, `articles/OMEGA/` 等）
- 記事形式は **TXT + HTML** の両方を出力
- **相場価格は記載しない**（変動が激しいため）
- **個別商品リンク（FK番号）は使用しない**（販売状況が変動するため）
- 末尾CTAは必ず **ブランドカテゴリページ** へのリンクを使用
- CDN画像は `cdn.firekids.jp` のURLを使用

---

## 問い合わせ

設定でわからないことがあれば sasaki_tasuku@cellmuller.com まで。

*最終更新：2026.03.10*
