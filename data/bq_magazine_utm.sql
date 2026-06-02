-- ============================================================
-- FIRE KIDS Magazine UTM流入分析クエリセット（BigQuery）
-- 目的: Magazine記事（HTML）およびX投稿のUTMパラメータ経由の
--       流入・回遊・購入を計測する
-- ============================================================
-- UTM設定:
--   記事HTML: utm_source=firekids_magazine / utm_medium=seo / utm_campaign=organic
--   X投稿:    utm_source=x / utm_medium=social / utm_campaign=magazine
-- ============================================================


-- ============================================================
-- ① Magazine UTM 日次サマリー
-- 目的: 記事UTM / X投稿UTMそれぞれの日別セッション・ユーザー・CV
-- ============================================================

WITH sessions AS (
  SELECT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    COALESCE(collected_traffic_source.manual_source, '(direct)') AS utm_source,
    COALESCE(collected_traffic_source.manual_medium, '(none)') AS utm_medium,
    COALESCE(collected_traffic_source.manual_campaign_name, '(not set)') AS utm_campaign,
    event_name
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND (
      (collected_traffic_source.manual_source = 'firekids_magazine'
       AND collected_traffic_source.manual_medium = 'seo'
       AND collected_traffic_source.manual_campaign_name = 'organic')
      OR
      (collected_traffic_source.manual_source = 'x'
       AND collected_traffic_source.manual_medium = 'social'
       AND collected_traffic_source.manual_campaign_name = 'magazine')
    )
)

SELECT
  event_date,
  CASE
    WHEN utm_source = 'firekids_magazine' THEN 'Magazine記事'
    WHEN utm_source = 'x' THEN 'X投稿'
  END AS channel,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CASE WHEN event_name = 'purchase' THEN session_id END) AS purchases,
  ROUND(
    COUNT(DISTINCT CASE WHEN event_name = 'purchase' THEN session_id END) * 100.0
    / NULLIF(COUNT(DISTINCT session_id), 0), 2
  ) AS cvr_pct
FROM sessions
GROUP BY event_date, channel
ORDER BY event_date DESC, channel;


-- ============================================================
-- ② Magazine UTM ランディングページ別（どの記事経由で来たか）
-- 目的: UTM経由セッションの最初のページを特定し、記事別の効果を測定
-- ============================================================

WITH landing AS (
  SELECT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    COALESCE(collected_traffic_source.manual_source, '(direct)') AS utm_source,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    event_name,
    event_timestamp
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND collected_traffic_source.manual_source = 'firekids_magazine'
    AND collected_traffic_source.manual_medium = 'seo'
    AND event_name = 'page_view'
),

first_page AS (
  SELECT
    session_id,
    user_pseudo_id,
    event_date,
    page_location,
    page_title,
    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY event_timestamp ASC) AS rn
  FROM landing
),

purchase_sessions AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'purchase'
)

SELECT
  fp.page_title,
  fp.page_location,
  COUNT(DISTINCT fp.session_id) AS sessions,
  COUNT(DISTINCT fp.user_pseudo_id) AS users,
  COUNT(DISTINCT ps.session_id) AS purchases,
  ROUND(
    COUNT(DISTINCT ps.session_id) * 100.0
    / NULLIF(COUNT(DISTINCT fp.session_id), 0), 2
  ) AS cvr_pct
FROM first_page fp
LEFT JOIN purchase_sessions ps ON fp.session_id = ps.session_id
WHERE fp.rn = 1
GROUP BY fp.page_title, fp.page_location
ORDER BY sessions DESC
LIMIT 50;


-- ============================================================
-- ③ Magazine UTM 週次トレンド
-- 目的: 週単位での推移を把握（公開スケジュールとの照合用）
-- ============================================================

WITH sessions AS (
  SELECT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    user_pseudo_id,
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    COALESCE(collected_traffic_source.manual_source, '(direct)') AS utm_source,
    event_name
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND (
      (collected_traffic_source.manual_source = 'firekids_magazine' AND collected_traffic_source.manual_medium = 'seo')
      OR
      (collected_traffic_source.manual_source = 'x' AND collected_traffic_source.manual_medium = 'social' AND collected_traffic_source.manual_campaign_name = 'magazine')
    )
)

SELECT
  DATE_TRUNC(event_date, WEEK(MONDAY)) AS week_start,
  CASE
    WHEN utm_source = 'firekids_magazine' THEN 'Magazine記事'
    WHEN utm_source = 'x' THEN 'X投稿'
  END AS channel,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CASE WHEN event_name = 'purchase' THEN session_id END) AS purchases
FROM sessions
GROUP BY week_start, channel
ORDER BY week_start DESC, channel;


-- ============================================================
-- ④ Magazine UTM → カテゴリページ遷移率
-- 目的: UTM経由セッションがCTAのカテゴリページに遷移したか
-- ============================================================

WITH magazine_sessions AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND collected_traffic_source.manual_source = 'firekids_magazine'
    AND collected_traffic_source.manual_medium = 'seo'
),

category_views AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%/products/list?category_id=%'
)

SELECT
  COUNT(DISTINCT ms.session_id) AS magazine_sessions,
  COUNT(DISTINCT cv.session_id) AS navigated_to_category,
  ROUND(
    COUNT(DISTINCT cv.session_id) * 100.0
    / NULLIF(COUNT(DISTINCT ms.session_id), 0), 2
  ) AS category_navigation_rate_pct
FROM magazine_sessions ms
LEFT JOIN category_views cv ON ms.session_id = cv.session_id;


-- ============================================================
-- ⑤ X投稿UTM → 商品ページ遷移・購入
-- 目的: X投稿経由セッションの商品閲覧・購入を計測
-- ============================================================

WITH x_sessions AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND collected_traffic_source.manual_source = 'x'
    AND collected_traffic_source.manual_medium = 'social'
    AND collected_traffic_source.manual_campaign_name = 'magazine'
),

product_views AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'page_view'
    AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') LIKE '%/products/detail/%'
),

purchases AS (
  SELECT DISTINCT
    CONCAT(user_pseudo_id, '.', CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS STRING)) AS session_id
  FROM
    `rare-mechanic-458603-s3.analytics_325216587.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
    AND event_name = 'purchase'
)

SELECT
  COUNT(DISTINCT xs.session_id) AS x_sessions,
  COUNT(DISTINCT pv.session_id) AS viewed_product,
  COUNT(DISTINCT p.session_id) AS purchased,
  ROUND(COUNT(DISTINCT pv.session_id) * 100.0 / NULLIF(COUNT(DISTINCT xs.session_id), 0), 2) AS product_view_rate_pct,
  ROUND(COUNT(DISTINCT p.session_id) * 100.0 / NULLIF(COUNT(DISTINCT xs.session_id), 0), 2) AS cvr_pct
FROM x_sessions xs
LEFT JOIN product_views pv ON xs.session_id = pv.session_id
LEFT JOIN purchases p ON xs.session_id = p.session_id;
