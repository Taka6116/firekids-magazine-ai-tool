"""記事ファイル保存・S3 ドラフト/投稿ログ永続化（Phase 2 リファクタリングで app.py から分離）。"""
import json
import os
import re
from pathlib import Path

from state import ROOT


def _next_article_number(brand_dir: Path) -> str:
    """ブランドディレクトリ内の既存番号から次の3桁連番を返す。"""
    existing = []
    if brand_dir.exists():
        for f in brand_dir.iterdir():
            m = re.match(r"^(\d+)_article_", f.name)
            if m:
                existing.append(int(m.group(1)))
    return f"{(max(existing) + 1 if existing else 1):03d}"


def save_article(brand_key: str, slug: str, content: str) -> Path:
    brand_dir = ROOT / "articles" / brand_key
    brand_dir.mkdir(parents=True, exist_ok=True)
    number = _next_article_number(brand_dir)
    filename = f"{number}_article_{slug}.txt"
    path = brand_dir / filename
    path.write_text(content, encoding="utf-8")
    return path


def _s3_client_simple():
    import boto3
    region = os.getenv("S3_REGION") or os.getenv("AWS_REGION", "us-east-1")
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    )


def _restore_drafts_from_s3():
    """S3 の drafts/ からメタ JSON のみをローカルに復元する（一覧表示用）。"""
    bucket = os.getenv("S3_BUCKET", "")
    if not bucket:
        return 0
    restored = 0
    try:
        s3 = _s3_client_simple()
        paginator = s3.get_paginator("list_objects_v2")
        articles_dir = ROOT / "articles"
        for page in paginator.paginate(Bucket=bucket, Prefix="drafts/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(".meta.json"):
                    continue
                parts = key.split("/", 2)
                if len(parts) < 3:
                    continue
                brand_key, filename = parts[1], parts[2]
                brand_dir = articles_dir / brand_key
                local_path = brand_dir / filename
                if local_path.exists():
                    continue
                brand_dir.mkdir(parents=True, exist_ok=True)
                body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
                local_path.write_bytes(body)
                restored += 1
        if restored:
            print(f"[drafts] S3 restore: {restored} meta files restored")
    except Exception as e:
        print(f"[drafts] S3 restore error: {e}")
    return restored


_POSTS_LOG_S3_KEY = "posts_log/posts_log.json"


def _load_posts_log() -> list:
    bucket = os.getenv("S3_BUCKET", "")
    if bucket:
        try:
            s3 = _s3_client_simple()
            obj = s3.get_object(Bucket=bucket, Key=_POSTS_LOG_S3_KEY)
            return json.loads(obj["Body"].read().decode("utf-8"))
        except Exception:
            pass
    # ローカルフォールバック
    local = ROOT / "data" / "posts_log.json"
    if local.exists():
        try:
            return json.loads(local.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_posts_log(log: list) -> None:
    bucket = os.getenv("S3_BUCKET", "")
    payload = json.dumps(log, ensure_ascii=False, indent=2)
    if bucket:
        try:
            s3 = _s3_client_simple()
            s3.put_object(
                Bucket=bucket,
                Key=_POSTS_LOG_S3_KEY,
                Body=payload.encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
        except Exception as e:
            print(f"[log-post] S3 save error: {e}")
    # ローカルにも保存
    local = ROOT / "data" / "posts_log.json"
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_text(payload, encoding="utf-8")
