"""Gunicorn エントリポイント（本番デプロイ用）

認証フロー:
  - ブラウザが / にアクセス → portal がセッションをチェック
  - 未ログイン → /login ページ（グラスモーフィズム）
  - 認証成功 → セッションCookie発行 → ポータルへ
  - /generator/* /upload/* は全て portal 経由でセッション確認
"""
import os
import sys
from pathlib import Path

from werkzeug.middleware.dispatcher import DispatcherMiddleware

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from deploy.portal import portal
from article_generator.app import app as generator_app
from wp_uploader_local.app import app as uploader_app

# セッション秘密鍵を各 Flask アプリに伝播
secret = os.getenv("APP_SECRET_KEY", "firekids-default-secret-change-me")
portal.secret_key = secret
generator_app.secret_key = secret
uploader_app.secret_key = secret

application = DispatcherMiddleware(portal, {
    "/generator": generator_app,
    "/upload": uploader_app,
})
