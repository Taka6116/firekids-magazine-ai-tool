"""ログイン要求フック（Phase 2 リファクタリングで app.py から分離）。

app.py が app.before_request(_require_login) として登録する。
"""
from flask import jsonify, redirect, request, session


def _require_login():
    if request.endpoint in ("health", "static"):
        return
    if not session.get("authenticated"):
        # AJAX/JSON リクエストには 401 JSON を返す（リダイレクトするとfetchが壊れる）
        if request.is_json or request.headers.get("Accept", "").startswith("application/json") or request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return jsonify({"error": "unauthenticated", "redirect": "/login"}), 401
        return redirect("/login")
