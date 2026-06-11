"""Embedding 計算と劣化状態管理（Phase 2 リファクタリングで app.py から分離）。"""
import json
import math
import threading

from bedrock_client import get_bedrock_client
from state import EMBED_MODEL_ID, log


# Embedding 失敗をジョブ単位で追跡するためのスレッドローカル状態。
# 生成はバックグラウンドスレッドで動くため、スレッドごとに独立して持つ。
_embed_state = threading.local()


def reset_embed_state() -> None:
    _embed_state.failed = False


def embedding_degraded() -> bool:
    return getattr(_embed_state, "failed", False)


def bedrock_embed(text: str) -> list | None:
    """Titan Embeddings でテキストをベクトル化。失敗時は None（劣化動作）。

    呼び出し例外時はスレッドローカルに失敗フラグを立て、上位で
    degraded_modes=["embedding_unavailable"] として表面化できるようにする。
    """
    if not text.strip():
        return None
    try:
        client = get_bedrock_client()
        resp = client.invoke_model(
            modelId=EMBED_MODEL_ID,
            body=json.dumps({"inputText": text[:8000]}),
            contentType="application/json",
            accept="application/json",
        )
        emb = json.loads(resp["body"].read()).get("embedding")
        if not emb:
            _embed_state.failed = True
        return emb
    except Exception as e:
        _embed_state.failed = True
        log.warning("embed_error err=%s", e)
        return None


def cosine(a: list | None, b: list | None) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
