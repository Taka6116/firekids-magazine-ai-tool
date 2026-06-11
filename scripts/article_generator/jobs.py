"""非同期ジョブストア（Phase 2 リファクタリングで app.py から分離）。"""
import threading
import time

# ─── 非同期ジョブストア ────────────────────────────────────────────────────────
# App Runner のロードバランサーは ~120 秒でタイムアウトするため、
# 記事生成（1〜3 分）を同期 HTTP で返すと必ず 504 になる。
# → POST /generate で即座に job_id を返し、バックグラウンドで生成。
# → GET /generate-status/<job_id> で完了を 3 秒ごとにポーリング。
# gunicorn は 1 worker + 複数スレッドで動かすことで JOBS dict を共有する。
_JOB_LOCK: threading.Lock = threading.Lock()
JOBS: dict[str, dict] = {}
_JOB_TTL_SECONDS = 1800  # 30 分で古いジョブを削除


def _cleanup_jobs() -> None:
    """古いジョブを定期削除（メモリリーク防止）。"""
    cutoff = time.time() - _JOB_TTL_SECONDS
    with _JOB_LOCK:
        expired = [jid for jid, j in JOBS.items() if j.get("created_at", 0) < cutoff]
        for jid in expired:
            JOBS.pop(jid, None)
