"""
FIRE KIDS Magazine 記事生成アプリ（AWS Bedrock + Claude版）

被り防止ロジック（多粒度 Embedding 方式）:

  スキャン時:
    - WordPress content.rendered を取得
    - H2 見出し + 直下本文 400 字を抽出
    - article_embedding  : title + excerpt + H2 一覧 + 本文冒頭 1500 字
    - heading_embeddings : H2 ごとのベクトル
    - content_hash で未変更記事の再 Embedding をスキップ

  生成時（3 ステージ）:
    Stage 1 – propose_structure()
      Claude にタイトル・H2 構成案・テーマを小型コール（最大 800 トークン）で生成させる。
      本文はまだ生成しない。

    Stage 2 – check_overlap()
      Level 1: 候補全体 vs article_embedding（閾値 0.88）
      Level 2: 候補 H2 vs heading_embeddings（1 記事に 3 本以上が閾値 0.86 超）
      被りあり → revise_structure() で再構成（最大 MAX_REGEN_RETRIES 回）

    Stage 3 – build_article_prompt() → invoke_claude()
      類似記事タイトル・類似 H2 を「避けるリスト」としてプロンプトに注入して本文生成。

  後処理 – check_ngram_overlap()
    文字 n-gram（デフォルト n=8）で body_snippet と Jaccard 比較。
    警告として返すが生成をブロックしない。

起動:
  cd scripts/article_generator
  python app.py   # localhost:8001
"""
import datetime
import json
import os
import re
import sys
import threading
import time
import uuid
from pathlib import Path

import requests
from flask import Flask, Response, jsonify, render_template, request

# 兄弟モジュール（vector_store / inventory）を、
# - ローカル実行（python app.py / cwd=このフォルダ）
# - 本番（wsgi が article_generator.app をパッケージ読み込み）
# のどちらでも import できるよう、このファイルのフォルダを sys.path に追加する。
# これを忘れると本番で ModuleNotFoundError → gunicorn crash → App Runner が旧版へ
# 自動ロールバックし「デプロイしても何も変わらない」状態になる。
sys.path.insert(0, str(Path(__file__).resolve().parent))

from vector_store import ArticleVectorStore, get_store  # noqa: F401, E402  （ArticleVectorStore は embed_all.py 互換の再エクスポート）
from inventory import get_in_stock, inventory_summary, reload_from_bytes  # noqa: E402

# .env の読み込み（分割前と同じタイミング・順序）は state モジュールの import 時に行われる。
# vector_store / inventory は分割前と同様 .env 読み込みより前に import する。
from state import (ARTICLE_CATEGORIES, BRANDS, EMBED_MODEL_ID, LOOKBACK_DAYS,  # noqa: E402
                   ROOT, TONES, InventoryMissingError, log)
from auth import _require_login  # noqa: E402
from jobs import JOBS, _JOB_LOCK, _cleanup_jobs  # noqa: E402
from embeddings import bedrock_embed, cosine  # noqa: F401, E402  （テスト・embed_all.py 互換の再エクスポート）
from formatting import markdown_to_wp_html, title_to_slug  # noqa: F401, E402
from wp_scanner import (_SCAN_STATE, _run_scan_locked, ensure_cache_fresh,  # noqa: F401, E402
                        extract_h2_sections, scan_wordpress_posts, strip_tags)
from overlap import check_ngram_overlap, check_overlap  # noqa: F401, E402
from article_pipeline import generate_article  # noqa: E402
from storage import (_load_posts_log, _restore_drafts_from_s3, _s3_client_simple,  # noqa: E402
                     _save_posts_log, save_article)

# ─── 初期化 ──────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET_KEY", "firekids-default-secret-change-me")
app.before_request(_require_login)


# ─── Flask ルーティング ───────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", brands=BRANDS, tones=TONES, article_categories=ARTICLE_CATEGORIES)


@app.route("/generate", methods=["POST"])
def generate():
    """記事生成を非同期ジョブとして開始し、job_id を即座に返す。

    App Runner のロードバランサーは ~120 秒でタイムアウトするため、
    生成処理（1〜3 分）を同期で返すと必ず 504 になる。
    クライアントは GET /generate-status/<job_id> を 3 秒ごとにポーリングして結果を取得する。
    """
    data        = request.get_json(silent=True) or {}
    brand_key   = data.get("brand", "ROLEX")
    tone        = data.get("tone",  "auto")
    fk_id       = data.get("fk_id", "")
    direction   = str(data.get("direction", "") or "").strip()[:500]
    allow_no_inv = bool(data.get("allow_no_inventory", False))
    article_cat = data.get("article_category", "basic")
    if article_cat not in ARTICLE_CATEGORIES:
        article_cat = "basic"
    mode        = "inventory" if fk_id else "brand"

    job_id = str(uuid.uuid4())
    with _JOB_LOCK:
        JOBS[job_id] = {
            "status":     "running",
            "created_at": time.time(),
            "result":     None,
            "error":      None,
            "stage":      "生成を開始しています…",
            "partial":    "",
        }
    log.info("job_created job_id=%s brand=%s mode=%s article_cat=%s direction_set=%s",
             job_id, brand_key, mode, article_cat, bool(direction))

    def _run(jid: str, bk: str, t: str, fk: str, dir_text: str, art_cat: str) -> None:
        def on_stage(msg: str, stage_id: str = "") -> None:
            with _JOB_LOCK:
                if jid in JOBS:
                    JOBS[jid]["stage"] = msg
            if stage_id:
                log.info("job_stage job_id=%s stage=%s", jid, stage_id)

        def on_chunk(text: str) -> None:
            with _JOB_LOCK:
                if jid in JOBS:
                    JOBS[jid]["partial"] += text

        log.info("job_thread_started job_id=%s", jid)
        try:
            result = generate_article(
                bk, t, fk_id=fk, on_stage=on_stage, on_chunk=on_chunk,
                allow_no_inventory=allow_no_inv, direction=dir_text,
                article_category=art_cat,
            )
            with _JOB_LOCK:
                JOBS[jid]["status"] = "done"
                JOBS[jid]["stage"]  = "完成しました"
                JOBS[jid]["result"] = {k: v for k, v in result.items() if k != "item"}
            log.info("job_done job_id=%s degraded=%s overlap=%s",
                     jid, result.get("degraded_modes"), result.get("overlap_status"))
        except InventoryMissingError:
            with _JOB_LOCK:
                JOBS[jid]["status"] = "inventory_missing"
                JOBS[jid]["error"]  = f"{BRANDS.get(bk, {}).get('jp', bk)} の在庫が見つかりませんでした"
            log.info("job_inventory_missing job_id=%s brand=%s", jid, bk)
        except Exception as e:
            with _JOB_LOCK:
                JOBS[jid]["status"] = "error"
                JOBS[jid]["error"]  = str(e)
            log.warning("job_error job_id=%s err=%s", jid, e)

    threading.Thread(target=_run, args=(job_id, brand_key, tone, fk_id, direction, article_cat), daemon=True).start()
    _cleanup_jobs()
    return jsonify({"ok": True, "job_id": job_id})


@app.route("/generate-status/<job_id>")
def generate_status(job_id: str):
    """ジョブの完了状態を返す。ポーリング用エンドポイント。

    status:
      running          — 生成中（再ポーリング）
      done             — 完了（result フィールドに記事データ）
      error            — 失敗（error フィールドにエラーメッセージ）
      inventory_missing — 在庫なし（error フィールドにメッセージ）
      not_found        — job_id が存在しない（再生成を促す）
    """
    with _JOB_LOCK:
        job = JOBS.get(job_id)

    if job is None:
        return jsonify({"status": "not_found"})

    if job["status"] == "done":
        result = job["result"] or {}
        return jsonify({"status": "done", "result": result})

    if job["status"] == "error":
        return jsonify({"status": "error", "error": job.get("error", "不明なエラー")})

    if job["status"] == "inventory_missing":
        return jsonify({"status": "inventory_missing", "error": job.get("error", "在庫が見つかりませんでした")})

    # まだ running — 進行状況と生成途中の本文を返す
    elapsed = int(time.time() - job.get("created_at", time.time()))
    return jsonify({
        "status":  "running",
        "elapsed": elapsed,
        "stage":   job.get("stage", ""),
        "partial": job.get("partial", ""),
    })


@app.route("/inventory-items")
def inventory_items():
    """在庫中のアイテム一覧を返す（UI 用）。"""
    brand_key = request.args.get("brand", "")
    try:
        items = get_in_stock(brand_key or None)
        summary = inventory_summary()
        return jsonify({
            "ok":      True,
            "items":   items,
            "summary": summary,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e), "items": [], "summary": {}})


@app.route("/upload-inventory", methods=["POST"])
def upload_inventory():
    """CSV ファイルをアップロードして在庫キャッシュを更新する。
    App Runner（本番）では S3 に保存し、次回起動時も維持される。
    """
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "ファイルが選択されていません"}), 400
    f = request.files["file"]
    if not f.filename or not f.filename.lower().endswith(".csv"):
        return jsonify({"ok": False, "error": ".csv ファイルを選択してください"}), 400
    try:
        csv_bytes = f.read()
        items     = reload_from_bytes(csv_bytes)
        return jsonify({
            "ok":      True,
            "message": f"在庫データを更新しました（{len(items)} 件の在庫）",
            "count":   len(items),
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/save", methods=["POST"])
def save():
    data      = request.get_json(silent=True) or {}
    brand_key = data.get("brand", "ROLEX")
    slug      = (data.get("slug") or "article").strip()
    content   = data.get("content", "")
    if not content.strip():
        return jsonify({"ok": False, "error": "本文が空です"}), 400
    slug_clean = re.sub(r"[^\w\-]", "-", slug).strip("-") or "article"
    try:
        path = save_article(brand_key, slug_clean, content)
        return jsonify({"ok": True, "saved_path": str(path.relative_to(ROOT))})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/scan", methods=["POST"])
def scan():
    """手動スキャン（増分）。ロック付きで多重起動を防止する。"""
    if _SCAN_STATE["running"]:
        return jsonify({"ok": False, "error": "スキャンは既に実行中です", "running": True})
    started = _run_scan_locked(incremental=True)
    if not started:
        return jsonify({"ok": False, "error": "スキャンは既に実行中です", "running": True})
    m = get_store().meta()
    return jsonify({"ok": True, **m, "last_error": _SCAN_STATE["last_error"]})


@app.route("/patch-categories", methods=["POST"])
def patch_categories():
    """既存S3レコードの brand_categories が空のものをWP APIから高速補完する。
    Embeddingは実行しない。カテゴリフィルタが正しく機能しない場合に実行する。
    """
    def _do_patch():
        wp_base  = os.getenv("WP_BASE_URL", "").rstrip("/")
        wp_user  = os.getenv("WP_USER",     "")
        wp_pass  = os.getenv("WP_APP_PASSWORD", "")
        if not wp_base or not wp_user or not wp_pass:
            log.warning("patch_categories: WP credentials missing")
            return {"ok": False, "error": "WP認証情報が未設定"}

        store = get_store()
        all_records = store.list_all()
        # brand_categories が空のレコードを対象にする
        target = [r for r in all_records if not r.get("brand_categories")]
        log.info("patch_categories: target=%d / total=%d", len(target), len(all_records))
        if not target:
            return {"ok": True, "patched": 0, "message": "補完対象なし（全レコード設定済み）"}

        auth     = (wp_user, wp_pass)
        api_base = f"{wp_base}/wp-json/wp/v2/posts"
        patched  = 0
        failed   = 0
        # 100件ずつWP APIで id in(...) 問い合わせ
        chunk_size = 100
        for i in range(0, len(target), chunk_size):
            chunk = target[i:i + chunk_size]
            ids   = [r["post_id"] for r in chunk]
            try:
                resp = requests.get(
                    api_base,
                    params={
                        "include": ",".join(str(x) for x in ids),
                        "per_page": len(ids),
                        "_fields": "id,categories",
                    },
                    auth=auth, timeout=30,
                    headers={"User-Agent": "FireKidsMagazineTool/1.0"},
                )
                if resp.status_code != 200:
                    log.warning("patch_categories: WP API error %s", resp.status_code)
                    failed += len(chunk)
                    continue
                posts = {p["id"]: p.get("categories", []) for p in resp.json()}
                for rec in chunk:
                    pid  = rec["post_id"]
                    cats = posts.get(pid, [])
                    if cats:
                        rec["brand_categories"] = cats
                        store.upsert(rec)
                        patched += 1
            except Exception as e:
                log.warning("patch_categories chunk error: %s", e)
                failed += len(chunk)
        store.flush()
        log.info("patch_categories done patched=%d failed=%d", patched, failed)
        return {"ok": True, "patched": patched, "failed": failed,
                "total_target": len(target), "total_records": len(all_records)}

    try:
        result = _do_patch()
        return jsonify(result)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


@app.route("/scan-status")
def scan_status():
    m = get_store().meta()
    return jsonify({
        "exists":                  m.get("count", 0) > 0,
        "running":                 _SCAN_STATE["running"],
        "last_started_at":         _SCAN_STATE["last_started_at"],
        "last_finished_at":        _SCAN_STATE["last_finished_at"],
        "last_error":              _SCAN_STATE["last_error"],
        "article_count":           m.get("count", 0),
        "count":                   m.get("count", 0),
        "with_article_embedding":  m.get("with_article_embedding", 0),
        "with_heading_embeddings": m.get("with_heading_embeddings", 0),
        "cache_source":            m.get("cache_source", "empty"),
        "lookback_days":           LOOKBACK_DAYS,
        "degraded_modes":          _SCAN_STATE["degraded_modes"],
        "scanned_at":              m.get("scanned_at", ""),
    })


@app.route("/save-draft", methods=["POST"])
def save_draft():
    """記事生成完了時に自動呼び出し。TXT + HTML を articles/ に保存し S3 にもバックアップ。"""
    data      = request.get_json(silent=True) or {}
    brand_key = (data.get("brand") or "ROLEX").strip()
    slug      = re.sub(r"[^\w\-]", "-", (data.get("slug") or "article").strip()).strip("-") or "article"
    title     = (data.get("title") or "").strip()
    content   = (data.get("content") or "").strip()   # Markdown / プレーンテキスト
    html      = (data.get("html") or "").strip()       # WP HTML
    image_meta = data.get("image_meta")                # {s3_key, source_url, alt} or null

    if not content and not html:
        return jsonify({"ok": False, "error": "本文が空です"}), 400

    brand_dir = ROOT / "articles" / brand_key
    brand_dir.mkdir(parents=True, exist_ok=True)

    # 同一 slug が既に存在するか確認（重複保存防止）
    existing_numbers = []
    for f in brand_dir.iterdir():
        m = re.match(r"^(\d+)_article_", f.name)
        if m:
            existing_numbers.append(int(m.group(1)))
        # 同一slugが既存なら上書き
        if re.match(rf"^\d+_article_{re.escape(slug)}\.(txt|html)$", f.name):
            number_m = re.match(r"^(\d+)_", f.name)
            number = number_m.group(1) if number_m else f"{(max(existing_numbers, default=0) + 1):03d}"
            break
    else:
        number = f"{(max(existing_numbers, default=0) + 1):03d}"

    saved_paths = []
    if content:
        txt_path = brand_dir / f"{number}_article_{slug}.txt"
        txt_path.write_text(content, encoding="utf-8")
        saved_paths.append(str(txt_path.relative_to(ROOT)))
    if html:
        html_path = brand_dir / f"{number}_article_{slug}.html"
        html_path.write_text(html, encoding="utf-8")
        saved_paths.append(str(html_path.relative_to(ROOT)))

    # メタデータ JSON を保存（一覧表示用 title / image_url / excerpt）
    meta_path = brand_dir / f"{number}_article_{slug}.meta.json"
    excerpt_src = content or html or ""
    import re as _re_strip
    excerpt_plain = _re_strip.sub(r"<[^>]+>", "", excerpt_src).replace("\n", " ").strip()[:200]
    image_url = ""
    if image_meta:
        image_url = image_meta.get("source_url") or ""
        if not image_url and image_meta.get("s3_key"):
            image_url = f"/generator/image-proxy?s3_key={image_meta['s3_key']}"
    # フロントで表示中の画像URLをフォールバックとして使用（インポート画像対応）
    if not image_url:
        article_image_url = data.get("article_image_url", "")
        if article_image_url and article_image_url.startswith("http"):
            image_url = article_image_url
    meta_obj = {
        "title": title or slug.replace("-", " ").title(),
        "brand": brand_key,
        "slug": slug,
        "number": number,
        "image_url": image_url,
        "excerpt": excerpt_plain,
        "char_count": len(content) if content else len(html),
        "has_html": bool(html),
        "saved_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    meta_path.write_text(json.dumps(meta_obj, ensure_ascii=False, indent=2), encoding="utf-8")

    # S3 バックアップ（非同期で行い失敗しても本処理に影響しない）
    bucket = os.getenv("S3_BUCKET", "")
    if bucket:
        def _s3_backup():
            try:
                s3 = _s3_client_simple()
                meta_extra = {"Metadata": {"title": title[:256], "brand": brand_key}}
                if content:
                    s3.put_object(
                        Bucket=bucket,
                        Key=f"drafts/{brand_key}/{number}_article_{slug}.txt",
                        Body=content.encode("utf-8"),
                        ContentType="text/plain; charset=utf-8",
                        **meta_extra,
                    )
                if html:
                    s3.put_object(
                        Bucket=bucket,
                        Key=f"drafts/{brand_key}/{number}_article_{slug}.html",
                        Body=html.encode("utf-8"),
                        ContentType="text/html; charset=utf-8",
                        **meta_extra,
                    )
                # メタデータ JSON も S3 へ保存（一覧復元用）
                s3.put_object(
                    Bucket=bucket,
                    Key=f"drafts/{brand_key}/{number}_article_{slug}.meta.json",
                    Body=json.dumps(meta_obj, ensure_ascii=False, indent=2).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception as e:
                print(f"[save-draft] S3 backup error: {e}")
        import threading as _threading
        _threading.Thread(target=_s3_backup, daemon=True).start()

    return jsonify({
        "ok": True,
        "number": number,
        "slug": slug,
        "saved_at": meta_obj["saved_at"],
        "saved_paths": saved_paths,
    })


_drafts_restored = False


@app.route("/drafts")
def drafts():
    """保存済み記事一覧を返す。初回アクセス時に S3 からメタを復元する。"""
    global _drafts_restored
    if not _drafts_restored:
        _restore_drafts_from_s3()
        _drafts_restored = True
    articles_dir = ROOT / "articles"

    result = []
    if not articles_dir.exists():
        return jsonify([])

    for brand_dir in sorted(articles_dir.iterdir()):
        if not brand_dir.is_dir():
            continue
        brand_key = brand_dir.name
        entries: dict[str, dict] = {}
        for f in sorted(brand_dir.iterdir(), reverse=True):
            if f.name.endswith(".meta.json"):
                m = re.match(r"^(\d+)_article_(.+)\.meta\.json$", f.name)
                if not m:
                    continue
                number, slug = m.group(1), m.group(2)
                key = f"{brand_key}/{number}_{slug}"
                # メタ JSON は txt/html より優先。既存エントリにも上書きマージする
                # （走査順により txt が先に処理されメタが無視されるバグの修正）
                try:
                    meta = json.loads(f.read_text(encoding="utf-8"))
                except Exception:
                    continue
                e = entries.setdefault(key, {
                    "brand": brand_key, "number": number, "slug": slug,
                    "title": "", "saved_at": "", "has_txt": False,
                    "has_html": False, "char_count": 0,
                    "image_url": None, "excerpt": "",
                })
                e["brand"] = meta.get("brand", e["brand"])
                e["title"] = meta.get("title") or slug.replace("-", " ").title()
                e["saved_at"] = meta.get("saved_at") or e["saved_at"]
                e["has_html"] = e["has_html"] or meta.get("has_html", False)
                e["char_count"] = meta.get("char_count") or e["char_count"]
                e["image_url"] = meta.get("image_url") or e["image_url"]
                e["excerpt"] = meta.get("excerpt") or e["excerpt"]
                continue

            m = re.match(r"^(\d+)_article_(.+)\.(txt|html)$", f.name)
            if not m:
                continue
            number, slug, ext = m.group(1), m.group(2), m.group(3)
            key = f"{brand_key}/{number}_{slug}"
            if key not in entries:
                stat = f.stat()
                entries[key] = {
                    "brand": brand_key,
                    "number": number,
                    "slug": slug,
                    "title": slug.replace("-", " ").title(),
                    "saved_at": datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "has_txt": False,
                    "has_html": False,
                    "char_count": 0,
                    "image_url": None,
                    "excerpt": "",
                }
            entries[key][f"has_{ext}"] = True
            if ext == "txt" and not entries[key]["char_count"]:
                try:
                    entries[key]["char_count"] = len(f.read_text(encoding="utf-8"))
                except Exception:
                    pass
        result.extend(sorted(entries.values(), key=lambda x: x["saved_at"], reverse=True))

    # 2026-06 より前の古い記事（Dockerイメージ混入分）を除外
    result = [r for r in result if r.get("saved_at", "") >= "2026-06-01"]

    return jsonify(result)


@app.route("/delete-draft", methods=["POST"])
def delete_draft():
    """保存済み記事を削除する。"""
    data = request.get_json(silent=True) or {}
    brand = (data.get("brand") or "").strip()
    number = (data.get("number") or "").strip()
    slug = (data.get("slug") or "").strip()
    if not brand or not number or not slug:
        return jsonify({"ok": False, "error": "パラメータ不足"}), 400

    brand_dir = ROOT / "articles" / brand
    deleted = []
    for ext in ("txt", "html", "meta.json"):
        p = brand_dir / f"{number}_article_{slug}.{ext}"
        if p.exists():
            p.unlink()
            deleted.append(str(p.relative_to(ROOT)))

    # S3 からも削除（バックグラウンド）
    bucket = os.getenv("S3_BUCKET", "")
    if bucket:
        def _s3_delete():
            try:
                s3 = _s3_client_simple()
                for ext in ("txt", "html", "meta.json"):
                    try:
                        s3.delete_object(Bucket=bucket, Key=f"drafts/{brand}/{number}_article_{slug}.{ext}")
                    except Exception:
                        pass
            except Exception as e:
                print(f"[delete-draft] S3 delete error: {e}")
        import threading as _threading
        _threading.Thread(target=_s3_delete, daemon=True).start()

    return jsonify({"ok": True, "deleted": deleted})


@app.route("/upload-article-image", methods=["POST"])
def upload_article_image():
    """手元からインポートした画像を S3 に保存し、安定した proxy URL を返す。
    blob: URL はセッション限りで失われるため、サムネイル表示・WP取り込みに使える
    永続 URL に変換する。"""
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"ok": False, "error": "file is required"}), 400
    bucket = os.getenv("S3_BUCKET", "")
    if not bucket:
        return jsonify({"ok": False, "error": "S3_BUCKET not configured"}), 500
    import uuid as _uuid
    ext = (f.filename.rsplit(".", 1)[-1] or "jpg").lower()
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        ext = "jpg"
    content_type = f.mimetype or "image/jpeg"
    s3_key = f"uploads/{datetime.date.today().strftime('%Y%m%d')}/{_uuid.uuid4().hex}.{ext}"
    try:
        s3 = _s3_client_simple()
        s3.put_object(Bucket=bucket, Key=s3_key, Body=f.read(), ContentType=content_type)
    except Exception as e:
        return jsonify({"ok": False, "error": f"S3 upload failed: {e}"}), 500
    # save_draft と同じ /generator/ プレフィックス付き proxy URL を返す（カード表示判定が http / "/" 始まりのため）
    return jsonify({"ok": True, "s3_key": s3_key, "url": f"/generator/image-proxy?s3_key={s3_key}"})


@app.route("/update-draft-image", methods=["POST"])
def update_draft_image():
    """保存済みドラフトのメタ image_url を更新する（画像差し込み後のサムネイル反映用）。"""
    data = request.get_json(silent=True) or {}
    brand = (data.get("brand") or "").strip()
    number = (data.get("number") or "").strip()
    slug = (data.get("slug") or "").strip()
    image_url = (data.get("image_url") or "").strip()
    if not brand or not number or not slug or not image_url:
        return jsonify({"ok": False, "error": "パラメータ不足"}), 400

    meta_path = ROOT / "articles" / brand / f"{number}_article_{slug}.meta.json"
    if not meta_path.exists():
        return jsonify({"ok": False, "error": "メタファイルが見つかりません"}), 404
    try:
        meta_obj = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        meta_obj = {}
    meta_obj["image_url"] = image_url
    meta_path.write_text(json.dumps(meta_obj, ensure_ascii=False, indent=2), encoding="utf-8")

    bucket = os.getenv("S3_BUCKET", "")
    if bucket:
        def _s3_backup():
            try:
                s3 = _s3_client_simple()
                s3.put_object(
                    Bucket=bucket,
                    Key=f"drafts/{brand}/{number}_article_{slug}.meta.json",
                    Body=json.dumps(meta_obj, ensure_ascii=False, indent=2).encode("utf-8"),
                    ContentType="application/json",
                )
            except Exception as e:
                print(f"[update-draft-image] S3 backup error: {e}")
        import threading as _threading
        _threading.Thread(target=_s3_backup, daemon=True).start()

    return jsonify({"ok": True})



@app.route("/log-post", methods=["POST"])
def log_post():
    """WP投稿完了後に投稿メタを記録する。"""
    data = request.get_json(silent=True) or {}
    required = ["brand", "title", "wp_id", "wp_link"]
    for k in required:
        if not data.get(k):
            return jsonify({"ok": False, "error": f"{k} is required"}), 400

    entry = {
        "brand":      data.get("brand", ""),
        "slug":       data.get("slug", ""),
        "title":      data.get("title", ""),
        "wp_id":      data.get("wp_id"),
        "wp_link":    data.get("wp_link", ""),
        "wp_status":  data.get("wp_status", "publish"),
        "image_url":  data.get("image_url", ""),
        "char_count": int(data.get("char_count", 0)),
        "logged_at":  datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "date":       data.get("date", datetime.date.today().strftime("%Y.%-m.%-d") if hasattr(datetime.date.today(), "strftime") else ""),
    }
    log = _load_posts_log()
    # 同一 wp_id があれば上書き
    log = [e for e in log if str(e.get("wp_id")) != str(entry["wp_id"])]
    log.insert(0, entry)
    _save_posts_log(log)
    return jsonify({"ok": True})


@app.route("/posts-log")
def posts_log():
    """投稿済み記事ログを返す。"""
    return jsonify(_load_posts_log())


@app.route("/image-proxy")
def image_proxy():
    """S3から画像バイナリを取得して返す。
    Query: ?s3_key=images/BRAND/FK/main.jpg
    フロントから wp_uploader_local の /upload-media に渡すプロキシURL として使う。
    """
    s3_key = request.args.get("s3_key", "").strip()
    if not s3_key:
        return jsonify({"error": "s3_key is required"}), 400

    bucket = os.getenv("S3_BUCKET", "")
    if not bucket:
        return jsonify({"error": "S3_BUCKET not configured"}), 500

    try:
        import boto3
        region = os.getenv("S3_REGION") or os.getenv("AWS_REGION", "us-east-1")
        s3 = boto3.client(
            "s3",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        )
        obj = s3.get_object(Bucket=bucket, Key=s3_key)
        data = obj["Body"].read()
        content_type = obj.get("ContentType", "image/jpeg")
        return Response(data, mimetype=content_type)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/draft-content/<brand>/<filename>")
def draft_content(brand: str, filename: str):
    """保存済み記事の本文HTMLを返す（resumeDraft 用）。"""
    from flask import abort
    # パストラバーサル防止
    if ".." in brand or ".." in filename or "/" in brand or "/" in filename:
        abort(400)
    p = ROOT / "articles" / brand / filename
    if p.exists() and p.suffix in (".html", ".txt"):
        return p.read_text(encoding="utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}
    # ローカルになければ S3 から取得
    bucket = os.getenv("S3_BUCKET", "")
    if bucket:
        try:
            s3 = _s3_client_simple()
            obj = s3.get_object(Bucket=bucket, Key=f"drafts/{brand}/{filename}")
            return obj["Body"].read().decode("utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}
        except Exception:
            pass
    abort(404)


@app.route("/ping")
def ping():
    aws_key = os.getenv("AWS_ACCESS_KEY_ID", "")
    inv     = inventory_summary()
    return jsonify({
        "ok":              True,
        "aws_configured":  bool(aws_key and os.getenv("AWS_SECRET_ACCESS_KEY")),
        "bedrock_model":   os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6"),
        "embed_model":     EMBED_MODEL_ID,
        "region":          os.getenv("AWS_REGION", "us-east-1"),
        "lookback_days":   LOOKBACK_DAYS,
        "cache_exists":    get_store().meta().get("count", 0) > 0,
        "inventory_count": inv["total"],
        "inventory_loaded": inv["loaded"],
    })


if __name__ == "__main__":
    port = int(os.getenv("GENERATOR_PORT", 8001))
    print(f"記事生成アプリ起動: http://localhost:{port}")
    app.run(debug=True, port=port, host="127.0.0.1", use_reloader=False)
