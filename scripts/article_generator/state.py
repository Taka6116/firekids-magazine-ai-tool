"""共有定数・共有ヘルパー（Phase 2 リファクタリングで app.py から分離）。

.env の読み込み順序は分割前の app.py と同一:
  1. scripts/wp_uploader_local/.env
  2. scripts/article_generator/.env
このモジュールの import 時（= app.py の `from state import ...` 時点）に実行される。
"""
import datetime
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

from vector_store import get_store

# ─── 初期化 ──────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / "scripts" / "wp_uploader_local" / ".env", override=True)
load_dotenv(ROOT / "scripts" / "article_generator" / ".env", override=True)

# ─── ロギング ──────────────────────────────────────────────────────────────────
# ジョブの進行を追跡するための構造化ログ。秘密情報（キー・パスワード等）は
# 絶対に出力しない。job_id / brand / stage など非機密の運用情報のみを記録する。
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("fk_generator")


class InventoryMissingError(Exception):
    """ブランド指定生成で在庫が 1 件も見つからず、かつ一般記事継続も許可されていない。"""



# ─── 定数 ────────────────────────────────────────────────────────────────────

EMBED_MODEL_ID        = os.getenv("EMBED_MODEL_ID",        "amazon.titan-embed-text-v2:0")
CACHE_REFRESH_HOURS   = int(os.getenv("CACHE_REFRESH_HOURS",   "12"))
LOOKBACK_DAYS         = int(os.getenv("LOOKBACK_DAYS",          "60"))
ARTICLE_SIM_THRESHOLD = float(os.getenv("ARTICLE_SIM_THRESHOLD", "0.88"))
HEADING_SIM_THRESHOLD = float(os.getenv("HEADING_SIM_THRESHOLD", "0.86"))
HEADING_HIT_MIN       = int(os.getenv("HEADING_HIT_MIN",        "3"))
MAX_REGEN_RETRIES     = int(os.getenv("MAX_REGEN_RETRIES",      "3"))
NGRAM_SIZE            = int(os.getenv("NGRAM_SIZE",             "8"))
NGRAM_THRESHOLD       = float(os.getenv("NGRAM_THRESHOLD",      "0.18"))

BRANDS = {
    "ROLEX":     {"jp": "ロレックス",               "category_id": 8,    "path": "rolex"},
    "OMEGA":     {"jp": "オメガ",                   "category_id": 9,    "path": "omega"},
    "SEIKO":     {"jp": "セイコー",                 "category_id": 10,   "path": "seiko"},
    "CITIZEN":   {"jp": "シチズン",                 "category_id": 11,   "path": "citizen"},
    "IWC":       {"jp": "IWC",                      "category_id": 12,   "path": "iwc"},
    "TUDOR":     {"jp": "チューダー",               "category_id": 13,   "path": "tudor"},
    "ORIENT":    {"jp": "オリエント",               "category_id": 14,   "path": "orient"},
    "LONGINES":  {"jp": "ロンジン",                 "category_id": 15,   "path": "longines"},
    "JLC":       {"jp": "ジャガー・ルクルト",       "category_id": 16,   "path": "jaeger-lecoultre"},
    "CARTIER":   {"jp": "カルティエ",               "category_id": 17,   "path": "cartier"},
    "UNIVERSAL": {"jp": "ユニバーサルジュネーブ",   "category_id": 18,   "path": "universal-geneve"},
    "BREITLING": {"jp": "ブライトリング",           "category_id": 19,   "path": "breitling"},
    "VACHERON":  {"jp": "ヴァシュロン・コンスタンタン", "category_id": 20, "path": "vacheron-constantin"},
    "THEME":     {"jp": "FIRE KIDS Magazine",       "category_id": None, "path": "column"},
    "OTHER":     {"jp": "その他",                   "category_id": None, "path": "other"},
}

ARTICLE_CATEGORIES = {
    "basic":  {"jp": "時計の基礎知識", "wp_id": 2},
    "column": {"jp": "コラム",         "wp_id": 3},
    "trend":  {"jp": "トレンド",       "wp_id": 4},
}

# ─── テーマ軸（時計を選ばない記事）用ファセット定義 ──────────────────────────
# firekids.jp/products/list の検索フォーム（category_tag_id[] / watch_gender[] / decade[]）
# のパラメータと1:1で対応させる。値は同ページのHTMLから確認済み。
WATCH_STYLES = {
    "chronograph": {"jp": "クロノグラフ",       "tag_id": 8},
    "pilot":       {"jp": "パイロット",         "tag_id": 9},
    "diver":       {"jp": "ダイバーズ",         "tag_id": 10},
    "military":    {"jp": "ミリタリーウォッチ", "tag_id": 13},
    "domestic":    {"jp": "国産時計",           "tag_id": 14},
    "dress":       {"jp": "ドレスウォッチ",     "tag_id": 15},
    "sports":      {"jp": "スポーツウォッチ",   "tag_id": 16},
    "business":    {"jp": "ビジネスウォッチ",   "tag_id": 17},
    "casual":      {"jp": "カジュアルウォッチ", "tag_id": 18},
}

GENDERS = {
    "mens":   {"jp": "男性",         "gender_id": 1},
    "womens": {"jp": "女性",         "gender_id": 2},
    "unisex": {"jp": "ユニセックス", "gender_id": 3},
}

# 表示順は新しい年代→古い年代（UI上で選びやすい順）
DECADES = [
    {"key": "2000s", "jp": "2000年代", "decade_id": 11},
    {"key": "1990s", "jp": "1990年代", "decade_id": 10},
    {"key": "1980s", "jp": "1980年代", "decade_id": 9},
    {"key": "1970s", "jp": "1970年代", "decade_id": 8},
    {"key": "1960s", "jp": "1960年代", "decade_id": 7},
    {"key": "1950s", "jp": "1950年代", "decade_id": 6},
    {"key": "1940s", "jp": "1940年代", "decade_id": 5},
    {"key": "1930s", "jp": "1930年代", "decade_id": 4},
    {"key": "1920s", "jp": "1920年代", "decade_id": 3},
    {"key": "1910s", "jp": "1910年代", "decade_id": 2},
    {"key": "1900s", "jp": "1900年代", "decade_id": 1},
]
DECADE_MAP = {d["key"]: d for d in DECADES}

TONES = ["guide", "verify", "comparison", "ranking"]

TONE_LABELS = {
    "guide":      "ガイド系（○○とは・解説）",
    "verify":     "検証系（本当に○○？・やめとけ）",
    "comparison": "比較系（AとBの違い）",
    "ranking":    "ランキング系（TOP10・10選）",
}

TONE_CHARS = {
    "guide":      "7000〜9000字",
    "verify":     "6000〜8000字",
    "comparison": "6500〜8500字",
    "ranking":    "7000〜9000字",
}


def _parse_modified(value: str) -> datetime.datetime | None:
    """WordPress modified/date 文字列を naive datetime に正規化する。"""
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value[:19])
    except Exception:
        return None


def _lookback_cutoff() -> datetime.datetime:
    return datetime.datetime.now() - datetime.timedelta(days=LOOKBACK_DAYS)


def _brand_records(brand_key: str, article_category: str = "basic") -> list[dict]:
    store     = get_store()
    brand_cat = BRANDS.get(brand_key, {}).get("category_id")
    art_cat_id = ARTICLE_CATEGORIES.get(article_category, {}).get("wp_id")
    records   = store.list_by_category(brand_cat) if brand_cat else store.list_all()
    # 記事カテゴリでさらにフィルタ
    if art_cat_id:
        filtered = [r for r in records if art_cat_id in (r.get("brand_categories") or [])]
        # ブランド×カテゴリの組み合わせで記事が少ない場合、同カテゴリ全ブランドをフォールバック
        if len(filtered) < 5:
            all_cat = [r for r in store.list_all() if art_cat_id in (r.get("brand_categories") or [])]
            seen = {r.get("post_id") for r in filtered}
            for r in all_cat:
                if r.get("post_id") not in seen:
                    filtered.append(r)
            records = filtered
        else:
            records = filtered
    return sorted(records, key=lambda r: r.get("modified", ""), reverse=True)


def _prioritized_cached_records(brand_key: str, article_category: str = "basic") -> list[dict]:
    """生成時の重複チェック用キャッシュ。

    通常運用では直近 LOOKBACK_DAYS 日を優先する。古い記事は WordPress へ
    再取得しに行かず、S3/ローカルに存在するキャッシュだけを参照する。
    """
    cutoff = _lookback_cutoff()
    recent: list[dict] = []
    older_cached: list[dict] = []
    for record in _brand_records(brand_key, article_category):
        modified = _parse_modified(record.get("modified", ""))
        if modified and modified >= cutoff:
            recent.append(record)
        else:
            older_cached.append(record)
    return recent + older_cached
