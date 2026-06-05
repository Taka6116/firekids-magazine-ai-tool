"""FIRE KIDS Magazine 統合ポータル（トップページ + ログイン管理）"""
import os
from functools import wraps
from flask import Flask, request, redirect, url_for, session

portal = Flask(__name__)
portal.secret_key = os.getenv("APP_SECRET_KEY", "firekids-default-secret-change-me")

# Vercel の管理ダッシュボード（記事一覧・検証・dry-run）
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "https://firekids-magazine-ai-tool.vercel.app")

FK_VARS = """
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --fk-dark:   #1a1a1a;
  --fk-brown:  #5a5248;
  --fk-warm:   #8b6f47;
  --fk-accent: #e67e22;
  --fk-accent-d: #c4621a;
  --fk-border: #e8e4de;
  --text:      #1a1a1a;
  --sub:       #5a5248;
  --muted:     #998f80;
  --radius:    16px;
  --sidebar-w: 210px;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
  color: var(--text);
  background:
    radial-gradient(1100px 560px at 8% -12%, rgba(230,126,34,0.10), transparent 60%),
    radial-gradient(960px 520px at 96% -4%, rgba(139,111,71,0.13), transparent 55%),
    radial-gradient(900px 700px at 50% 120%, rgba(90,82,72,0.10), transparent 60%),
    linear-gradient(180deg, #fdfbf6 0%, #f6f0e5 55%, #f1e9da 100%);
  background-attachment: fixed;
  min-height: 100vh;
}
</style>
"""


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


# ─── ログインページ ────────────────────────────────────────

LOGIN_PAGE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ログイン - FIRE KIDS Magazine</title>
""" + FK_VARS + """
<style>
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-wrap { width: 100%; max-width: 400px; padding: 20px; }
.login-card {
  background: rgba(255,255,255,0.62);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.65);
  border-radius: 20px;
  padding: 40px 36px;
  box-shadow: 0 12px 40px rgba(90,82,72,0.16);
}
.brand-row { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
.brand-mark {
  width: 40px; height: 40px;
  background: linear-gradient(120deg,#e67e22,#c4621a);
  border-radius: 11px; display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 900; color: #fff; flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(230,126,34,0.35);
}
.brand-name { font-size: 16px; font-weight: 800; color: var(--text); line-height: 1.15; }
.brand-sub  { font-size: 10px; color: var(--muted); letter-spacing: 0.04em; }
.field-group { margin-bottom: 16px; }
.field-group label { display: block; font-size: 12px; font-weight: 600; color: var(--sub); margin-bottom: 6px; }
.input-wrap { position: relative; }
.input-wrap input {
  width: 100%; padding: 11px 14px;
  background: #fff; border: 1px solid var(--fk-border);
  border-radius: 10px; color: var(--text); font-size: 14px; font-family: inherit;
  outline: none; transition: border-color 0.15s;
}
.input-wrap input:focus { border-color: var(--fk-accent); }
.input-wrap input::placeholder { color: var(--muted); }
.eye-btn {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 16px; line-height: 1; padding: 0; transition: color 0.15s;
}
.eye-btn:hover { color: var(--fk-accent-d); }
.error-msg {
  background: #f9eded; border: 1px solid #e8c0c0;
  border-radius: 10px; padding: 10px 14px; font-size: 12.5px; color: #8a2f2f; margin-bottom: 16px;
}
.login-btn {
  width: 100%; padding: 12px;
  background: linear-gradient(120deg,#e67e22,#c4621a);
  border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 700;
  cursor: pointer; margin-top: 4px;
  box-shadow: 0 4px 16px rgba(230,126,34,0.35); transition: opacity 0.15s;
}
.login-btn:hover { opacity: 0.93; }
.footer-note { text-align: center; font-size: 11px; color: var(--muted); margin-top: 20px; }
</style>
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="brand-row">
      <div class="brand-mark">FK</div>
      <div>
        <div class="brand-name">FIRE KIDS Magazine</div>
        <div class="brand-sub">管理ツール</div>
      </div>
    </div>
    {error_block}
    <form method="POST" action="/login">
      <div class="field-group">
        <label>メールアドレス</label>
        <div class="input-wrap">
          <input type="text" name="username" placeholder="user@example.com"
                 autocomplete="username" value="{prefill}" required>
        </div>
      </div>
      <div class="field-group">
        <label>パスワード</label>
        <div class="input-wrap">
          <input type="password" name="password" id="pw"
                 placeholder="パスワードを入力" autocomplete="current-password" required>
          <button type="button" class="eye-btn" onclick="togglePw()" id="eye">👁</button>
        </div>
      </div>
      <button type="submit" class="login-btn">ログイン</button>
    </form>
    <p class="footer-note">FIRE KIDS Magazine 管理ツール — 内部使用限定</p>
  </div>
</div>
<script>
function togglePw() {
  const i = document.getElementById('pw'), e = document.getElementById('eye');
  if (i.type === 'password') { i.type = 'text'; e.textContent = '🙈'; }
  else { i.type = 'password'; e.textContent = '👁'; }
}
</script>
</body>
</html>"""


# ─── ポータルトップ ─────────────────────────────────────────

PORTAL_PAGE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FIRE KIDS Magazine 管理ツール</title>
""" + FK_VARS + """
<style>
body { display: flex; flex-direction: column; min-height: 100vh; }
.top-bar {
  background: rgba(26,26,26,0.85);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  height: 56px; display: flex; align-items: center; padding: 0 22px;
  position: sticky; top: 0; z-index: 100; gap: 10px;
}
.brand-link { display: flex; align-items: baseline; gap: 8px; text-decoration: none; }
.brand-name { font-size: 17px; font-weight: 800; color: #fff; }
.brand-sub  { font-size: 11px; color: #9ca3af; }
.top-nav { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.top-nav a { font-size: 13px; color: #d1d5db; text-decoration: none; padding: 6px 14px; border-radius: 999px; transition: background 0.18s, color 0.18s; }
.top-nav a:hover { color: #fff; background: rgba(255,255,255,0.1); }
.top-nav a.cta {
  margin-left: 8px; background: linear-gradient(120deg,#e67e22,#c4621a);
  color: #fff; font-weight: 600; box-shadow: 0 4px 14px rgba(230,126,34,0.4);
}
.logout { font-size: 12px; color: #9ca3af; text-decoration: none; padding: 6px 12px; }
.logout:hover { color: #fff; }
.main { flex: 1; width: 100%; max-width: 1000px; margin: 0 auto; padding: 40px 24px; }
.page-head { margin-bottom: 28px; }
.page-head h1 {
  font-size: 26px; font-weight: 800; margin-bottom: 4px;
  background: linear-gradient(100deg,#1a1a1a,#8b6f47,#e67e22);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
}
.page-head p { font-size: 13px; color: var(--sub); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
.nav-card {
  display: block; text-decoration: none; color: var(--text);
  background: rgba(255,255,255,0.6);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.6);
  box-shadow: 0 8px 30px rgba(90,82,72,0.1);
  border-radius: var(--radius); padding: 26px;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}
.nav-card:hover {
  transform: translateY(-3px);
  border-color: rgba(230,126,34,0.5);
  box-shadow: 0 16px 40px rgba(230,126,34,0.16);
}
.nav-card-icon { font-size: 24px; margin-bottom: 12px; }
.nav-card h2  { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.nav-card p   { font-size: 12.5px; color: var(--sub); line-height: 1.7; }
.badge-new {
  display: inline-block; font-size: 10px; font-weight: 700;
  background: linear-gradient(120deg,#e67e22,#c4621a); color: #fff;
  padding: 1px 8px; border-radius: 5px; margin-left: 6px; vertical-align: middle; letter-spacing: 0.04em;
}
.footer { text-align: center; padding: 16px; font-size: 11px; color: var(--fk-warm); }
</style>
</head>
<body>
<header class="top-bar">
  <a class="brand-link" href="/">
    <span class="brand-name">FIRE KIDS Magazine</span>
    <span class="brand-sub">管理ツール</span>
  </a>
  <nav class="top-nav">
    <a href="__DASHBOARD__">記事一覧・検証</a>
    <a href="/generator/" class="cta">記事を生成</a>
    <a href="/logout" class="logout">ログアウト</a>
  </nav>
</header>
<div class="main">
  <div class="page-head">
    <h1>FIRE KIDS Magazine 管理ツール</h1>
    <p>記事の生成 → 推敲 → WordPress投稿をワンフローで</p>
  </div>
  <div class="cards">
    <a class="nav-card" href="/generator/">
      <div class="nav-card-icon">✎</div>
      <h2>記事を生成<span class="badge-new">NEW</span></h2>
      <p>ブランドを選ぶだけで、Claudeが過去記事を参照して被りのないSEO記事を自動生成します。</p>
    </a>
    <a class="nav-card" href="/upload/">
      <div class="nav-card-icon">⇪</div>
      <h2>WP投稿アップローダー</h2>
      <p>生成したHTMLファイルを読み込み、m.firekids.jp へ予約投稿します。</p>
    </a>
    <a class="nav-card" href="__DASHBOARD__">
      <div class="nav-card-icon">☰</div>
      <h2>記事一覧・ルール検証</h2>
      <p>ブランド別の記事ブラウザ、FK番号・価格・UTMのルール検証、WP投稿dry-runを確認します。</p>
    </a>
  </div>
</div>
<footer class="footer">FIRE KIDS Magazine 管理ツール — 内部使用限定</footer>
</body>
</html>"""


# ─── ルーティング ──────────────────────────────────────────

@portal.route("/")
@login_required
def home():
    return PORTAL_PAGE.replace("__DASHBOARD__", DASHBOARD_URL)


@portal.route("/login", methods=["GET", "POST"])
def login():
    error   = ""
    prefill = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == os.getenv("APP_USER", "") and password == os.getenv("APP_PASSWORD", ""):
            session["authenticated"] = True
            session.permanent = True
            return redirect(url_for("home"))
        error   = "メールアドレスまたはパスワードが正しくありません"
        prefill = username

    error_block = f'<div class="error-msg">⚠ {error}</div>' if error else ""
    return LOGIN_PAGE.replace("{error_block}", error_block).replace("{prefill}", prefill)


@portal.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))
