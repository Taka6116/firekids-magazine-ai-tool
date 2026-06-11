"""Flask ルート一覧が Phase 0 の記録（route_inventory.md）と一致することを確認する。"""
import app

EXPECTED_ROUTES = {
    ("/", frozenset({"GET"})),
    ("/generate", frozenset({"POST"})),
    ("/generate-status/<job_id>", frozenset({"GET"})),
    ("/inventory-items", frozenset({"GET"})),
    ("/upload-inventory", frozenset({"POST"})),
    ("/save", frozenset({"POST"})),
    ("/scan", frozenset({"POST"})),
    ("/patch-categories", frozenset({"POST"})),
    ("/scan-status", frozenset({"GET"})),
    ("/save-draft", frozenset({"POST"})),
    ("/drafts", frozenset({"GET"})),
    ("/delete-draft", frozenset({"POST"})),
    ("/upload-article-image", frozenset({"POST"})),
    ("/update-draft-image", frozenset({"POST"})),
    ("/log-post", frozenset({"POST"})),
    ("/posts-log", frozenset({"GET"})),
    ("/image-proxy", frozenset({"GET"})),
    ("/draft-content/<brand>/<filename>", frozenset({"GET"})),
    ("/ping", frozenset({"GET"})),
}


def test_route_inventory_matches_phase0():
    actual = set()
    for rule in app.app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        methods = frozenset(m for m in rule.methods if m not in ("HEAD", "OPTIONS"))
        actual.add((str(rule), methods))
    assert actual == EXPECTED_ROUTES


def test_before_request_login_hook_registered():
    funcs = app.app.before_request_funcs.get(None, [])
    assert any(f.__name__ == "_require_login" for f in funcs)


def test_unauthenticated_json_request_gets_401():
    client = app.app.test_client()
    resp = client.get("/drafts", headers={"Accept": "application/json"})
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "unauthenticated"


def test_unauthenticated_browser_request_redirects_to_login():
    client = app.app.test_client()
    resp = client.get("/", headers={"Accept": "text/html"})
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/login")
