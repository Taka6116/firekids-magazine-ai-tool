-- ============================================================
-- FIRE KIDS Magazine AI流入分析クエリセット（BigQuery / GA4）
-- 目的: ChatGPT・Perplexity・Copilot・Claude等のAIサービスから
--       マガジン記事（m.firekids.jp）への流入を検出・分析する
-- 対象: m.firekids.jp のマガジン記事ページのみ
-- ============================================================
-- 重複防止設計:
--   - セッション判定は session_start イベントの page_referrer のみで行う
--     （session_source と混在させない → チャネル二重カウント防止）
--   - page_referrer が NULL の session_start は対象外
--   - ランディングページはセッション単位で1回だけカウント
--   - page_location が m.firekids.jp であるセッションのみ対象
-- ============================================================
-- AI参照元（厳密ドメイン一致）:
--   chat.openai.com / chatgpt.com / perplexity.ai
--   copilot.microsoft.com / claude.ai / gemini.google.com
--   you.com / phind.com
-- マガジン記事フィルタ:
--   page_location に 'm.firekids.jp' を含む
-- ============================================================


-- ============================================================
-- ⑤ まずこれを実行: page_referrer生データ確認（デバッグ用）
-- 目的: マガジン記事へのAI参照元がどんな文字列で記録されているか確認
-- ============================================================

SELECT
  page_referrer,
  page_location,
  COUNT(*) AS cnt
FROM (
  SELECT
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') IS NOT NULL
    AND REGEXP_CONTAINS(
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), '')),
      r'm\.firekids\.jp'
    )
)
WHERE
  REGEXP_CONTAINS(LOWER(page_referrer),
    r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com')
GROUP BY page_referrer, page_location
ORDER BY cnt DESC
LIMIT 100;


-- ============================================================
-- ① AI参照元からのマガジン流入サマリー（日別）
-- 対象: ランディングページが m.firekids.jp のセッションのみ
-- ============================================================

WITH ai_sessions AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') IS NOT NULL
    -- AI参照元フィルタ
    AND REGEXP_CONTAINS(
      LOWER((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer')),
      r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com'
    )
    -- マガジン記事フィルタ
    AND REGEXP_CONTAINS(
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), '')),
      r'm\.firekids\.jp'
    )
)

SELECT
  event_date,
  CASE
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'chat\.openai\.com|chatgpt\.com') THEN 'ChatGPT'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'perplexity\.ai') THEN 'Perplexity'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'copilot\.microsoft\.com') THEN 'Microsoft Copilot'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'claude\.ai') THEN 'Claude'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'gemini\.google\.com') THEN 'Google Gemini'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'you\.com') THEN 'You.com'
    WHEN REGEXP_CONTAINS(LOWER(page_referrer), r'phind\.com') THEN 'Phind'
    ELSE 'その他AI'
  END AS ai_service,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM ai_sessions
GROUP BY event_date, ai_service
ORDER BY event_date DESC, sessions DESC;


-- ============================================================
-- ② AI流入のマガジン記事別集計
-- どの記事がAIサービスから最も参照されているか
-- ============================================================

WITH ai_session_ids AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    user_pseudo_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS referrer
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') IS NOT NULL
    AND REGEXP_CONTAINS(
      LOWER((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer')),
      r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com'
    )
    AND REGEXP_CONTAINS(
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), '')),
      r'm\.firekids\.jp'
    )
),

landing_pages AS (
  SELECT
    ai.session_id,
    ai.user_pseudo_id,
    ai.referrer,
    (SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_title') AS page_title,
    ROW_NUMBER() OVER (PARTITION BY ai.session_id ORDER BY e.event_timestamp ASC) AS rn
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*` e
  INNER JOIN ai_session_ids ai
    ON CONCAT(e.user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(e.event_params) WHERE key = 'ga_session_id') AS STRING)) = ai.session_id
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND e.event_name = 'page_view'
    -- マガジン記事ページのみ
    AND REGEXP_CONTAINS(
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(e.event_params) WHERE key = 'page_location'), '')),
      r'm\.firekids\.jp'
    )
)

SELECT
  REGEXP_EXTRACT(page_location, r'https?://[^/]+(/.*)') AS article_path,
  page_title,
  CASE
    WHEN REGEXP_CONTAINS(LOWER(referrer), r'chat\.openai\.com|chatgpt\.com') THEN 'ChatGPT'
    WHEN REGEXP_CONTAINS(LOWER(referrer), r'perplexity\.ai') THEN 'Perplexity'
    WHEN REGEXP_CONTAINS(LOWER(referrer), r'copilot\.microsoft\.com') THEN 'Copilot'
    WHEN REGEXP_CONTAINS(LOWER(referrer), r'claude\.ai') THEN 'Claude'
    WHEN REGEXP_CONTAINS(LOWER(referrer), r'gemini\.google\.com') THEN 'Gemini'
    ELSE 'その他AI'
  END AS ai_service,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users
FROM landing_pages
WHERE rn = 1
GROUP BY article_path, page_title, ai_service
ORDER BY sessions DESC
LIMIT 50;


-- ============================================================
-- ③ マガジンのAI流入 vs 通常流入（週次トレンド）
-- 分母: m.firekids.jp への全セッション
-- 分子: そのうちAI参照元のセッション
-- ============================================================

WITH magazine_sessions AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 180 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'session_start'
    -- マガジンへのセッションのみ
    AND REGEXP_CONTAINS(
      LOWER(COALESCE((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location'), '')),
      r'm\.firekids\.jp'
    )
)

SELECT
  DATE_TRUNC(event_date, WEEK(MONDAY)) AS week_start,
  COUNT(DISTINCT session_id) AS magazine_total_sessions,
  COUNT(DISTINCT CASE
    WHEN page_referrer IS NOT NULL
      AND REGEXP_CONTAINS(LOWER(page_referrer),
        r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com')
    THEN session_id
  END) AS ai_sessions,
  ROUND(
    SAFE_DIVIDE(
      COUNT(DISTINCT CASE
        WHEN page_referrer IS NOT NULL
          AND REGEXP_CONTAINS(LOWER(page_referrer),
            r'chat\.openai\.com|chatgpt\.com|perplexity\.ai|copilot\.microsoft\.com|claude\.ai|gemini\.google\.com|you\.com|phind\.com')
        THEN session_id
      END),
      COUNT(DISTINCT session_id)
    ) * 100, 2
  ) AS ai_share_pct
FROM magazine_sessions
GROUP BY week_start
ORDER BY week_start DESC;
