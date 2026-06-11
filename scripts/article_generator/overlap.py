"""類似度・重複チェック（Phase 2 リファクタリングで app.py から分離）。"""
import re

from embeddings import bedrock_embed, cosine
from state import (ARTICLE_SIM_THRESHOLD, HEADING_HIT_MIN, HEADING_SIM_THRESHOLD,
                   NGRAM_SIZE, NGRAM_THRESHOLD, _prioritized_cached_records)


# ─── 類似度チェック ───────────────────────────────────────────────────────────

def check_overlap(brand_key: str, title: str, h2s: list[str], article_category: str = "basic") -> dict:
    """2 レベルの被り検出。

    Level 1: 候補全体ベクトル vs article_embedding >= ARTICLE_SIM_THRESHOLD
    Level 2: 候補 H2 のうち HEADING_HIT_MIN 本以上が同一記事の heading_embeddings
             と >= HEADING_SIM_THRESHOLD で一致

    戻り値: {"ok": bool, "flagged": [{"title", "url", "article_similarity",
                                       "heading_hit_count", "hit_pairs", "h2_texts"}, ...]}
    """
    past_arts = _prioritized_cached_records(brand_key, article_category)

    # 候補の article-level embedding
    art_text = title + "。" + "。".join(h2s)
    art_vec  = bedrock_embed(art_text)

    # 候補 H2 ごとの embedding（まとめて計算）
    h2_vecs = [bedrock_embed(h) for h in h2s]

    flagged: list[dict] = []

    for past in past_arts:
        past_art_emb = past.get("article_embedding")
        art_sim      = cosine(art_vec, past_art_emb)

        # H2 レベル比較
        heading_hit_count = 0
        hit_pairs: list[dict] = []
        past_h_embs = past.get("heading_embeddings") or []

        for cand_h, cand_v in zip(h2s, h2_vecs):
            if not cand_v:
                continue
            best_sim    = 0.0
            best_past_h = ""
            for ph in past_h_embs:
                ph_vec = ph.get("vec")
                if ph_vec:
                    s = cosine(cand_v, ph_vec)
                    if s > best_sim:
                        best_sim    = s
                        best_past_h = ph.get("heading", "")
            if best_sim >= HEADING_SIM_THRESHOLD:
                heading_hit_count += 1
                hit_pairs.append({
                    "candidate":  cand_h,
                    "past":       best_past_h,
                    "similarity": round(best_sim, 3),
                })

        if art_sim >= ARTICLE_SIM_THRESHOLD or heading_hit_count >= HEADING_HIT_MIN:
            flagged.append({
                "title":              past.get("title", ""),
                "url":                past.get("url", ""),
                "article_similarity": round(art_sim, 3),
                "heading_hit_count":  heading_hit_count,
                "hit_pairs":          hit_pairs,
                "h2_texts":           past.get("h2_texts", []),
            })

    # 被り度の高い順にソート
    flagged.sort(key=lambda x: (x["heading_hit_count"], x["article_similarity"]), reverse=True)

    return {"ok": len(flagged) == 0, "flagged": flagged[:3]}


# ─── n-gram 重複チェック（本文生成後） ───────────────────────────────────────

def check_ngram_overlap(generated_text: str, brand_key: str, article_category: str = "basic") -> list[dict]:
    """文字 n-gram の Jaccard 類似度で本文表現の重複を検出する。
    生成をブロックせず警告として返す。
    モデル名・記号・改行を正規化してから比較する。
    """
    def clean(text: str) -> str:
        text = re.sub(r"https?://\S+", "", text)
        text = re.sub(r"^#.*$", "", text, flags=re.MULTILINE)
        text = re.sub(r"[^\w\u3040-\u30ff\u4e00-\u9fff]", "", text)
        return text

    def char_ngrams(text: str, n: int) -> set[str]:
        return set(text[i:i + n] for i in range(len(text) - n + 1))

    gen_clean = clean(generated_text)
    gen_grams = char_ngrams(gen_clean, NGRAM_SIZE)
    if not gen_grams:
        return []

    past_arts = _prioritized_cached_records(brand_key, article_category)

    flagged: list[dict] = []
    for art in past_arts:
        snippet = art.get("body_snippet", "")
        if not snippet:
            continue
        past_grams = char_ngrams(clean(snippet), NGRAM_SIZE)
        if not past_grams:
            continue
        union = gen_grams | past_grams
        if not union:
            continue
        jaccard = len(gen_grams & past_grams) / len(union)
        if jaccard >= NGRAM_THRESHOLD:
            flagged.append({
                "title":        art.get("title", ""),
                "url":          art.get("url", ""),
                "ngram_overlap": round(jaccard, 3),
            })

    flagged.sort(key=lambda x: x["ngram_overlap"], reverse=True)
    return flagged[:5]


def sample_past_titles(brand_key: str, limit: int = 14, article_category: str = "basic") -> list[str]:
    """指定ブランドの過去記事タイトルを取得する（タイトルの口調・表現の参考用）。

    新しい記事ほど現行の文体に近いので modified 降順で返す。
    キャッシュが空なら空リスト（その場合は参考なしで生成）。
    """
    records   = _prioritized_cached_records(brand_key, article_category)
    titles: list[str] = []
    for r in records:
        t = (r.get("title") or "").strip()
        if t:
            titles.append(t)
        if len(titles) >= limit:
            break
    return titles
