# FIRE KIDS WP投稿アップローダー（ローカルWebアプリ）

ローカルブラウザから m.firekids.jp に HTML 記事を予約投稿するためのツールです。

## 機能

1. HTMLファイルアップロード
2. タイトル自動抽出（`<!-- title: ... -->` メタコメント or `<h1>` から）
3. 個別タグ設定（カンマ区切り、新規タグは自動作成）
4. 投稿者選択
5. 予約投稿日時設定（空欄なら即時公開）

## 事前準備

### 1. WordPressのApplication Password発行

1. WP管理画面にログイン
2. ユーザー → プロフィール
3. ページ最下部「Application Passwords」セクション
4. 名前（例: `wp_uploader_local`）を入力 → 「新規アプリケーションパスワードを追加」
5. 表示される `xxxx xxxx xxxx xxxx xxxx xxxx` をコピー（一度しか表示されない）

### 2. .env設定

```bash
cd scripts/wp_uploader_local
cp .env.example .env
# .env を編集して WP_USER と WP_APP_PASSWORD を実値に
```

### 3. 依存パッケージインストール

```bash
pip install -r requirements.txt
```

## 起動

```bash
python app.py
```

ブラウザで `http://localhost:8000` を開く。

## 使い方

1. **HTMLファイル選択** → 「読み込む」
   - タイトルが自動抽出される
2. **タグ入力** → カンマ区切りで複数指定可
   - 例: `ロレックス, Cal.1030, ヴィンテージ`
3. **投稿者選択**
4. **予約投稿日時** → datetime-local 形式で指定
   - 空欄の場合は即時公開
5. **「投稿する」** → WP REST APIで投稿

## トラブルシュート

### `WP接続NG` と表示される
- `.env` の `WP_USER` / `WP_APP_PASSWORD` を確認
- Application Password はスペース含めてそのまま貼り付け
- `https://m.firekids.jp/wp-json/wp/v2/users/me` がアクセス可能か確認

### 401 Unauthorized
- Application Password が無効・失効している可能性
- 再発行して `.env` を更新

### 投稿はできたがレイアウト崩れ
- HTML本文がそのまま投稿されるため、Gutenbergブロック形式（`<!-- wp:paragraph -->` 等）が必要
- 本プロジェクトの `articles/{BRAND}/XXX_article_*.html` は対応済

## 注意

- ローカルでのみ動作（公開しない）
- `.env` は git に含めない（`.gitignore` 推奨）
- 投稿先は `WP_BASE_URL` で設定したサイトのみ
