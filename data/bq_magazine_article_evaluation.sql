-- ============================================================
-- FIRE KIDS Magazine 現状分析クエリセット
-- 目的: 「いまどの記事が人気か」「どんな流入を集められているか」を可視化
-- 対象: m.firekids.jp 配下のマガジン記事
-- プロジェクト: rare-mechanic-458603-s3.analytics_325216587
-- ============================================================
-- 使い方:
-- 各クエリ（①〜⑧）を個別にBigQueryコンソールで実行する
-- 1ファイル全選択実行はエラー要因のため不可
-- ============================================================
-- 想定アウトプット:
-- ① 人気記事TOP50（直近30日 PV/UU/セッション）
-- ② 伸びている記事TOP30（直近30日 vs 前30日の差分・成長率）
-- ③ 流入チャネル別セッション分布（直近30日）
-- ④ AI流入の獲得記事TOP30（どのAIから・どの記事に）
-- ⑤ オーガニック検索のランディング記事TOP30
-- ⑥ 外部リファラー（参照元ドメイン）TOP30
-- ⑦ 記事タイプ別パフォーマンス比較（やめとけ/比較/Cal解説 等）
-- ⑧ 流入KWヒント（GSC連携可能ならクエリ別、現状は記事タイトル経由）
-- ============================================================


-- ============================================================
-- ① 人気記事TOP50（直近30日）
-- 目的: いま実際に読まれている記事ランキング
-- ============================================================

WITH pv_30d AS (
  SELECT
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_msec
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
SELECT
  article_url,
  ANY_VALUE(page_title) AS page_title,
  COUNT(*) AS pv,
  COUNT(DISTINCT user_pseudo_id) AS uu,
  COUNT(DISTINCT session_uid) AS sessions,
  ROUND(SUM(engagement_msec) / 1000.0 / NULLIF(COUNT(*), 0), 1) AS avg_engagement_sec
FROM pv_30d
WHERE article_url IS NOT NULL
GROUP BY article_url
ORDER BY pv DESC
LIMIT 50;


-- ============================================================
-- ② 伸びている記事TOP30（直近30日 vs 前30日）
-- 目的: 急成長している記事の特定
-- ============================================================

WITH base_pv AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_dt,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
, classified AS (
  SELECT
    article_url,
    ANY_VALUE(page_title) AS page_title,
    COUNT(DISTINCT IF(event_dt >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), session_uid, NULL)) AS sess_recent,
    COUNT(DISTINCT IF(event_dt <  DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), session_uid, NULL)) AS sess_prev,
    COUNTIF(event_dt >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS pv_recent,
    COUNTIF(event_dt <  DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) AS pv_prev
  FROM base_pv
  WHERE article_url IS NOT NULL
  GROUP BY article_url
)
SELECT
  article_url,
  page_title,
  sess_prev,
  sess_recent,
  sess_recent - sess_prev AS sess_diff,
  ROUND(SAFE_DIVIDE(sess_recent, NULLIF(sess_prev, 0)) * 100, 1) AS growth_pct,
  pv_prev,
  pv_recent
FROM classified
WHERE sess_recent >= 10
ORDER BY sess_diff DESC
LIMIT 30;


-- ============================================================
-- ③ 流入チャネル別セッション分布（直近30日）
-- 目的: マガジンへの流入経路の構成比
-- ============================================================

WITH ms AS (
  SELECT
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source'), traffic_source.source) AS source,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium'), traffic_source.medium) AS medium
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
, classified AS (
  SELECT
    session_uid,
    user_pseudo_id,
    CASE
      WHEN LOWER(IFNULL(source,''))='firekids_magazine' AND LOWER(IFNULL(medium,''))='seo' THEN '① Magazine SEO (UTM)'
      WHEN LOWER(IFNULL(source,''))='x' AND LOWER(IFNULL(medium,''))='social' THEN '② X投稿 (UTM)'
      WHEN LOWER(IFNULL(source,''))='google' AND LOWER(IFNULL(medium,'')) IN ('organic','') THEN '③ Google Organic'
      WHEN LOWER(IFNULL(source,'')) LIKE '%yahoo%' AND LOWER(IFNULL(medium,'')) IN ('organic','') THEN '④ Yahoo Organic'
      WHEN LOWER(IFNULL(source,'')) IN ('bing','duckduckgo','ecosia','baidu') THEN '⑤ その他検索'
      WHEN LOWER(IFNULL(source,'')) LIKE '%perplexity%'
        OR LOWER(IFNULL(source,'')) LIKE '%chatgpt%' OR LOWER(IFNULL(source,'')) LIKE '%openai%'
        OR LOWER(IFNULL(source,'')) LIKE '%claude%' OR LOWER(IFNULL(source,'')) LIKE '%anthropic%'
        OR LOWER(IFNULL(source,'')) LIKE '%gemini%' OR LOWER(IFNULL(source,'')) LIKE '%copilot%'
        OR LOWER(IFNULL(page_referrer,'')) LIKE '%perplexity%'
        OR LOWER(IFNULL(page_referrer,'')) LIKE '%chatgpt%' OR LOWER(IFNULL(page_referrer,'')) LIKE '%chat.openai%'
        OR LOWER(IFNULL(page_referrer,'')) LIKE '%claude.ai%' OR LOWER(IFNULL(page_referrer,'')) LIKE '%gemini.google%'
        OR LOWER(IFNULL(page_referrer,'')) LIKE '%copilot.microsoft%'
        THEN '⑥ AI検索'
      WHEN LOWER(IFNULL(source,'')) IN ('facebook','instagram','twitter','x.com','t.co')
        OR LOWER(IFNULL(medium,''))='social' THEN '⑦ SNS'
      WHEN LOWER(IFNULL(page_referrer,'')) LIKE '%googleapis%' OR LOWER(IFNULL(page_referrer,'')) LIKE '%google.com/url%'
        THEN '⑧ Google Discover/News'
      WHEN IFNULL(source,'(none)')='(direct)' OR IFNULL(source,'')='' OR LOWER(IFNULL(medium,''))='(none)'
        THEN '⑨ Direct'
      WHEN LOWER(IFNULL(medium,''))='referral' THEN '⑩ Referral'
      ELSE '⑪ その他'
    END AS channel
  FROM ms
)
SELECT
  channel,
  COUNT(DISTINCT session_uid) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users,
  ROUND(COUNT(DISTINCT session_uid) * 100.0 / SUM(COUNT(DISTINCT session_uid)) OVER (), 1) AS sess_share_pct
FROM classified
GROUP BY channel
ORDER BY sessions DESC;


-- ============================================================
-- ④ AI流入の獲得記事TOP30（直近90日）
-- 目的: ChatGPT/Perplexity/Copilot/Claude/Gemini等から最も読まれている記事
-- ============================================================

WITH ai_session_lookup AS (
  SELECT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    LOWER((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer')) AS referrer
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
    AND REGEXP_CONTAINS(
      LOWER(IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer'), '')),
      r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com'
    )
)
, ai_landing AS (
  SELECT
    ai.session_uid,
    CASE
      WHEN REGEXP_CONTAINS(ai.referrer, r'chat\.openai\.com|chatgpt\.com') THEN 'ChatGPT'
      WHEN REGEXP_CONTAINS(ai.referrer, r'perplexity\.ai') THEN 'Perplexity'
      WHEN REGEXP_CONTAINS(ai.referrer, r'copilot\.microsoft\.com') THEN 'Copilot'
      WHEN REGEXP_CONTAINS(ai.referrer, r'claude\.ai') THEN 'Claude'
      WHEN REGEXP_CONTAINS(ai.referrer, r'gemini\.google\.com') THEN 'Gemini'
      WHEN REGEXP_CONTAINS(ai.referrer, r'you\.com') THEN 'You.com'
      WHEN REGEXP_CONTAINS(ai.referrer, r'phind\.com') THEN 'Phind'
      ELSE 'その他AI'
    END AS ai_service,
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_location'), r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
    (SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_title') AS page_title,
    e.event_timestamp,
    ROW_NUMBER() OVER (PARTITION BY ai.session_uid ORDER BY e.event_timestamp ASC) AS rn
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*` e
  INNER JOIN ai_session_lookup ai
    ON CONCAT(e.user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(e.event_params) WHERE key = 'ga_session_id') AS STRING)) = ai.session_uid
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND e.event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
SELECT
  article_url,
  page_title,
  ai_service,
  COUNT(DISTINCT session_uid) AS ai_sessions
FROM ai_landing
WHERE rn = 1 AND article_url IS NOT NULL
GROUP BY article_url, page_title, ai_service
ORDER BY ai_sessions DESC
LIMIT 30;


-- ============================================================
-- ⑤ オーガニック検索のランディング記事TOP30（直近30日）
-- 目的: SEOで稼働している記事ランキング
-- ============================================================

WITH first_pv AS (
  SELECT
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source'), traffic_source.source) AS source,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium'), traffic_source.medium) AS medium,
    event_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')
      ORDER BY event_timestamp
    ) AS rn
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
)
SELECT
  REGEXP_EXTRACT(page_location, r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
  ANY_VALUE(page_title) AS page_title,
  COUNT(DISTINCT session_uid) AS organic_sessions,
  COUNT(DISTINCT user_pseudo_id) AS organic_users
FROM first_pv
WHERE rn = 1
  AND page_location LIKE '%m.firekids.jp%'
  AND (LOWER(IFNULL(source,'')) IN ('google','yahoo','bing','duckduckgo')
       OR LOWER(IFNULL(medium,''))='organic')
GROUP BY article_url
HAVING organic_sessions >= 3
ORDER BY organic_sessions DESC
LIMIT 30;


-- ============================================================
-- ⑥ 外部リファラー（参照元ドメイン）TOP30（直近30日）
-- 目的: どの外部サイトから流入しているか（AI以外も含む全体像）
-- ============================================================

WITH ref AS (
  SELECT
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') IS NOT NULL
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') != ''
)
SELECT
  REGEXP_EXTRACT(page_referrer, r'https?://([^/]+)') AS referrer_domain,
  COUNT(DISTINCT session_uid) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM ref
WHERE NOT REGEXP_CONTAINS(page_referrer, r'firekids\.jp')
GROUP BY referrer_domain
HAVING sessions >= 3
ORDER BY sessions DESC
LIMIT 30;


-- ============================================================
-- ⑦ 記事タイプ別パフォーマンス比較（直近30日）
-- 目的: 既存記事のどのタイプが伸びているか
-- ============================================================

WITH base_pv AS (
  SELECT
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
, classified AS (
  SELECT
    CASE
      WHEN REGEXP_CONTAINS(page_title, r'やめとけ') THEN 'A. やめとけ系'
      WHEN REGEXP_CONTAINS(page_title, r'恥ずかしい|ダサい') THEN 'B. 否定打消し系'
      WHEN REGEXP_CONTAINS(page_title, r'なぜ安い|安いモデル|安いの？') THEN 'C. 価格疑問系'
      WHEN REGEXP_CONTAINS(page_title, r'人気モデル|人気ランキング|代表モデル|人気3モデル') THEN 'D. 人気モデル系'
      WHEN REGEXP_CONTAINS(page_title, r'比較|違い|どっち|vs') THEN 'E. 比較系'
      WHEN REGEXP_CONTAINS(page_title, r'Cal\.|キャリバー') THEN 'F. キャリバー解説'
      WHEN REGEXP_CONTAINS(page_title, r'Ref\.|リファレンス') THEN 'G. リファレンス解説'
      WHEN REGEXP_CONTAINS(page_title, r'とは|入門|ガイド|完全ガイド') THEN 'H. 用語/入門解説'
      WHEN REGEXP_CONTAINS(page_title, r'(ヴィンテージ|アンティーク).+(魅力|楽しみ方|選び方)') THEN 'I. 魅力/選び方'
      WHEN REGEXP_CONTAINS(page_title, r'おすすめ') THEN 'J. おすすめ系'
      ELSE 'Z. その他'
    END AS article_type,
    article_url, user_pseudo_id, session_uid
  FROM base_pv
  WHERE article_url IS NOT NULL
)
SELECT
  article_type,
  COUNT(DISTINCT article_url) AS article_count,
  COUNT(*) AS pv,
  COUNT(DISTINCT session_uid) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS uu,
  ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT article_url), 0), 1) AS pv_per_article,
  ROUND(COUNT(DISTINCT session_uid) / NULLIF(COUNT(DISTINCT article_url), 0), 1) AS sessions_per_article
FROM classified
GROUP BY article_type
ORDER BY pv_per_article DESC;


-- ============================================================
-- ⑧ 流入KWヒント（GA4の流入KW + ランディング記事）（直近30日）
-- 目的: 各記事がどんな検索語で見つかっているか
-- 補足: GA4ではほとんどのKWが (not provided) になるため、参考レベル
--       完全なKW分析はSearch Consoleエクスポートが必要
-- ============================================================

WITH first_pv AS (
  SELECT
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'term') AS term,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source'), traffic_source.source) AS source,
    IFNULL((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium'), traffic_source.medium) AS medium,
    event_timestamp,
    ROW_NUMBER() OVER (
      PARTITION BY user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')
      ORDER BY event_timestamp
    ) AS rn
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
)
SELECT
  REGEXP_EXTRACT(page_location, r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
  ANY_VALUE(page_title) AS page_title,
  IFNULL(NULLIF(term, ''), '(not provided)') AS search_term,
  source,
  COUNT(DISTINCT session_uid) AS sessions
FROM first_pv
WHERE rn = 1
  AND page_location LIKE '%m.firekids.jp%'
  AND (LOWER(IFNULL(source,'')) IN ('google','yahoo','bing','duckduckgo') OR LOWER(IFNULL(medium,''))='organic')
GROUP BY article_url, search_term, source
HAVING sessions >= 2
ORDER BY sessions DESC
LIMIT 100;


-- ============================================================
-- ⑨ 低PV記事抽出（直近90日 PV100以下）
-- 目的: 統合・非公開判断のための低パフォーマンス記事リスト
-- 用途: PV合計が少ない順にソート、リライト/統合/noindex候補の選定に使用
-- ============================================================

WITH pv_90d AS (
  SELECT
    REGEXP_EXTRACT((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), r'(https?://m\.firekids\.jp[^?#]*)') AS article_url,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    user_pseudo_id,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_uid,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_msec,
    PARSE_DATE('%Y%m%d', event_date) AS event_date_parsed
  FROM `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                          AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%m.firekids.jp%'
)
SELECT
  article_url,
  ANY_VALUE(page_title) AS page_title,
  COUNT(*) AS pv_90d,
  COUNT(DISTINCT user_pseudo_id) AS uu_90d,
  COUNT(DISTINCT session_uid) AS sessions_90d,
  ROUND(SUM(engagement_msec) / 1000.0 / NULLIF(COUNT(*), 0), 1) AS avg_engagement_sec,
  MIN(event_date_parsed) AS first_seen_date,
  MAX(event_date_parsed) AS last_seen_date,
  DATE_DIFF(CURRENT_DATE(), MIN(event_date_parsed), DAY) AS days_since_first_pv,
  CASE
    WHEN COUNT(*) = 0 THEN 'D: 完全没'
    WHEN COUNT(*) <= 10 THEN 'D: 非公開候補'
    WHEN COUNT(*) <= 30 THEN 'C: 統合候補'
    WHEN COUNT(*) <= 100 THEN 'B: 強化候補'
    ELSE 'A: 維持'
  END AS judgment_label
FROM pv_90d
WHERE article_url IS NOT NULL
GROUP BY article_url
HAVING pv_90d <= 100
ORDER BY pv_90d ASC, sessions_90d ASC;
