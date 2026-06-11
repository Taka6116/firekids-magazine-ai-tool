"""WordPress REST API 共通クライアント処理（Phase 3 リファクタリングで抽出）。

wp_uploader_local / wp_unpublisher_local の両アプリから参照される。
関数は base_url / auth / headers をパラメータで受け取り、各アプリの
従来のリクエスト形状（ヘッダー有無・タイムアウト値）をそのまま再現できる。
"""
import requests

# XSERVER 等の WAF は python-requests のデフォルト UA を 403 で弾くため、
# ブラウザ相当の User-Agent を全 WP リクエストに付与する。
WP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


def build_auth(user, app_password):
    """Basic 認証タプルを返す。
    Application Password のスペースを除去（requests の latin-1 制限を回避）。
    """
    return (user, app_password.replace(' ', ''))


def fetch_me(base_url, auth, headers=None, timeout=15):
    """/users/me で認証確認する（health チェック用）。requests.Response を返す。"""
    return requests.get(f'{base_url}/wp-json/wp/v2/users/me',
                        auth=auth, headers=headers, timeout=timeout)


def get_or_create_tag(base_url, auth, headers, name):
    try:
        r = requests.get(
            f'{base_url}/wp-json/wp/v2/tags',
            params={'search': name, 'per_page': 100},
            auth=auth,
            headers=headers,
            timeout=15,
        )
        if r.ok:
            for t in r.json():
                if t['name'] == name:
                    return t['id']
        r = requests.post(
            f'{base_url}/wp-json/wp/v2/tags',
            json={'name': name},
            auth=auth,
            headers=headers,
            timeout=15,
        )
        if r.ok:
            return r.json()['id']
        if r.status_code == 400:
            try:
                existing = r.json().get('data', {}).get('term_id')
                if existing:
                    return existing
            except Exception:
                pass
    except Exception as e:
        print(f'get_or_create_tag error ({name}): {e}')
    return None


def get_category_id_by_name(base_url, auth, headers, name):
    """カテゴリ名から ID を取得（完全一致）"""
    try:
        r = requests.get(
            f'{base_url}/wp-json/wp/v2/categories',
            params={'search': name, 'per_page': 100},
            auth=auth,
            headers=headers,
            timeout=15,
        )
        if r.ok:
            for c in r.json():
                if c['name'] == name:
                    return c['id']
    except Exception as e:
        print(f'get_category_id_by_name error ({name}): {e}')
    return None


def find_user_id_by_keyword(base_url, auth, headers, keyword):
    """名前にキーワードを含む WP ユーザーの ID を取得（ライター固定用）"""
    try:
        r = requests.get(
            f'{base_url}/wp-json/wp/v2/users',
            params={'per_page': 100, 'context': 'edit'},
            auth=auth,
            headers=headers,
            timeout=15,
        )
        if r.ok:
            for u in r.json():
                if keyword in u.get('name', ''):
                    return u['id']
    except Exception as e:
        print(f'get_writer_user_id error: {e}')
    return None


def upload_media_from_url(base_url, auth, base_headers, image_url):
    """画像URLからダウンロードしてWPメディアにアップロード、IDを返す"""
    try:
        img_resp = requests.get(image_url, headers=base_headers, timeout=30)
        if not img_resp.ok:
            return None
        filename = image_url.split('/')[-1].split('?')[0]
        if not filename:
            filename = 'featured.jpg'
        headers = {
            **base_headers,
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Type': img_resp.headers.get('Content-Type', 'image/jpeg'),
        }
        r = requests.post(
            f'{base_url}/wp-json/wp/v2/media',
            data=img_resp.content,
            headers=headers,
            auth=auth,
            timeout=60,
        )
        if r.ok:
            return r.json().get('id')
    except Exception as e:
        print(f'media upload error: {e}')
    return None
