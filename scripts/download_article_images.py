"""
FIRE KIDS SEO記事作成 - 記事代表画像ダウンロードスクリプト

記事HTMLから代表画像（OG画像 = 最初のCDN画像）を1枚ダウンロードします。
X長文投稿の冒頭画像として使用。

使い方:
  # 特定の記事
  python3 scripts/download_article_images.py articles/CARTIER/article_cristal_cal78.html

  # ブランドフォルダ内の全記事
  python3 scripts/download_article_images.py articles/OMEGA/

  # 全記事
  python3 scripts/download_article_images.py articles/

出力先:
  data/images/{slug}.jpg  （例: data/images/cristal_cal78.jpg）
"""
import urllib.request
import re
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
IMAGES_DIR = BASE_DIR / "data" / "images"

CDN_PATTERN = re.compile(
    r'https://cdn\.firekids\.jp/products/\d+/[^\s"\'<>]+\.(?:jpg|jpeg|png|gif|webp)',
    re.IGNORECASE,
)


def extract_slug(filepath):
    """ファイル名からslugを抽出（article_xxx.html → xxx）"""
    stem = Path(filepath).stem
    if stem.startswith("article_"):
        return stem[len("article_"):]
    return stem


def extract_first_image_url(filepath):
    """記事ファイルから最初のCDN画像URLを取得（= 代表画像）"""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    match = CDN_PATTERN.search(content)
    return match.group(0) if match else None


def download_image(url, save_path):
    """画像をダウンロードして保存"""
    if save_path.exists():
        print(f"  スキップ（既存）: {save_path.name}")
        return True

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
        resp = urllib.request.urlopen(req, timeout=15)
        data = resp.read()

        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "wb") as f:
            f.write(data)

        size_kb = len(data) / 1024
        print(f"  保存: {save_path.name} ({size_kb:.0f}KB)")
        return True
    except Exception as e:
        print(f"  エラー: {e}")
        return False


def process_article(filepath):
    """1つの記事から代表画像1枚をダウンロード"""
    filepath = Path(filepath)
    slug = extract_slug(filepath)

    url = extract_first_image_url(filepath)
    if not url:
        print(f"  {filepath.name}: 画像なし")
        return 0

    # 拡張子をURLから取得
    ext = Path(url.split("?")[0]).suffix or ".jpg"
    save_path = IMAGES_DIR / f"{slug}{ext}"

    print(f"  {filepath.name} → {save_path.name}")
    return 1 if download_image(url, save_path) else 0


def find_articles(target_path):
    """指定パスから記事ファイルを検索"""
    target = Path(target_path)
    if target.is_file():
        return [target]

    articles = []
    for ext in ("*.html", "*.txt"):
        articles.extend(sorted(target.rglob(ext)))
    return articles


def main():
    if len(sys.argv) < 2:
        print("使い方:")
        print("  python3 scripts/download_article_images.py articles/CARTIER/article_cristal_cal78.html")
        print("  python3 scripts/download_article_images.py articles/OMEGA/")
        print("  python3 scripts/download_article_images.py articles/")
        sys.exit(1)

    target = sys.argv[1]
    target_path = Path(target)
    if not target_path.is_absolute():
        target_path = BASE_DIR / target

    print("=== FIRE KIDS 代表画像ダウンロード（1記事1枚） ===")

    articles = find_articles(target_path)
    if not articles:
        print(f"記事ファイルが見つかりません: {target_path}")
        sys.exit(1)

    print(f"対象記事: {len(articles)}件\n")

    total = 0
    for article in articles:
        total += process_article(article)
        time.sleep(0.3)

    print(f"\n完了: {total}/{len(articles)}枚ダウンロード")
    print(f"保存先: {IMAGES_DIR}/")


if __name__ == "__main__":
    main()
