"""スラッグ生成・Markdown→WP HTML 変換（Phase 2 リファクタリングで app.py から分離）。"""
import re


# ─── ユーティリティ ───────────────────────────────────────────────────────────

def title_to_slug(title: str) -> str:
    JP_TO_EN = {
        "ロレックス": "rolex",    "オメガ": "omega",       "セイコー": "seiko",
        "シチズン": "citizen",    "チューダー": "tudor",   "オリエント": "orient",
        "ロンジン": "longines",   "カルティエ": "cartier", "ブライトリング": "breitling",
        "ジャガー": "jaeger",     "ルクルト": "lecoultre", "ユニバーサル": "universal",
        "ヴァシュロン": "vacheron", "コンスタンタン": "constantin",
        "ポルトフィーノ": "portofino", "スピードマスター": "speedmaster",
        "コンステレーション": "constellation", "シーマスター": "seamaster",
        "デイトナ": "daytona",    "サブマリーナ": "submariner",
        "エクスプローラ": "explorer", "デイトジャスト": "datejust",
        "グランドセイコー": "grand-seiko", "キングセイコー": "king-seiko",
        "ヴィンテージ": "vintage", "ヴィンテイジ": "vintage",
        "解説": "", "とは": "", "について": "", "年代": "s", "年": "", "代": "s",
    }
    result = title
    for jp, en in JP_TO_EN.items():
        result = result.replace(jp, f" {en} " if en else " ")
    result = result.lower()
    result = re.sub(r"[^\w\s\-]", " ", result)
    result = re.sub(r"[\s_]+", "-", result.strip())
    result = re.sub(r"-{2,}", "-", result).strip("-")
    return (result or "article")[:60]


def markdown_to_wp_html(md: str) -> str:
    """記事 Markdown を WordPress 投稿用の最小限の HTML へ変換する（依存ライブラリ無し）。

    見出し / 段落 / 箇条書き / 番号付きリスト / テーブル / 水平線 / 強調 / リンクに対応。
    投稿の本文用途であり、プレビューは引き続き marked.js を使う。
    """
    lines = md.replace("\r\n", "\n").split("\n")
    # 先頭の H1（タイトル）とフロントマター（--- ... ---）は本文から除外
    out: list[str] = []
    i = 0

    def inline(text: str) -> str:
        text = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
        text = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", text)
        text = re.sub(r"\[(.+?)\]\((https?://[^\s)]+)\)", r'<a href="\2">\1</a>', text)
        return text

    # 先頭 H1 を捨てる
    while i < len(lines) and lines[i].strip() == "":
        i += 1
    if i < len(lines) and re.match(r"^#\s+", lines[i]):
        i += 1

    n = len(lines)
    while i < n:
        line = lines[i]
        s = line.strip()
        if s == "":
            i += 1
            continue
        if re.match(r"^-{3,}$", s):
            out.append("<hr />")
            i += 1
            continue
        m = re.match(r"^(#{2,4})\s+(.*)$", s)
        if m:
            level = len(m.group(1))
            out.append(f"<h{level}>{inline(m.group(2).strip())}</h{level}>")
            i += 1
            continue
        # テーブル（| a | b | 行が連続し、2行目が区切り）
        if s.startswith("|") and i + 1 < n and re.match(r"^\|[\s:\-|]+\|?$", lines[i + 1].strip()):
            header = [c.strip() for c in s.strip("|").split("|")]
            i += 2
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            thead = "".join(f"<th>{inline(c)}</th>" for c in header)
            tbody = "".join(
                "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows
            )
            table_html = (
                '<!-- wp:table {"hasFixedLayout":true,"className":"is-style-stripes"} -->'
                '<figure class="wp-block-table is-style-stripes"><table style="border-collapse:collapse;width:100%">'
                f'<thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody>'
                '</table></figure>'
                '<!-- /wp:table -->'
            )
            out.append(table_html)
            continue
        # 箇条書き
        if re.match(r"^[-*]\s+", s):
            items = []
            while i < n and re.match(r"^[-*]\s+", lines[i].strip()):
                items.append("<li>" + inline(re.sub(r"^[-*]\s+", "", lines[i].strip())) + "</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        # 番号付きリスト
        if re.match(r"^\d+\.\s+", s):
            items = []
            while i < n and re.match(r"^\d+\.\s+", lines[i].strip()):
                items.append("<li>" + inline(re.sub(r"^\d+\.\s+", "", lines[i].strip())) + "</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue
        # 段落（空行まで結合）
        para = [s]
        i += 1
        while i < n and lines[i].strip() != "" and not re.match(r"^(#{2,4}\s|[-*]\s|\d+\.\s|\||-{3,}$)", lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        out.append(f"<p>{inline(' '.join(para))}</p>")

    return "\n".join(out)
