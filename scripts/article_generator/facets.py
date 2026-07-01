"""テーマ軸（時計を選ばない）記事のためのファセット処理。

「ブランド」「小ブランド/モデル名」「カテゴリ」「年代」「性別」「金額」を
firekids.jp/products/list の検索フォームと同じパラメータに変換し、
特定の1本を主役にしない「テーマ記事」の CTA リンクを組み立てる。

対応パラメータ（firekids.jp/products/list の実フォームから確認済み）:
  category_id      ブランド（単一）
  category_tag_id[] カテゴリ/スタイル（複数可）
  watch_gender[]    性別（複数可）
  decade[]          年代（複数可）
  name              モデル名フリーテキスト（小ブランド軸に使う）
  min_price/max_price 価格帯
"""
from __future__ import annotations

from urllib.parse import quote

from state import BRANDS, DECADE_MAP, GENDERS, WATCH_STYLES

CTA_UTM_ARTICLE = "utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic"


def _clean_list(values: list[str] | None) -> list[str]:
    return [v for v in (values or []) if v]


def _clean_price(value) -> int | None:
    try:
        n = int(str(value).replace(",", "").strip())
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def has_any_facet(
    styles: list[str] | None = None,
    genders: list[str] | None = None,
    decades: list[str] | None = None,
    model_query: str = "",
    min_price=None,
    max_price=None,
) -> bool:
    """いずれかのファセットが指定されていれば True（＝「時計を選ばない」テーマ記事モード）。"""
    return bool(
        _clean_list(styles) or _clean_list(genders) or _clean_list(decades)
        or (model_query or "").strip()
        or _clean_price(min_price) or _clean_price(max_price)
    )


def facet_labels(
    styles: list[str] | None = None,
    genders: list[str] | None = None,
    decades: list[str] | None = None,
    model_query: str = "",
    min_price=None,
    max_price=None,
) -> list[str]:
    """企画プロンプト・UI表示用の日本語ラベル一覧。"""
    labels: list[str] = []
    for k in _clean_list(styles):
        s = WATCH_STYLES.get(k)
        if s:
            labels.append(s["jp"])
    for k in _clean_list(decades):
        d = DECADE_MAP.get(k)
        if d:
            labels.append(d["jp"])
    for k in _clean_list(genders):
        g = GENDERS.get(k)
        if g:
            labels.append(g["jp"])
    if (model_query or "").strip():
        labels.append(model_query.strip())
    lo, hi = _clean_price(min_price), _clean_price(max_price)
    if lo and hi:
        labels.append(f"予算{lo:,}円〜{hi:,}円")
    elif hi:
        labels.append(f"予算{hi:,}円以内")
    elif lo:
        labels.append(f"予算{lo:,}円以上")
    return labels


def build_facet_cta_url(
    brand_key: str = "",
    styles: list[str] | None = None,
    genders: list[str] | None = None,
    decades: list[str] | None = None,
    model_query: str = "",
    min_price=None,
    max_price=None,
) -> str:
    """ファセット条件から firekids.jp の商品一覧URL（UTM付き）を組み立てる。

    brand_key が BRANDS に無い/空（="THEME"等）の場合は category_id を付けず、
    カテゴリ横断のテーマ記事として扱う。
    """
    params: list[str] = []

    cat_id = BRANDS.get(brand_key or "", {}).get("category_id")
    if cat_id:
        params.append(f"category_id={cat_id}")

    for k in _clean_list(styles):
        tag_id = WATCH_STYLES.get(k, {}).get("tag_id")
        if tag_id:
            params.append(f"category_tag_id[]={tag_id}")

    for k in _clean_list(genders):
        gender_id = GENDERS.get(k, {}).get("gender_id")
        if gender_id:
            params.append(f"watch_gender[]={gender_id}")

    for k in _clean_list(decades):
        decade_id = DECADE_MAP.get(k, {}).get("decade_id")
        if decade_id:
            params.append(f"decade[]={decade_id}")

    if (model_query or "").strip():
        params.append(f"name={quote(model_query.strip())}")

    lo, hi = _clean_price(min_price), _clean_price(max_price)
    if lo:
        params.append(f"min_price={lo}")
    if hi:
        params.append(f"max_price={hi}")

    params.append(CTA_UTM_ARTICLE)
    return "https://firekids.jp/products/list?" + "&".join(params)
