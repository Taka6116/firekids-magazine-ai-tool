# WP 記事 非公開化ローカルツール

WordPress 記事のURLを貼り付けて、`private`（非公開）または `draft`（下書き）に一括変更するローカルウェブアプリ。

## セットアップ

依存関係インストール（既存 wp_uploader_local と同じ環境でOK）:

```sh
cd scripts/wp_unpublisher_local
pip3 install -r requirements.txt
```

`.env` の設定:
- 既存の `scripts/wp_uploader_local/.env` を自動で参照します
- 個別に持たせる場合は `scripts/wp_unpublisher_local/.env` を作成

必要な環境変数（既存と同じ）:
```
WP_API_URL=https://m.firekids.jp
WP_USERNAME=...
WP_APP_PASSWORD=...
```

## 起動

```sh
cd scripts/wp_unpublisher_local
python3 app.py
```

→ http://localhost:8001 を開く

ポートを変えたいときは `UNPUBLISHER_PORT=8002 python3 app.py`。

## 使い方

1. 「WP接続テスト」で認証OKを確認
2. テキストエリアに非公開化したい記事URLを1行1件で貼り付け
3. ステータス選択：
   - `private`：URL自体は残るが、ログインしたWP管理者しか閲覧できない
   - `draft`：URLは404相当、SEO的にも消える
4. 「一括実行」を押す
5. 結果テーブルで各URLの成否を確認

## 復旧
誤って非公開にした場合は、WP管理画面で対象記事を `publish` に戻してください。
