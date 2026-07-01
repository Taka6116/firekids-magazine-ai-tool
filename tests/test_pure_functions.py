"""純粋関数のスナップショットテスト（Phase 0 安全網）。

現状の出力をそのまま正解とする。仕様の正しさは問わない。
リファクタリング後もこのテストがグリーンであれば挙動が保存されている。
"""
import json
from pathlib import Path

import pytest

import app
import overlap

SNAPSHOTS = json.loads((Path(__file__).parent / "_snapshots.json").read_text(encoding="utf-8"))


# ─── title_to_slug ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("title,expected", list(SNAPSHOTS["title_to_slug"].items()))
def test_title_to_slug(title, expected):
    assert app.title_to_slug(title) == expected


# ─── markdown_to_wp_html ─────────────────────────────────────────────────────

MD_SAMPLE = """# タイトル行

## 見出し2

これは段落です。**強調**と[リンク](https://example.com)を含みます。

- 箇条書き1
- 箇条書き2

1. 番号付き1
2. 番号付き2

| モデル | 年代 |
|---|---|
| 62GS | 1967 |
| 44GS | 1968 |

---

### 見出し3

最後の段落。
"""


def test_markdown_to_wp_html_snapshot():
    assert app.markdown_to_wp_html(MD_SAMPLE) == SNAPSHOTS["markdown_to_wp_html"]


def test_markdown_to_wp_html_table_is_gutenberg_block():
    html = app.markdown_to_wp_html(MD_SAMPLE)
    assert '<!-- wp:table {"hasFixedLayout":true,"className":"is-style-stripes"} -->' in html
    assert "<!-- /wp:table -->" in html


CTA_URL = (
    "https://firekids.jp/products/list?category_id=14"
    "&utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic"
)


def test_cta_standalone_line_becomes_buttons_block():
    md = f"[オリエントのヴィンテージ時計をFIRE KIDSで探す]({CTA_URL})"
    html = app.markdown_to_wp_html(md)
    assert "<!-- wp:buttons" in html
    assert "wp-block-button__link" in html
    assert "オリエントのヴィンテージ時計をFIRE KIDSで探す" in html
    assert "firekids.jp/products/list?category_id=14" in html
    assert "<p>" not in html


def test_cta_embedded_in_paragraph_splits():
    md = (
        f"オリエントのヴィンテージ時計を探している方は、FIRE KIDSの"
        f"[オリエント ヴィンテージ時計をFIRE KIDSで探す]({CTA_URL})。"
        f"三角時計も人気です。"
    )
    html = app.markdown_to_wp_html(md)
    assert "<!-- wp:buttons" in html
    assert "wp-block-button__link" in html
    assert "<p>オリエントのヴィンテージ時計を探している方は、FIRE KIDSの</p>" in html
    assert "<p>。三角時計も人気です。</p>" in html


def test_non_cta_link_stays_inline():
    md = "詳細は[こちら](https://example.com)をご覧ください。"
    html = app.markdown_to_wp_html(md)
    assert '<a href="https://example.com">こちら</a>' in html
    assert "wp:buttons" not in html


def test_fetch_image_for_item_uses_index_when_present(monkeypatch):
    import inventory as inv_mod

    item = {
        "fk_id": "FK000001",
        "brand_key": "SEIKO",
        "brand_raw": "SEIKO",
        "model": "テストモデル",
    }
    expected = {
        "s3_key": "images/SEIKO/FK000001/main.jpg",
        "source_url": "https://cdn.firekids.jp/products/1/test.jpg",
        "alt": "SEIKO / テストモデル",
    }
    monkeypatch.setattr(inv_mod, "get_image_for_item", lambda _item: expected)

    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("fetch_fk_record should not be called when index hit")

    monkeypatch.setattr("image_crawler.fetch_fk_record", fail_fetch)
    assert inv_mod.fetch_image_for_item(item) == expected


def test_fetch_image_for_item_on_demand_for_featured_fk(monkeypatch):
    import inventory as inv_mod

    item = {
        "fk_id": "FK000099",
        "brand_key": "ORIENT",
        "brand_raw": "オリエント",
        "model": "三角時計",
    }
    calls = {"fetch": 0, "upsert": None}

    def fake_get_image(it):
        if calls["fetch"]:
            return {
                "s3_key": "images/ORIENT/FK000099/main.jpg",
                "source_url": "https://cdn.firekids.jp/products/99/99_1.jpg",
                "alt": "オリエント / 三角時計",
            }
        return None

    def fake_fetch_fk(fk_id, brand_key="OTHER", name="", max_pages=50):
        calls["fetch"] += 1
        assert fk_id == "FK000099"
        return {
            "fk_id": fk_id,
            "brand_key": brand_key,
            "main_image_url": "https://cdn.firekids.jp/products/99/99_1.jpg",
            "name": name,
        }

    def fake_upsert(record):
        calls["upsert"] = record["fk_id"]
        return {"fk_id": record["fk_id"], "source_url": record["main_image_url"]}

    monkeypatch.setattr(inv_mod, "get_image_for_item", fake_get_image)
    monkeypatch.setattr(inv_mod, "clear_image_index_cache", lambda: None)
    monkeypatch.setattr("image_crawler.fetch_fk_record", fake_fetch_fk)
    monkeypatch.setattr("image_store.upsert_fk_record", fake_upsert)

    result = inv_mod.fetch_image_for_item(item)
    assert calls["fetch"] == 1
    assert calls["upsert"] == "FK000099"
    assert result["source_url"].endswith("99_1.jpg")


def test_fk_to_product_id():
    from scripts.article_generator.image_crawler import _fk_to_product_id

    assert _fk_to_product_id("FK014781") == "14781"
    assert _fk_to_product_id("FK000001") == "1"
    assert _fk_to_product_id("invalid") == ""


# ─── strip_tags ──────────────────────────────────────────────────────────────

def test_strip_tags_snapshot():
    src = '<p>Hello &amp; <b>world</b></p>\n<div>second &nbsp; line &#8211; dash</div>'
    assert app.strip_tags(src) == SNAPSHOTS["strip_tags"]


# ─── extract_h2_sections ─────────────────────────────────────────────────────

def test_extract_h2_sections_snapshot():
    src = (
        "<p>intro</p><h2>First Heading</h2><p>body one text</p>"
        "<h2><span>Second</span> Heading</h2><p>body two text</p><h2></h2><p>skipped</p>"
    )
    assert app.extract_h2_sections(src) == SNAPSHOTS["extract_h2_sections"]


# ─── cosine ──────────────────────────────────────────────────────────────────

def test_cosine_snapshot():
    values = [
        app.cosine([1, 0, 0], [1, 0, 0]),
        app.cosine([1, 2, 3], [4, 5, 6]),
        app.cosine(None, [1]),
        app.cosine([1], [1, 2]),
        app.cosine([0, 0], [0, 0]),
    ]
    assert values == pytest.approx(SNAPSHOTS["cosine"])


# ─── check_ngram_overlap ─────────────────────────────────────────────────────

def test_check_ngram_overlap_flags_identical_text(monkeypatch):
    body = "ヴィンテージロレックスの魅力は経年変化したダイヤルにあります。" * 5
    records = [
        {"title": "過去記事A", "url": "https://example.com/a", "body_snippet": body},
        {"title": "過去記事B", "url": "https://example.com/b", "body_snippet": "全く別の内容です。" * 10},
    ]
    # Phase 2 以降、check_ngram_overlap の実体は overlap モジュールにある
    monkeypatch.setattr(overlap, "_prioritized_cached_records", lambda *a, **k: records)

    flagged = app.check_ngram_overlap(body, "ROLEX")
    assert len(flagged) == 1
    assert flagged[0]["title"] == "過去記事A"
    assert flagged[0]["ngram_overlap"] == 1.0


def test_check_ngram_overlap_empty_input(monkeypatch):
    monkeypatch.setattr(overlap, "_prioritized_cached_records", lambda *a, **k: [])
    assert app.check_ngram_overlap("", "ROLEX") == []


# ─── facets（テーマ記事＝時計を選ばない記事のファセット処理） ─────────────────

def test_has_any_facet():
    import facets

    assert facets.has_any_facet() is False
    assert facets.has_any_facet(styles=[]) is False
    assert facets.has_any_facet(styles=["diver"]) is True
    assert facets.has_any_facet(genders=["mens"]) is True
    assert facets.has_any_facet(decades=["1970s"]) is True
    assert facets.has_any_facet(model_query="スピードマスター") is True
    assert facets.has_any_facet(min_price=100000) is True
    assert facets.has_any_facet(max_price=0) is False


def test_build_facet_cta_url_category_only():
    import facets

    url = facets.build_facet_cta_url(styles=["diver"])
    assert url == (
        "https://firekids.jp/products/list?category_tag_id[]=10"
        "&utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic"
    )


def test_build_facet_cta_url_full_combination():
    import facets

    url = facets.build_facet_cta_url(
        brand_key="OMEGA", styles=["diver"], genders=["mens"], decades=["1970s"],
        model_query="シーマスター", min_price=100000, max_price=300000,
    )
    assert url == (
        "https://firekids.jp/products/list?category_id=9"
        "&category_tag_id[]=10&watch_gender[]=1&decade[]=8"
        "&name=%E3%82%B7%E3%83%BC%E3%83%9E%E3%82%B9%E3%82%BF%E3%83%BC"
        "&min_price=100000&max_price=300000"
        "&utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic"
    )


def test_build_facet_cta_url_ignores_unknown_brand():
    import facets

    url = facets.build_facet_cta_url(brand_key="THEME", styles=["dress"])
    assert "category_id=" not in url
    assert "category_tag_id[]=15" in url


def test_facet_labels_price_only():
    import facets

    assert facets.facet_labels(min_price=100000, max_price=300000) == ["予算100,000円〜300,000円"]
    assert facets.facet_labels(max_price=300000) == ["予算300,000円以内"]
    assert facets.facet_labels(styles=["dress"], genders=["womens"]) == ["ドレスウォッチ", "女性"]


def test_cta_url_without_category_id_still_renders_as_button():
    """category_id を含まないファセット限定CTAでも wp:buttons に変換されること。"""
    facet_url = (
        "https://firekids.jp/products/list?category_tag_id[]=15"
        "&utm_source=firekids_magazine&utm_medium=seo&utm_campaign=organic"
    )
    md = f"[ドレスウォッチをFIRE KIDSで探す]({facet_url})"
    html = app.markdown_to_wp_html(md)
    assert "<!-- wp:buttons" in html
    assert "wp-block-button__link" in html
