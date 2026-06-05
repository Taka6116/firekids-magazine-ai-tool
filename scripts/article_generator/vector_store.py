"""
ArticleVectorStore – 過去記事Embeddingキャッシュのリポジトリ抽象化。

現在のバックエンド : JSON ファイル（+ 任意の S3 同期）
将来のバックエンド : Aurora PostgreSQL + pgvector  /  OpenSearch Serverless

移行方法: ArticleVectorStore ABC を実装した新クラスを作り、
          get_store() が返すインスタンスを差し替えるだけで完了。

────────────────────────────────────────────────
レコードスキーマ（1記事1レコード）:
  post_id            int    WP 投稿ID
  title              str    タイトル（rendered）
  url                str    パーマリンク
  brand_categories   list   WP カテゴリ ID リスト
  modified           str    WP modified 日時 ISO8601
  content_hash       str    content.rendered の SHA-256 先頭 16 桁
                            （変更なければ再 Embedding をスキップする）
  article_embedding  list   title + excerpt + H2 一覧 + 本文冒頭 1500 字のベクトル
  heading_embeddings list   [{heading, text, vec}, ...]  H2 ごとのベクトル
  h2_texts           list   H2 テキスト一覧（プロンプト注入・被り説明用）
  body_snippet       str    本文プレーンテキスト冒頭 3000 字（n-gram 比較用）
  embedding_model    str    使用 Embedding モデル ID
  updated_at         str    このレコードの最終更新日時 ISO8601
────────────────────────────────────────────────
"""
from __future__ import annotations

import hashlib
import json
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional


# ─── Abstract Repository ─────────────────────────────────────────────────────

class ArticleVectorStore(ABC):
    """過去記事 Embedding リポジトリの抽象基底クラス。"""

    @abstractmethod
    def get(self, post_id: int) -> Optional[dict]:
        """post_id でレコードを取得。存在しなければ None。"""

    @abstractmethod
    def upsert(self, record: dict) -> None:
        """レコードを追加または更新（post_id をキーとする）。"""

    @abstractmethod
    def list_all(self) -> list[dict]:
        """全レコードのリストを返す。"""

    @abstractmethod
    def list_by_category(self, category_id: int) -> list[dict]:
        """指定 WP カテゴリ ID を含むレコードのリストを返す。"""

    @abstractmethod
    def flush(self) -> None:
        """変更をストレージに永続化する（JSON 書き込み・S3 アップロード等）。"""

    @abstractmethod
    def meta(self) -> dict:
        """件数・最終スキャン日時・Embedding 済み数などのメタ情報を返す。"""

    # ── 共通ヘルパー（サブクラスで再利用可） ─────────────────────────────

    @staticmethod
    def content_hash(text: str) -> str:
        """コンテンツの SHA-256 先頭 16 桁（変更検出用）。"""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def needs_reembed(record: dict, new_hash: str, embed_model: str) -> bool:
        """content_hash・embedding_model が変わった、または heading_embeddings が
        ない（旧フォーマット）場合に True を返す。"""
        return (
            record.get("content_hash") != new_hash
            or record.get("embedding_model") != embed_model
            or not record.get("heading_embeddings")
        )


# ─── LocalJsonStore ───────────────────────────────────────────────────────────

class LocalJsonStore(ArticleVectorStore):
    """JSON ファイルバックエンド（+ 任意の S3 バックアップ）。

    内部データ構造:
      {
        "index":      {post_id_int: record, ...},
        "scanned_at": "ISO8601",
        "meta":       {"count": N, ...}
      }

    旧フォーマット（{"articles": [...]}）を自動移行する。
    """

    def __init__(
        self,
        path: Path,
        s3_bucket: str = "",
        s3_key: str = "article_vector_cache.json",
    ):
        self._path = path
        self._s3_bucket = s3_bucket
        self._s3_key = s3_key
        self._data = self._load()

    # ── persistence ────────────────────────────────────────────────────────

    def _load(self) -> dict:
        if not self._path.exists():
            return {"index": {}, "scanned_at": "", "meta": {}}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except Exception:
            return {"index": {}, "scanned_at": "", "meta": {}}

        # 旧フォーマット（"articles": [...]）を新フォーマットへ移行
        if "articles" in raw and "index" not in raw:
            index: dict[int, dict] = {}
            for a in raw.get("articles", []):
                pid = a.get("id") or a.get("post_id")
                if pid is None:
                    continue
                pid = int(pid)
                index[pid] = {
                    "post_id":            pid,
                    "title":              a.get("title", ""),
                    "url":                a.get("url", ""),
                    "brand_categories":   a.get("categories", a.get("brand_categories", [])),
                    "modified":           a.get("date", a.get("modified", "")),
                    # content_hash・embedding_model を空にして次回スキャン時に再 Embedding させる
                    "content_hash":       "",
                    "article_embedding":  a.get("embedding"),
                    "heading_embeddings": [],
                    "h2_texts":           [],
                    "body_snippet":       "",
                    "embedding_model":    "",
                    "updated_at":         "",
                }
            return {"index": index, "scanned_at": raw.get("scanned_at", ""), "meta": {}}

        # index キーが int 文字列でシリアライズされている場合を int に正規化
        if "index" in raw:
            raw["index"] = {int(k): v for k, v in raw["index"].items()}

        return raw

    def flush(self) -> None:
        import datetime
        self._data["scanned_at"] = datetime.datetime.now().isoformat()
        self._data["meta"]["count"] = len(self._data["index"])
        # JSON は文字列キーしか許可しないので str(int) に変換
        serializable = {
            **self._data,
            "index": {str(k): v for k, v in self._data["index"].items()},
        }
        payload = json.dumps(serializable, ensure_ascii=False, separators=(",", ":"))
        self._path.write_text(payload, encoding="utf-8")
        if self._s3_bucket:
            self._s3_sync(payload)

    def _s3_sync(self, payload: str) -> None:
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                region_name=os.getenv("AWS_REGION", "us-east-1"),
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            s3.put_object(
                Bucket=self._s3_bucket,
                Key=self._s3_key,
                Body=payload.encode("utf-8"),
                ContentType="application/json",
            )
        except Exception:
            pass

    # ── CRUD ───────────────────────────────────────────────────────────────

    def get(self, post_id: int) -> Optional[dict]:
        return self._data["index"].get(int(post_id))

    def upsert(self, record: dict) -> None:
        self._data["index"][int(record["post_id"])] = record

    def list_all(self) -> list[dict]:
        return list(self._data["index"].values())

    def list_by_category(self, category_id: int) -> list[dict]:
        return [
            r for r in self._data["index"].values()
            if category_id in (r.get("brand_categories") or [])
        ]

    def meta(self) -> dict:
        records = self.list_all()
        with_art = sum(1 for r in records if r.get("article_embedding"))
        with_hdg = sum(1 for r in records if r.get("heading_embeddings"))
        return {
            "count":                   len(records),
            "with_article_embedding":  with_art,
            "with_heading_embeddings": with_hdg,
            "scanned_at":              self._data.get("scanned_at", ""),
        }


# ─── Factory ─────────────────────────────────────────────────────────────────

_store_instance: Optional[LocalJsonStore] = None


def get_store(cache_path: Optional[Path] = None) -> LocalJsonStore:
    """プロセス内シングルトンとしてストアを返す。
    cache_path を省略すると vector_store.py と同ディレクトリの
    article_vector_cache.json を使用する。
    """
    global _store_instance
    if _store_instance is None:
        if cache_path is None:
            cache_path = Path(__file__).parent / "article_vector_cache.json"
        _store_instance = LocalJsonStore(
            path=cache_path,
            s3_bucket=os.getenv("S3_BUCKET", ""),
            s3_key="article_vector_cache.json",
        )
    return _store_instance
