"""
仕入れデータ CSV ローダー & 在庫フィルター

CSV カラム定義（0 始まり / 実データから確認済み）:
  0  : 特記事項（修理不能品 等 / 旧FK番号）
  1  : FK番号       ← 主キー (FK + 6桁)
  2  : ブランド
  3  : モデル名（正式名称 / 表示上は「正」）
  4  : 製造年製
  5  : 仕入日
  6  : HP掲載日
  7  : 支払日
  8  : 支払状況（「済」等）
  9  : 区分
  10 : 出金口座
  11 : 個人 or ディーラー
  12 : バイヤー（仕入先）
  13 : 仕入価格
  14 : OH費用
  15 : 原価
  16 : 売上日       ← 空 = 在庫中
  17 : 入金日
  18 : お客様
  19 : 売上種類
  20 : 店頭価格
  21 : 商品部（予算価格等）
  22 : 売上価格
  23 : 消費税
  24 : 入力方法
  25 : 販売チャネル
  26 : 粗利益（予算）
  27 : 粗利益率（予算）
  28 : 粗利益（実績）
  29 : 粗利益率（実績）
  30 : 備考         ← Ref./Cal./Ser. 等を含む
  31 : 買い取り理由
  32 : 値付け理由

在庫判定: 売上日（Col 16）が空 かつ FK番号が存在するレコード

S3 連携:
  S3_BUCKET         バケット名（未設定なら S3 スキップ）
  INVENTORY_S3_KEY  オブジェクトキー（デフォルト: inventory.csv）
  INVENTORY_CSV_PATH ローカルパス（ローカル開発用）
"""
from __future__ import annotations

import csv
import io
import os
import re
from pathlib import Path
from typing import Optional

# ── カラムインデックス ─────────────────────────────────────────────
COL_FLAGS      = 0
COL_FK_ID      = 1
COL_BRAND      = 2
COL_MODEL      = 3
COL_ERA        = 4
COL_HP_DATE    = 6
COL_SOLD_DATE  = 16
COL_LIST_PRICE = 20
COL_CHANNEL    = 25
COL_NOTES      = 30

# ── ブランド名正規化（CSV 表記 → BRANDS キー） ─────────────────────
_BRAND_MAP: dict[str, str] = {
    "ROLEX":               "ROLEX",
    "TUDOR":               "TUDOR",
    "TUDOR ROLEX":         "TUDOR",
    "OMEGA":               "OMEGA",
    "SEIKO":               "SEIKO",
    "GRAND SEIKO":         "SEIKO",
    "CITIZEN":             "CITIZEN",
    "IWC":                 "IWC",
    "ORIENT":              "ORIENT",
    "LONGINES":            "LONGINES",
    "JAEGER":              "JLC",
    "JAEGER-LECOULTRE":    "JLC",
    "CARTIER":             "CARTIER",
    "UNIVERSAL GENEVE":    "UNIVERSAL",
    "UNIVERSAL":           "UNIVERSAL",
    "BREITLING":           "BREITLING",
    "VACHERON":            "VACHERON",
    "VACHERON CONSTANTIN": "VACHERON",
}


def normalize_brand(raw: str) -> str:
    """CSV のブランド文字列を BRANDS キーに変換する。未知ブランドは OTHER。"""
    return _BRAND_MAP.get(raw.strip().upper(), "OTHER")


def _parse_notes(notes: str) -> dict[str, str]:
    """備考欄から Ref./Cal./Ser. を抽出する（大小文字・区切り文字の揺れに対応）。"""
    ref = cal = serial = ""
    m = re.search(r'[Rr]ef[.\s#:]*([A-Za-z0-9\-/\.]+)', notes)
    if m:
        ref = m.group(1).strip(".")
    m = re.search(r'[Cc]al[.\s#:]*([A-Za-z0-9\-/\.]+)', notes)
    if m:
        cal = m.group(1).strip(".")
    m = re.search(r'[Ss]er[.\s#:]*([A-Za-z0-9\-/\.]+)', notes)
    if m:
        serial = m.group(1).strip(".")
    return {"ref": ref, "cal": cal, "serial": serial}


def _parse_csv(content: str) -> list[dict]:
    """CSV テキストを在庫レコードのリストに変換する。売却済みは除外。"""
    items: list[dict] = []
    reader = csv.reader(io.StringIO(content))
    for idx, row in enumerate(reader):
        if idx == 0:
            continue  # ヘッダー行スキップ

        def col(n: int) -> str:
            return row[n].strip() if len(row) > n else ""

        fk_id = col(COL_FK_ID)
        if not re.match(r"^FK\d+$", fk_id):
            continue  # FK番号がない行をスキップ

        if col(COL_SOLD_DATE):
            continue  # 売却済み

        notes  = col(COL_NOTES)
        parsed = _parse_notes(notes)

        items.append({
            "fk_id":      fk_id,
            "brand_raw":  col(COL_BRAND),
            "brand_key":  normalize_brand(col(COL_BRAND)),
            "model":      col(COL_MODEL),
            "era":        col(COL_ERA),
            "ref":        parsed["ref"],
            "cal":        parsed["cal"],
            "serial":     parsed["serial"],
            "notes":      notes,
            "hp_date":    col(COL_HP_DATE),
            "channel":    col(COL_CHANNEL),
            "flags":      col(COL_FLAGS),
            "list_price": col(COL_LIST_PRICE),
            "is_listed":  bool(col(COL_HP_DATE)),
        })

    return items


# ── ファイル読み込みヘルパー ──────────────────────────────────────

def _decode(raw: bytes) -> str | None:
    for enc in ("utf-8-sig", "cp932", "utf-8"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, AttributeError):
            continue
    return None


def _read_local(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        return _decode(path.read_bytes())
    except Exception:
        return None


def _read_s3() -> str | None:
    bucket = os.getenv("S3_BUCKET", "")
    key    = os.getenv("INVENTORY_S3_KEY", "inventory.csv")
    if not bucket:
        return None
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        obj = s3.get_object(Bucket=bucket, Key=key)
        return _decode(obj["Body"].read())
    except Exception:
        return None


def write_s3(csv_bytes: bytes) -> bool:
    """S3 に CSV バイト列をアップロードする。成功したら True。"""
    bucket = os.getenv("S3_BUCKET", "")
    key    = os.getenv("INVENTORY_S3_KEY", "inventory.csv")
    if not bucket:
        return False
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        s3.put_object(Bucket=bucket, Key=key, Body=csv_bytes, ContentType="text/csv")
        return True
    except Exception:
        return False


# ── メモリキャッシュ ──────────────────────────────────────────────

_cache: list[dict] | None = None


def load_inventory(force: bool = False) -> list[dict]:
    """在庫データを返す（メモリキャッシュあり）。

    読み込み優先順位:
      1. 環境変数 INVENTORY_CSV_PATH で指定したローカルファイル
      2. S3（S3_BUCKET が設定されている場合）
      3. /tmp/inventory.csv（Web UI からアップロードされたファイル）
    """
    global _cache
    if _cache is not None and not force:
        return _cache

    content: str | None = None

    env_path = os.getenv("INVENTORY_CSV_PATH", "")
    if env_path:
        content = _read_local(Path(env_path))

    if content is None:
        content = _read_s3()

    if content is None:
        content = _read_local(Path("/tmp/inventory.csv"))

    _cache = _parse_csv(content) if content else []
    return _cache


def reload_from_bytes(csv_bytes: bytes) -> list[dict]:
    """アップロードされた CSV バイト列でキャッシュを更新し、S3 にも保存する。"""
    global _cache
    Path("/tmp/inventory.csv").write_bytes(csv_bytes)
    write_s3(csv_bytes)
    content = _decode(csv_bytes)
    _cache = _parse_csv(content) if content else []
    return _cache


def get_in_stock(brand_key: str | None = None) -> list[dict]:
    """在庫アイテムのリストを返す。brand_key でフィルター可能。"""
    items = load_inventory()
    if brand_key:
        return [i for i in items if i["brand_key"] == brand_key]
    return items


def find_by_fk(fk_id: str) -> dict | None:
    """FK 番号でアイテムを検索する。"""
    return next((i for i in load_inventory() if i["fk_id"] == fk_id), None)


def format_for_prompt(item: dict) -> str:
    """在庫アイテムをプロンプト挿入用テキストに変換する。"""
    lines = [
        f"FK番号: {item['fk_id']}",
        f"ブランド: {item['brand_raw']}",
        f"モデル名: {item['model']}",
    ]
    if item.get("era"):
        lines.append(f"製造年代: {item['era']}")
    if item.get("ref"):
        lines.append(f"Ref.{item['ref']}")
    if item.get("cal"):
        lines.append(f"Cal.{item['cal']}")
    if item.get("notes"):
        lines.append(f"備考: {item['notes']}")
    return "\n".join(lines)


def inventory_summary() -> dict:
    """在庫統計（UI 表示用）。"""
    items = load_inventory()
    brands: dict[str, int] = {}
    for i in items:
        brands[i["brand_raw"]] = brands.get(i["brand_raw"], 0) + 1
    return {
        "total":   len(items),
        "listed":  sum(1 for i in items if i["is_listed"]),
        "brands":  brands,
        "loaded":  len(items) > 0,
    }
