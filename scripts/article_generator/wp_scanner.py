"""WordPress スキャンとキャッシュ鮮度管理（Phase 2 リファクタリングで app.py から分離）。"""
import datetime
import os
import re
import threading

import requests

from embeddings import bedrock_embed, embedding_degraded, reset_embed_state
from state import (CACHE_REFRESH_HOURS, EMBED_MODEL_ID, LOOKBACK_DAYS, log,
                   _lookback_cutoff, _parse_modified)
from vector_store import ArticleVectorStore, get_store


# ─── スキャン状態（多重起動防止 + 進行ステータス）─────────────────────────────
# 初回キャッシュ無しの状態で生成を連打すると、WordPress 全件スキャンが
# 何本も並行起動してしまう。_SCAN_STATE でロックを取り、1 本だけ走らせる。
_SCAN_LOCK: threading.Lock = threading.Lock()
_SCAN_STATE: dict = {
    "running":          False,
    "last_started_at":  "",
    "last_finished_at": "",
    "last_error":       "",
    "degraded_modes":   [],
}


def _run_scan_locked(incremental: bool) -> bool:
    """スキャンをロック付きで実行する。既に実行中なら False を返して何もしない。

    呼び出し側がスレッドを起こすかどうかは任意。この関数自体は同期実行。
    """
    with _SCAN_LOCK:
        if _SCAN_STATE["running"]:
            return False
        _SCAN_STATE["running"]         = True
        _SCAN_STATE["last_started_at"] = datetime.datetime.now().isoformat()
        _SCAN_STATE["last_error"]      = ""
        _SCAN_STATE["degraded_modes"]  = []
    reset_embed_state()
    log.info("scan_started incremental=%s", incremental)
    try:
        scan_wordpress_posts(incremental=incremental)
    except Exception as e:
        _SCAN_STATE["last_error"] = str(e)
        log.warning("scan_error incremental=%s err=%s", incremental, e)
    finally:
        if embedding_degraded():
            _SCAN_STATE["degraded_modes"] = ["embedding_unavailable"]
        _SCAN_STATE["running"]          = False
        _SCAN_STATE["last_finished_at"] = datetime.datetime.now().isoformat()
        log.info("scan_finished degraded=%s", _SCAN_STATE["degraded_modes"])
    return True


# ─── HTML ヘルパー ────────────────────────────────────────────────────────────

def strip_tags(html: str) -> str:
    """HTML タグを除去してプレーンテキスト化する。"""
    text = re.sub(r"<[^>]+>", " ", html)
    for entity, char in [
        ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
        ("&nbsp;", " "), ("&#8211;", "–"), ("&#8212;", "—"),
        ("&quot;", '"'), ("&#39;", "'"),
    ]:
        text = text.replace(entity, char)
    return re.sub(r"\s+", " ", text).strip()


def extract_h2_sections(html: str, body_chars: int = 400) -> list[dict]:
    """H2 見出しと直下の本文冒頭テキストを抽出する。

    戻り値: [{"heading": str, "body_snippet": str}, ...]
    """
    # <h2>…</h2> で分割
    # parts = [pre_h2, h2_1, after_h2_1, h2_2, after_h2_2, ...]
    parts = re.split(r"<h2[^>]*>(.*?)</h2>", html, flags=re.IGNORECASE | re.DOTALL)
    sections: list[dict] = []
    for i in range(1, len(parts), 2):
        heading = strip_tags(parts[i]).strip()
        if not heading:
            continue
        after = parts[i + 1] if i + 1 < len(parts) else ""
        # H3 以下の見出しを除去して本文のみ取得
        body_html = re.sub(r"<h[3-6][^>]*>.*?</h[3-6]>", "", after,
                           flags=re.IGNORECASE | re.DOTALL)
        body_text = re.sub(r"\s+", " ", strip_tags(body_html)).strip()
        sections.append({
            "heading":      heading,
            "body_snippet": body_text[:body_chars],
        })
    return sections


# ─── WordPress スキャン ───────────────────────────────────────────────────────

def scan_wordpress_posts(incremental: bool = True) -> dict:
    """WordPress REST API で記事を取得してキャッシュを更新する。

    - content.rendered / modified / link を取得
    - H2 抽出 → article_embedding + heading_embeddings を計算
    - content_hash が同じ記事は Embedding をスキップ（増分対応）
    - flush() で JSON ファイル + S3 に永続化
    """
    store   = get_store()
    wp_url  = os.getenv("WP_URL", "https://m.firekids.jp")
    wp_user = os.getenv("WP_USER", "")
    wp_pass = os.getenv("WP_APP_PASSWORD", "").replace(" ", "")
    auth    = (wp_user, wp_pass) if wp_user and wp_pass else None
    api_base = f"{wp_url.rstrip('/')}/wp-json/wp/v2/posts"

    # 増分スキャン: 通常運用では直近 LOOKBACK_DAYS 日を下限にし、
    # 古い記事の全件再 Embedding を自動実行しない。
    after_param: str | None = None
    if incremental:
        m = store.meta()
        sa = m.get("scanned_at", "")
        cutoff = _lookback_cutoff()
        after_dt = cutoff
        if sa:
            last = _parse_modified(sa)
            if last and last > after_dt:
                after_dt = last
        after_param = after_dt.isoformat(timespec="seconds")
        log.info("scan_incremental_window after=%s lookback_days=%s", after_param, LOOKBACK_DAYS)

    total_new = total_updated = 0
    total_skipped = 0
    page = 1
    _FLUSH_EVERY = 50  # 50件ごとに中間 flush して S3 に保存

    while True:
        params: dict = {
            "per_page":  100,  # content.rendered を含むが大きめにして WP I/O を削減
            "page":      page,
            "orderby":   "modified",
            "order":     "desc",
            "_fields":   "id,title,excerpt,categories,date,modified,link,content",
        }
        if after_param:
            params["modified_after"] = after_param

        try:
            resp = requests.get(api_base, params=params, auth=auth, timeout=60)
        except requests.RequestException as e:
            raise RuntimeError(f"WordPress API アクセスエラー: {e}")

        if resp.status_code == 400:
            break
        if resp.status_code != 200:
            raise RuntimeError(f"WP API エラー {resp.status_code}: {resp.text[:200]}")

        posts = resp.json()
        if not posts:
            break

        for p in posts:
            pid = p.get("id")
            if not pid:
                continue

            content_html = p.get("content", {}).get("rendered", "")
            new_hash     = ArticleVectorStore.content_hash(content_html)
            existing     = store.get(pid)

            cats     = p.get("categories", [])
            title    = strip_tags(p.get("title",   {}).get("rendered", ""))
            modified = p.get("modified", p.get("date", ""))[:19]
            url      = p.get("link", "")

            if existing and not ArticleVectorStore.needs_reembed(existing, new_hash, EMBED_MODEL_ID):
                # content は変わっていないが brand_categories が空なら補完だけ行う
                if not existing.get("brand_categories") and cats:
                    existing["brand_categories"] = cats
                    existing["title"]    = existing.get("title") or title
                    existing["url"]      = existing.get("url")   or url
                    existing["modified"] = existing.get("modified") or modified
                    store.upsert(existing)
                    total_updated += 1
                else:
                    total_skipped += 1
                continue  # Embedding スキップ

            excerpt  = strip_tags(p.get("excerpt", {}).get("rendered", ""))[:300]

            # H2 セクション抽出
            h2_sections = extract_h2_sections(content_html, body_chars=400)
            h2_texts    = [s["heading"] for s in h2_sections]

            # 本文スニペット（n-gram 比較用）
            body_plain   = re.sub(r"\s+", " ", strip_tags(content_html)).strip()
            body_snippet = body_plain[:3000]

            # article_embedding: タイトル + 抜粋 + H2 一覧 + 本文冒頭 1500 字
            art_text = (
                title + "。"
                + excerpt + "。"
                + "。".join(h2_texts) + "。"
                + body_snippet[:1500]
            )
            art_emb = bedrock_embed(art_text)

            # heading_embeddings: H2 テキスト + 直下本文冒頭
            heading_embs: list[dict] = []
            for sec in h2_sections:
                h_text = sec["heading"] + "\n" + sec["body_snippet"]
                h_vec  = bedrock_embed(h_text)
                heading_embs.append({
                    "heading": sec["heading"],
                    "text":    h_text,
                    "vec":     h_vec,
                })

            record = {
                "post_id":            pid,
                "title":              title,
                "url":                url,
                "brand_categories":   cats,
                "modified":           modified,
                "content_hash":       new_hash,
                "article_embedding":  art_emb,
                "heading_embeddings": heading_embs,
                "h2_texts":           h2_texts,
                "body_snippet":       body_snippet,
                "embedding_model":    EMBED_MODEL_ID,
                "updated_at":         datetime.datetime.now().isoformat(),
            }
            store.upsert(record)

            if existing:
                total_updated += 1
            else:
                total_new += 1

            # 一定件数ごとに中間 flush（S3 保存）して進捗を保護する
            if (total_new + total_updated) % _FLUSH_EVERY == 0:
                store.flush()
                log.info("scan_progress page=%s new=%s updated=%s skipped=%s",
                         page, total_new, total_updated, total_skipped)

        total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
        log.info("scan_page page=%s/%s new=%s updated=%s skipped=%s",
                 page, total_pages, total_new, total_updated, total_skipped)
        if page >= total_pages:
            break
        page += 1

    store.flush()
    m = store.meta()
    m["new_added"] = total_new
    m["updated"]   = total_updated
    m["skipped"]   = total_skipped
    log.info("scan_complete total=%s new=%s updated=%s skipped=%s art_emb=%s hdg_emb=%s",
             m["count"], total_new, total_updated, total_skipped,
             m["with_article_embedding"], m["with_heading_embeddings"])
    return m


def ensure_cache_fresh() -> None:
    """キャッシュが空または CACHE_REFRESH_HOURS より古ければ増分スキャンを実行する。
    失敗時は生成を続行（劣化動作）。

    初回（キャッシュ未作成）はスキャンをバックグラウンドで実行して
    記事生成をブロックしない。既存キャッシュがあれば同期実行（増分のみ）。
    """
    m          = get_store().meta()
    scanned_at = m.get("scanned_at", "")
    count      = m.get("count", 0)

    # 初回: ローカルキャッシュが存在しない or 空
    # → バックグラウンドで走らせて生成はすぐ開始する。
    #   _run_scan_locked が二重起動を防ぐので、連打されても 1 本だけ走る。
    # 通常導線では全件再 Embedding を走らせず、直近 LOOKBACK_DAYS 日だけを見る。
    # 全件構築は scripts/article_generator/embed_all.py を手動実行する。
    if not scanned_at or not count:
        if not _SCAN_STATE["running"]:
            threading.Thread(
                target=_run_scan_locked, args=(True,), daemon=True
            ).start()
        return  # 生成を即ブロック解除

    # 2 回目以降: キャッシュが古ければ増分スキャン（短時間・同期）
    needs = False
    try:
        last  = datetime.datetime.fromisoformat(scanned_at)
        age_h = (datetime.datetime.now() - last).total_seconds() / 3600
        needs = age_h >= CACHE_REFRESH_HOURS
    except Exception:
        needs = True

    if needs:
        _run_scan_locked(incremental=True)
