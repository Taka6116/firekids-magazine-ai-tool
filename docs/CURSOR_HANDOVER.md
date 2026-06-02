---
type: deliverable
date: 2026-06-02
client: FIRE KIDS
departments: [secretary, engineering, knowledge_ops]
status: draft
tags: [ai-company, fire-kids, cursor, github, vercel, handover]
---

参照スキル: engineering/backend-infra-review, knowledge_ops/knowledge-curation
品質: ドラフト

# FIRE KIDS Magazine AI Tool Cursor引き継ぎ書

作成日: 2026-06-02  
対象リポジトリ: `https://github.com/Taka6116/firekids-magazine-ai-tool`  
ローカル元パス: `C:\Users\goto_\FirekidsMagazine-main`  
現在のGitブランチ: `main`  
初回pushコミット: `d07421a`  

## 1. Cursorに最初に渡す指示

Cursorには、以下の文面を最初に渡す。

```text
このリポジトリは、FIRE KIDS Magazine向けのSEO記事・HTML・X投稿生成支援ツールの引き継ぎ案件です。

現状はNext.jsアプリではありません。Pythonスクリプト、Excel/JSON/TSVデータ、記事TXT/HTML、X投稿素材、WordPress投稿補助ツールがまとまったレガシー運用フォルダです。

まず既存資産を壊さずに読み解き、Vercelで動くNext.js管理画面へ段階移行してください。

最優先で守ること:
1. .env、WordPress Application Password、APIキー、トークンをコミットしない。
2. TXT記事をマスター、HTML/X投稿を派生物として扱う。
3. FIRE KIDSの記事ルールは CLAUDE.md を最優先で読む。
4. FK番号、価格、個別商品URL、根拠のない外部情報を記事本文に出さない。
5. まずは記事ブラウザ、ルール検証、HTML/X変換補助、WordPress投稿dry-runまでをMVPにする。
6. AI生成そのものは後回し。先に既存ルールと既存記事を安全に扱えるUIを作る。
```

## 2. 現状の環境

結論として、同期さんが作っていたものはNext.jsではない。

現状は主に以下で構成されている。

| 種別 | 内容 |
|---|---|
| 言語 | Python中心 |
| UI | 一部Flaskローカルツールあり |
| フロントエンド | Next.js / React / package.json なし |
| データ | Excel, JSON, TSV |
| 生成物 | 記事TXT, WordPress Gutenberg HTML, X投稿Markdown, X投稿画像 |
| 投稿補助 | WordPress REST API向けローカル補助ツール |
| 旧運用 | Google Drive + VSCode/Cline前提 |
| 現在の移行先 | GitHub repo `Taka6116/firekids-magazine-ai-tool` |
| Vercel状態 | まだデプロイ可能なWebアプリ構成ではない |

VercelのImport画面では、現状のままなら `Other` 相当だが、そのままDeployしても実用的な画面は出ない。  
次の開発でNext.js化したあと、Vercel側では `Next.js` としてImportするのが正しい。

## 3. 重要ファイル

| パス | 役割 | Cursorでの扱い |
|---|---|---|
| `README.md` | 旧運用の全体説明 | 最初に読む |
| `CLAUDE.md` | FIRE KIDS記事生成の最重要ルール | 必読。記事品質の仕様として扱う |
| `HANDOVER_HTML_GENERATION.md` | HTML生成仕様 | HTML変換/検証の基準 |
| `SEO記事作成フロー設計書.md` | 旧ワークフロー設計 | 業務理解用 |
| `templates/` | 記事生成・HTML・X投稿テンプレート | 仕様化してUI/APIに移す |
| `articles/` | 既存記事TXT/HTML | コンテンツ資産。壊さない |
| `x_posts/` | X投稿文・画像 | コンテンツ資産。壊さない |
| `data/FK記事作成用.xlsx` | 商品データ | 参照データ。公開範囲に注意 |
| `data/correction_log.json` | 人間レビュー修正ログ | 記事事実確認の最優先ソース |
| `data/caliber_db.json` | キャリバー/Ref情報 | 事実確認の第二ソース |
| `scripts/` | 旧Python補助スクリプト | Next.js APIまたはCLIへ段階移植 |
| `scripts/wp_uploader_local/` | WordPress投稿補助 | 当面はdry-run中心で扱う |
| `.claude/` | 旧ローカル設定 | GitHub未コミット。引き継ぎ対象外 |

## 4. セットアップ手順

Cursorで開発を始める手順。

```powershell
git clone https://github.com/Taka6116/firekids-magazine-ai-tool.git
cd firekids-magazine-ai-tool
git status
```

Python系の確認。

```powershell
python --version
pip --version
```

既存READMEではPython 3.9以上、`openpyxl` が必要とされている。

```powershell
pip install openpyxl
```

WordPress投稿補助を触る場合のみ、該当サブフォルダの `.env.example` を確認する。  
本物の認証情報はGitHubに入れず、ローカル `.env` またはVercel環境変数で管理する。

## 5. 現状で実行できる主な旧スクリプト

| コマンド | 目的 |
|---|---|
| `python scripts/analyze.py` | Excelデータ集計 |
| `python scripts/extract_brand.py SEIKO グランドセイコー` | ブランド/キーワード別抽出 |
| `python scripts/fetch_images.py SEIKO グランドセイコー` | FIRE KIDS側からCDN画像URL取得 |
| `python generate_html_batch.py` | 既存TXTからHTML生成。ただし旧パス/旧仕様の確認が必要 |

注意:
- `generate_html_batch.py` は最新仕様とズレている可能性がある。
- 旧ドキュメント内に存在が前提になっている `convert.py` は、現在のrepo直下には見当たらない。
- `factcheck_logs/`, `review_docs/`, `data/snapshots/`, `data/images/` はドキュメントでは言及されるが、現物が欠けている可能性がある。

## 6. FIRE KIDS記事ルールの要点

Cursorは、記事生成やHTML変換の前に `CLAUDE.md` を読むこと。

特に重要な禁止事項。

- `FK000002` のようなFK番号を記事やX投稿に出さない。
- 相場価格、販売価格を記載しない。
- 個別商品ページURLを貼らない。
- CTAはブランドカテゴリページまたはトップページを使う。
- 外部サイト情報を本文事実として採用しない。
- 内部ソースで裏付けできない仕様、歴史、機能は書かない。
- 「店頭でよく聞かれる」など、AIが想像した接客エピソードを書かない。
- 特定の職業やライフスタイルと特定Refを根拠なく結びつけない。
- TXTをマスター、HTMLとX投稿は派生物として扱う。

情報ソースの優先順位。

1. `data/correction_log.json`
2. `data/caliber_db.json`
3. `data/FK記事作成用.xlsx` のBodyフィールド
4. `firekids.jp` / `m.firekids.jp` のサイト内情報

## 7. Next.js/Vercel化の推奨方針

まず既存資産をそのままWeb化しようとしない。  
初期MVPは「生成AIアプリ」ではなく「既存記事を安全に扱う管理ツール」にする。

推奨構成。

```text
firekids-magazine-ai-tool/
  app/ or src/app/              # Next.js App Router
  src/
    lib/
      articles/                 # 記事一覧/読み込み
      validation/               # FIRE KIDSルール検証
      converters/               # TXT -> HTML / TXT -> X投稿
      wordpress/                # WP REST API dry-run/投稿
    components/
    types/
  content/
    articles/                   # 将来的に既存articlesを整理
    x_posts/
  data/
  legacy/
    scripts/                    # 旧Pythonを段階退避
  docs/
```

初期MVP機能。

1. 記事一覧
   - ブランド、記事番号、TXT有無、HTML有無、X投稿有無、公開/未公開を表示する。
2. 記事プレビュー
   - TXT、HTML、X投稿を並べて確認できる。
3. ルール検証
   - FK番号検出
   - 価格表現検出
   - 個別商品URL検出
   - CTA/UTM不足検出
   - canonical/og/json-ld不足検出
4. HTML/X変換補助
   - まずは既存テンプレート準拠の補助ツールにする。
   - AI本文生成は後回し。
5. WordPress投稿dry-run
   - タイトル、カテゴリ、タグ、予約日時、本文HTMLを確認する。
   - いきなり本番投稿しない。

## 8. Vercel環境変数候補

Next.js化後に必要になりうる環境変数。

```env
APP_AUTH_SECRET=
ADMIN_EMAILS=

WP_BASE_URL=https://m.firekids.jp
WP_USER=
WP_APP_PASSWORD=

GITHUB_OWNER=Taka6116
GITHUB_REPO=firekids-magazine-ai-tool
GITHUB_TOKEN=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

注意:
- AI APIキーは、AI生成機能を実装するまで不要。
- WordPress投稿は最初から本番実行しない。必ずdry-runを先に作る。
- Vercel上で生成ファイルを永続保存したい場合、GitHub commit、Vercel Blob、S3、Supabaseなどの保存先設計が必要。

## 9. 最初の開発タスク

Cursorでの着手順。

1. `CLAUDE.md`, `README.md`, `HANDOVER_HTML_GENERATION.md` を読み、仕様要約を作る。
2. Next.js + TypeScriptの最小アプリを追加する。
3. `articles/` と `x_posts/` を読み込んで一覧表示する。
4. 1記事を選んでTXT/HTML/X投稿のプレビューを表示する。
5. ルール検証関数を作る。
6. 既存記事に対して検証レポートを出す。
7. WordPress投稿はdry-run画面だけ作る。
8. Vercel Previewで画面が出ることを確認する。

ここまでできれば、既存資産を壊さずにWebアプリ化の土台ができる。

## 10. 品質ゲート

完了判定は「ビルドが通る」だけでは足りない。次の状態を分けて確認する。

| ゲート | 合格条件 |
|---|---|
| UI起動 | Vercel Previewまたはローカルで画面が出る |
| 記事読み込み | 既存記事をブランド別に一覧できる |
| プレビュー | TXT/HTML/X投稿を確認できる |
| ルール検証 | 禁止表現や不足項目を検出できる |
| dry-run | WordPress投稿前の内容確認ができる |
| 本番投稿 | dry-run合格後にのみ実装する |
| 永続化 | 生成物の保存先が決まっている |

SEO/API系では「結果が0件」と「取得失敗」を混同しない。  
例: 画像0件、記事0件、API失敗、認証失敗、パース失敗は画面上で別ステータスにする。

## 11. Cursorへの注意

このrepoは現在、記事・画像・データが大量に入ったレガシー資産である。  
最初から全面リファクタリングしない。

安全な進め方。

- 既存 `articles/`, `x_posts/`, `data/` を削除・移動しない。
- まず新しいNext.js部分を追加する。
- 旧Pythonは `legacy/` に移すか、参照だけに留める。
- HTML生成仕様は `HANDOVER_HTML_GENERATION.md` と `CLAUDE.md` の矛盾を確認してから実装する。
- 生成AI機能は、検証ルールとプレビューが完成してから載せる。
- すべての外部投稿系処理にdry-runを用意する。

## 12. 引き継ぎ時点の未解決事項

- GitHub repoは作成済みでpush済み。
- Vercel ImportはまだNext.js化前なので、本格Deployは保留が望ましい。
- `.claude/` は旧ローカル環境設定としてコミット除外済み。
- `.env` 実体は見つからず、`.env.example` のみ確認済み。
- `package.json` がないため、現時点ではNext.jsプロジェクトではない。
- 旧ドキュメントにある一部ファイル/ディレクトリは現物とズレている可能性がある。

## 13. 推奨する次の一手

次はこのリポジトリに、Next.js + TypeScriptの最小構成を追加する。  
その後、VercelへImportし、Framework Presetは `Next.js` を選ぶ。

最初のゴールは「AI記事生成」ではなく、以下の4点。

1. 既存記事を一覧できる。
2. 既存記事をプレビューできる。
3. FIRE KIDSルール違反を検出できる。
4. WordPress投稿前のdry-run確認ができる。

この順番なら、既存資産を守りながらCursorで安全に開発を引き継げる。

## 今回学んだこと

FIRE KIDSのSEO記事ツール移行では、Vercel化の前に「現状がNext.jsではない」ことを明示し、既存資産、禁止事項、状態ゲートを分けて引き継ぐ必要がある。
