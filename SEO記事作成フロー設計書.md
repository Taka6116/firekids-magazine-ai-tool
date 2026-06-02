# FIRE KIDS SEO記事作成フロー設計書

作成日：2026.02.18
更新日：2026.02.25 v3.0
対象：ヴィンテージ時計 SEO記事量産（SEIKO / OMEGA / ROLEX / OTHER）

---

## 1. 現状の課題と改善方針

### 課題
- 代表商品として過去の出品商品（販売済み）が記事に含まれてしまう
- ファクトチェックが未実装（誤情報リスク）
- 作業がローカル環境（個人PC）に依存しており、チームで共有できない
- CLINEの作業履歴が個人アカウントに紐づいており、他者が参照できない

### 改善方針
1. **商品リンク方式の変更**：個別商品リンクではなく、ブランドカテゴリページへの遷移リンクを使用する
2. **ファクトチェック**：信頼できるソースと照合するステップを組み込む
3. **チーム共有**：Google Drive + CLINE構成でクラウド化する
4. **作業の可視化**：作業ログ・指示テンプレートをチームで参照できる形にする

---

## 2. firekids.jp カテゴリ構造（クローリング結果）

firekids.jpはEC-CUBEで構築されており、ブランド単位のフラットなカテゴリ構造です。
サブカテゴリは存在せず、ブランド別の一覧ページに直接リンクします。

### ブランド別カテゴリURL一覧

| ブランド | カテゴリID | URL |
|---------|-----------|-----|
| ロレックス | 8 | https://firekids.jp/products/list?category_id=8 |
| オメガ | 9 | https://firekids.jp/products/list?category_id=9 |
| セイコー | 10 | https://firekids.jp/products/list?category_id=10 |
| シチズン | 11 | https://firekids.jp/products/list?category_id=11 |
| IWC | 12 | https://firekids.jp/products/list?category_id=12 |
| チューダー | 13 | https://firekids.jp/products/list?category_id=13 |
| オリエント | 14 | https://firekids.jp/products/list?category_id=14 |
| ロンジン | 15 | https://firekids.jp/products/list?category_id=15 |
| ジャガー・ルクルト | 16 | https://firekids.jp/products/list?category_id=16 |
| カルティエ | 17 | https://firekids.jp/products/list?category_id=17 |
| ユニバーサルジュネーブ | 18 | https://firekids.jp/products/list?category_id=18 |
| ブライトリング | 19 | https://firekids.jp/products/list?category_id=19 |
| ヴァシュロン・コンスタンタン | 20 | https://firekids.jp/products/list?category_id=20 |
| パテック・フィリップ | 21 | https://firekids.jp/products/list?category_id=21 |
| オーデマピゲ | 22 | https://firekids.jp/products/list?category_id=22 |
| その他のブランド | 23 | https://firekids.jp/products/list?category_id=23 |
| オリジナル革ベルト | 24 | https://firekids.jp/products/list?category_id=24 |
| 全商品 | - | https://firekids.jp/products/list |
| 新着商品 | - | https://firekids.jp/products/list?orderby=2&status[]=1 |

### 記事とカテゴリリンクの対応表

| 記事テーマ | 使用するカテゴリリンク |
|-----------|----------------------|
| グランドセイコー・キングセイコー・セイコーダイバーズ等 | セイコー（category_id=10） |
| オメガ コンステレーション・シーマスター・スピードマスター等 | オメガ（category_id=9） |
| ロレックス デイトジャスト・サブマリーナ・GMTマスター等 | ロレックス（category_id=8） |
| チューダー関連 | チューダー（category_id=13） |
| IWC関連 | IWC（category_id=12） |
| カルティエ関連 | カルティエ（category_id=17） |
| 複数ブランド横断記事 | 全商品（/products/list） |

---

## 3. 記事内のリンク方針（重要）

### 方針：個別商品リンクは使用しない

**理由：** 販売状況は随時変動するため、公開時に販売中でも記事公開後に売り切れになる。
個別商品URLを記事に掲載しても、読者がアクセスした時点で「商品なし」になる可能性が高い。

### 採用する方針：ブランドカテゴリページへの誘導

```
【記事末尾のCTAリンク例（グランドセイコー記事の場合）】

FIRE KIDS セイコー在庫一覧はこちら
→ https://firekids.jp/products/list?category_id=10

新着商品はこちら
→ https://firekids.jp/products/list?orderby=2&status[]=1
```

これにより：
- 販売状況に左右されない恒久的なリンクになる
- 読者がカテゴリページで現在の在庫を自分で確認できる
- SEO的にも内部リンク構造として機能する

---

## 4. ファクトチェックの実装について

### 結論：CLINEでのファクトチェックは「可能」

ただし、ソースの選定が品質を左右します。

### ファクトチェックのソース候補

| ソース | 内容 | 信頼性 | 実装難易度 |
|--------|------|--------|-----------|
| **セイコーミュージアム公式サイト** | グランドセイコーの歴史・年表・Cal.番号 | ★★★★★ | 低（Web取得） |
| **Caliber Corner（英語）** | ムーブメント詳細・Cal.番号・製造年 | ★★★★☆ | 低（Web取得） |
| **Ranfft Movements DB** | Cal.番号・振動数・石数 | ★★★★☆ | 低（Web取得） |
| **自社Excelデータ（FK記事作成用.xlsx）** | 実際の商品スペック | ★★★★★ | 済（実装済み） |

※ 相場価格はソースから除外。変動が激しく信頼性の高い一次ソースがないため、記事内では価格に言及しない。

### 推奨ファクトチェックフロー

```
記事草稿生成
    ↓
【チェック項目】
1. Cal.番号・振動数 → Ranfft DB で照合
2. 製造年代・Ref.番号 → 自社Excelデータで照合
3. 歴史的事実・年表 → セイコーミュージアム公式で照合
4. ブランド・モデル名の表記 → 公式サイトで照合
    ↓
不一致があれば自動フラグ → 人間が最終確認
    ↓
確認済み記事として出力
```

### CLINEでの実装方法

CLINEの `web_fetch` ツールを使って、記事生成後に以下を自動実行できます：

```
CLINEへの指示例：
「生成した記事のCal.番号と振動数を
https://www.ranfft.de/cgi-bin/bidfun-db.cgi?10&ranfft&&2uswk&Cal.4522A
で確認し、不一致があればフラグを立ててください」
```

---

## 5. チーム共有の実現方法

### 5-1. Google Drive + CLINE構成（推奨）

#### 構成図

```
[Google Drive（共有フォルダ）]
    └── MCPforSEO/
        ├── data/
        │   └── FK記事作成用.xlsx（商品データ）
        ├── articles/（生成記事保存先・ブランド別）
        │   ├── SEIKO/
        │   │   ├── article_grand_seiko.txt
        │   │   ├── article_grand_seiko.html
        │   │   └── ...
        │   ├── OMEGA/
        │   ├── ROLEX/
        │   └── OTHER/
        ├── x_posts/（X投稿文保存先・ブランド別）
        │   ├── SEIKO/
        │   ├── OMEGA/
        │   ├── ROLEX/
        │   └── OTHER/
        ├── templates/
        │   ├── article_html_template.html（HTML記事テンプレート+SEOメタ構文）
        │   ├── factcheck_template.md（ファクトチェックレポートテンプレート）
        │   ├── x_post_templates.md（X投稿文パターン見本集）
        │   └── cline_instructions.md（CLINEへの指示テンプレート）
        ├── factcheck_logs/（ファクトチェックログ・ブランド別）
        │   ├── SEIKO/
        │   ├── OMEGA/
        │   ├── ROLEX/
        │   └── OTHER/
        └── SEO記事作成フロー設計書.md（本ファイル）

[各メンバーのPC]
    └── Google Drive デスクトップ版（同期）
        └── VSCode + CLINE
            └── ワークスペース = Google Drive内のMCPforSEOフォルダ
```

#### 実現可能性：★★★★☆（実装可能・推奨）

Google Drive デスクトップ版を使えば、クラウドフォルダがローカルパスとして見えるため、CLINEから直接読み書きできます。

**設定例：**
```
# Google Driveのマウントパス（Mac）
/Users/[username]/Google Drive/マイドライブ/MCPforSEO/

# CLINEのワークスペースをこのパスに設定するだけで共有フォルダに書き込める
```

#### MCPサーバーをクラウドに設置する場合

MCPサーバー自体をクラウドに置く構成も技術的には可能ですが、**現時点では推奨しません**。

理由：
- CLINEのMCPサーバーはローカルプロセスとして動作する設計
- クラウドMCPサーバーはセキュリティ設定が複雑
- Google Drive デスクトップ版で十分な共有が実現できる

---

### 5-2. CLINEアカウントの共有とチャット履歴の参照

#### 結論：現状では「完全な共有は難しい」

CLINEのチャット履歴はVSCodeの拡張機能として各PCのローカルに保存されます。

| 共有方法 | 実現性 | 詳細 |
|---------|--------|------|
| **同一Anthropicアカウントを複数PCで使用** | △ | APIキーは共有できるが、チャット履歴は各PCに独立して保存される |
| **チャット履歴ファイルをGoogle Driveに同期** | △ | 技術的には可能だが、競合が発生しやすく不安定 |
| **作業ログをMarkdownで記録・共有** | ✅ | 最も現実的。CLINEが生成した記事・ログをGoogle Driveに保存 |
| **Cursor（代替IDE）のチーム機能** | ✅ | Cursorはチームでの履歴共有機能あり（有料プラン） |

**推奨：** チャット履歴そのものの共有より、**「CLINEへの指示テンプレート + 生成物」をGoogle Driveで共有する**方が現実的で安定しています。

---

## 6. 推奨フロー全体設計（フェーズ1〜2）

### フェーズ1：環境整備（1〜2日）

```
[ 担当者A（管理者）]
1. Google Drive 共有フォルダ作成
   └── /MCPforSEO/ 以下の構造を作成（上記5-1参照）

2. 各メンバーのPCにGoogle Drive デスクトップ版インストール

3. VSCode + CLINE拡張機能インストール
   └── Anthropic APIキーを共有（チーム用APIキーを発行）

4. CLINEのワークスペースをGoogle Drive内のMCPforSEOフォルダに設定

5. 指示テンプレートをGoogle Driveに保存
   └── /MCPforSEO/templates/cline_instructions.md
```

### フェーズ2：記事生成フロー（定常運用）

```
STEP 1: 在庫データ更新
    └── FK記事作成用.xlsx を最新版に更新（Google Drive）

STEP 1.5: CDN画像URLの取得（記事作成前）
    └── python3 scripts/fetch_images.py [ブランド] [キーワード]
    └── 出力: data/images_[ブランド]_[キーワード].json
    └── 記事のセクションに合った画像を選択

STEP 2: CLINEで記事生成指示
    └── 指示テンプレートをコピペしてCLINEに貼り付け
    └── CLINEが自動で：
        ① Excelから該当商品データ抽出（スペック情報のみ参照）
        ② images JSONから関連画像を選択しWordPressブロック形式で挿入
        ③ 記事草稿生成（個別商品リンクは使用しない）
        ④ 末尾にブランドカテゴリページへのCTAリンクを挿入

STEP 3: ファクトチェック（2段階方式・自動）
    └── CLINEが自動で：
        ① 【一次照合】caliber_db.json でCal.番号・Ref.番号・振動数・石数・製造年を照合
        ② 【二次照合】未登録項目のみWebソースで確認（Ranfft DB / セイコーミュージアム）
        ③ 【禁止事項チェック】価格記載なし・個別商品リンクなし・CTAリンク正確性を確認
        ④ factcheck_template.md に従ってレポート出力 → /factcheck_logs/[ブランド]/factcheck_[slug].md

STEP 4: 人間による最終確認
    └── フラグ箇所を担当者が確認・修正
    └── 文体・トーンの確認（FireKids Magazineに合わせる）

STEP 5: 記事ファイル保存（ブランド別フォルダ）
    └── TXT版：/MCPforSEO/articles/[ブランド]/article_[slug].txt
    └── HTML版：/MCPforSEO/articles/[ブランド]/article_[slug].html（WordPress投稿用）
    └── Google Drive経由でチーム全員に自動共有

STEP 6: CMS（WordPress等）への投稿
    └── 手動コピペ（現状）
    └── WordPress MCP連携で自動投稿（将来対応）

STEP 7: X長文投稿の生成（記事公開後）
    └── CLINEが自動で：
        ① 完成記事の本文をベースに、X長文投稿用にレイアウトを変換
        ② 記事の主要セクション（3〜5セクション）を選定し、見出し＋本文の構成で作成
        ③ テーブルを箇条書きに変換、HTMLタグを除去
        ④ /x_posts/[ブランド]/x_[slug].md として保存
    └── 投稿タイプ：Xプレミアム長文投稿（1,500〜3,000文字）
    └── 記事本文に近い形式で、X上の単独コンテンツとして成立させる
    └── 参照フォーマット：/templates/x_post_templates.md
```

---

## 7. 実装状況

※ CLINEへの指示テンプレートは `templates/cline_instructions.md` に統合済み。

| 機能 | 状態 | 関連ファイル |
|------|------|-------------|
| Google Drive共有フォルダ | ✅ 完了 | MCPforSEO/ |
| CLINE指示テンプレート | ✅ 完了 | templates/cline_instructions.md |
| ブランド別フォルダ構成 | ✅ 完了 | articles/, x_posts/, factcheck_logs/ |
| caliber_db.json（Cal.+Ref.+モデル） | ✅ 完了 | data/caliber_db.json |
| 2段階ファクトチェック | ✅ 完了 | templates/factcheck_template.md |
| HTML記事テンプレート（Gutenberg形式） | ✅ 完了 | templates/article_html_template.html |
| SEOメタ構文（OG/Twitter Card/JSON-LD） | ✅ 完了 | templates/article_html_template.html |
| CDN画像URL自動取得 | ✅ 完了 | scripts/fetch_images.py |
| X長文投稿生成（記事ベース長文形式） | ✅ 完了 | templates/x_post_templates.md |
| WordPress自動投稿 | 🔲 未着手 | — |

**次のステップ：**
1. 記事を量産（30本候補リストから優先度順に）
2. caliber_db.jsonにブランドを追加（CITIZEN, IWC, TUDOR等）
3. WordPress MCP連携の検討

---

## 付録A：ブランド別カテゴリリンク早見表

```
セイコー関連記事のCTA：
https://firekids.jp/products/list?category_id=10

オメガ関連記事のCTA：
https://firekids.jp/products/list?category_id=9

ロレックス関連記事のCTA：
https://firekids.jp/products/list?category_id=8

チューダー関連記事のCTA：
https://firekids.jp/products/list?category_id=13

IWC関連記事のCTA：
https://firekids.jp/products/list?category_id=12

カルティエ関連記事のCTA：
https://firekids.jp/products/list?category_id=17

新着商品（全ブランド共通）：
https://firekids.jp/products/list?orderby=2&status[]=1
```

---

## 付録B：CLINEアカウント共有の現実的な方法

### 現状のCLINEの仕様
- CLINEはVSCode拡張機能として動作
- チャット履歴は各PCのローカルに保存
- Anthropic APIキーは各PCの設定ファイルに保存

### チーム運用の推奨方法

```
【推奨構成】
- Anthropic APIキー：チーム用を1つ発行して共有
- チャット履歴：共有しない（各自のPCで独立）
- 作業成果物：Google Driveで共有
- 作業指示書：Google Driveに「cline_instructions.md」を作成・共有

→ 指示テンプレートをコピペするだけで、
  誰でも同じ品質の記事を生成できる体制を構築する
```

---

*本設計書はFIRE KIDS SEO記事量産プロジェクトの技術仕様書です。*
*更新日：2026.02.25 v3.0*
