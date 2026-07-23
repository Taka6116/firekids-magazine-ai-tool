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
    ("/dashboard-posts", frozenset({"GET"})),
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


def test_dashboard_posts_requires_shared_token(monkeypatch):
    monkeypatch.setenv("DASHBOARD_API_TOKEN", "test-dashboard-token")
    client = app.app.test_client()

    unauthorized = client.get("/dashboard-posts", headers={"Accept": "application/json"})
    assert unauthorized.status_code == 401
    assert unauthorized.get_json()["error"] == "unauthorized"


def test_dashboard_posts_returns_sanitized_posts(monkeypatch):
    monkeypatch.setenv("DASHBOARD_API_TOKEN", "test-dashboard-token")
    monkeypatch.delenv("WP_USER", raising=False)
    monkeypatch.delenv("WP_APP_PASSWORD", raising=False)
    monkeypatch.setattr(app, "_load_posts_log", lambda: [
        {
            "wp_id": 30,
            "title": "ロレックスの記事",
            "wp_link": "https://m.firekids.jp/30/",
            "wp_status": "draft",
            "date": "2026.07.20",
            "brand": "ROLEX",
        },
        {"wp_id": "invalid"},
        {"title": "IDなし"},
    ])
    client = app.app.test_client()

    response = client.get(
        "/dashboard-posts",
        headers={"X-Dashboard-Token": "test-dashboard-token"},
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "posts": [{
            "brand": "ROLEX",
            "categories": [],
            "date": "2026.07.20",
            "id": 30,
            "link": "https://m.firekids.jp/30/",
            "status": "draft",
            "tags": [],
            "title": {"rendered": "ロレックスの記事"},
        }],
    }
