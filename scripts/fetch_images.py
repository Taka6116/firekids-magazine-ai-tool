"""
FIRE KIDS SEO記事作成 - CDN画像URL自動取得スクリプト
firekids.jpのカテゴリページから商品画像URLを取得し、
キーワードで絞り込んでJSON出力します。

使い方:
  python3 scripts/fetch_images.py SEIKO グランドセイコー
  python3 scripts/fetch_images.py OMEGA コンステレーション
  python3 scripts/fetch_images.py ROLEX デイトジャスト
  python3 scripts/fetch_images.py OTHER オーデマピゲ

出力:
  - コンソール: 商品名+画像URL一覧
  - JSON: data/images_[ブランド]_[キーワード].json
"""
import urllib.request
import re
import json
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

# ブランド → カテゴリID対応表
BRAND_CATEGORY = {
    "SEIKO": 10,
    "OMEGA": 9,
    "ROLEX": 8,
    "CITIZEN": 11,
    "IWC": 12,
    "TUDOR": 13,
    "ORIENT": 14,
    "LONGINES": 15,
    "JLC": 16,
    "CARTIER": 17,
    "UNIVERSAL": 18,
    "BREITLING": 19,
    "VC": 20,
    "PATEK": 21,
    "AP": 22,
    "OTHER": 23,
}

# 日本語ブランド名 → カテゴリID対応表（OTHER指定時に使用）
BRAND_NAME_CATEGORY = {
    "オーデマピゲ": 22,
    "パテック": 21,
    "ヴァシュロン": 20,
    "ブライトリング": 19,
    "ユニバーサル": 18,
    "カルティエ": 17,
    "ジャガー": 16,
    "ロンジン": 15,
    "オリエント": 14,
    "チューダー": 13,
}


def fetch_category_page(category_id, page=1):
    """カテゴリページのHTMLを取得"""
    url = f"https://firekids.jp/products/list?category_id={category_id}&pageno={page}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
    resp = urllib.request.urlopen(req, timeout=15)
    return resp.read().decode("utf-8", errors="ignore")


def extract_products(html):
    """HTMLから商品情報（画像URL・商品名・商品ID）を抽出"""
    products = []
    pattern = r'<img[^>]*src="(https://cdn\.firekids\.jp/products/(\d+)/([^"]+))"[^>]*alt="([^"]*)"'
    for match in re.finditer(pattern, html):
        img_url = match.group(1)
        product_id = match.group(2)
        filename = match.group(3)
        name = match.group(4)
        products.append({
            "product_id": product_id,
            "name": name,
            "image_url": img_url,
            "filename": filename,
        })
    return products


def has_next_page(html):
    """次のページがあるか確認"""
    return 'class="ec-pager__item--next"' in html


def main():
    # 引数処理
    brand = sys.argv[1].upper() if len(sys.argv) > 1 else "SEIKO"
    keyword = sys.argv[2] if len(sys.argv) > 2 else ""

    # カテゴリID決定
    if brand == "OTHER" and keyword:
        category_id = None
        for name, cid in BRAND_NAME_CATEGORY.items():
            if name in keyword:
                category_id = cid
                break
        if not category_id:
            category_id = BRAND_CATEGORY.get("OTHER", 23)
    else:
        category_id = BRAND_CATEGORY.get(brand, 23)

    print(f"=== FIRE KIDS CDN画像取得 ===")
    print(f"ブランド: {brand} | キーワード: {keyword} | カテゴリID: {category_id}")
    print()

    # 全ページから商品を取得
    all_products = []
    page = 1
    while True:
        print(f"  ページ {page} を取得中...")
        try:
            html = fetch_category_page(category_id, page)
            products = extract_products(html)
            if not products:
                break
            all_products.extend(products)
            if not has_next_page(html):
                break
            page += 1
            time.sleep(0.5)  # サーバー負荷軽減
        except Exception as e:
            print(f"  エラー: {e}")
            break

    print(f"\n取得合計: {len(all_products)}件")

    # キーワードで絞り込み
    if keyword:
        filtered = [p for p in all_products if keyword in p["name"]]
        print(f"キーワード「{keyword}」で絞り込み: {len(filtered)}件\n")
    else:
        filtered = all_products

    # 結果表示
    print("=" * 60)
    for i, p in enumerate(filtered, 1):
        print(f"[{i}] {p['name'][:60]}")
        print(f"    ID: {p['product_id']}")
        print(f"    IMG: {p['image_url']}")
        print()

    # WordPress用HTMLスニペットも出力
    print("=" * 60)
    print("■ WordPress用画像ブロック（コピペ用）")
    print("=" * 60)
    for p in filtered:
        alt = p["name"][:50]
        print(f"""
<!-- wp:image {{"width":"480px","sizeSlug":"large"}} -->
<figure class="wp-block-image size-large is-resized"><img src="{p['image_url']}" alt="{alt}" style="width:480px"/></figure>
<!-- /wp:image -->""")

    # JSON保存
    out_file = BASE_DIR / "data" / f"images_{brand}_{keyword or 'all'}.json"
    output = {
        "brand": brand,
        "keyword": keyword,
        "category_id": category_id,
        "count": len(filtered),
        "products": filtered,
    }
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nJSONを保存しました: {out_file}")


if __name__ == "__main__":
    main()
