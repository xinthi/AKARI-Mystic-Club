-- =============================================================================
-- DEBUG: Check all data for slug 'mycoralapp'
-- Run this in Supabase SQL Editor
-- =============================================================================

-- 1) Find the project and its ID
SELECT 
  id,
  slug,
  name,
  x_handle,
  twitter_username,
  inner_circle_count,
  inner_circle_power,
  is_active
FROM projects
WHERE slug = 'mycoralapp' OR x_handle ILIKE '%coralapp%' OR name ILIKE '%coral%';

-- 2) Check tweets for this project (last 7 and 30 days)
SELECT 
  'Last 7 days' as period,
  COUNT(*) as tweet_count,
  COUNT(CASE WHEN is_official THEN 1 END) as official_tweets,
  COUNT(CASE WHEN is_kol THEN 1 END) as kol_tweets
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
WHERE p.slug = 'mycoralapp'
  AND pt.created_at >= NOW() - INTERVAL '7 days'
UNION ALL
SELECT 
  'Last 30 days',
  COUNT(*),
  COUNT(CASE WHEN is_official THEN 1 END),
  COUNT(CASE WHEN is_kol THEN 1 END)
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
WHERE p.slug = 'mycoralapp'
  AND pt.created_at >= NOW() - INTERVAL '30 days'
UNION ALL
SELECT 
  'All time',
  COUNT(*),
  COUNT(CASE WHEN is_official THEN 1 END),
  COUNT(CASE WHEN is_kol THEN 1 END)
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
WHERE p.slug = 'mycoralapp';

-- 3) Show sample tweets
SELECT 
  pt.tweet_id,
  pt.author_handle,
  LEFT(pt.text, 60) as text_preview,
  pt.likes,
  pt.retweets,
  pt.replies,
  pt.is_official,
  pt.is_kol,
  pt.tweet_url,
  pt.created_at
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
WHERE p.slug = 'mycoralapp'
ORDER BY pt.created_at DESC
LIMIT 10;

-- 4) Check metrics_daily for today
SELECT 
  md.date,
  md.sentiment_score,
  md.ct_heat_score,
  md.tweet_count,
  md.followers,
  md.akari_score
FROM metrics_daily md
JOIN projects p ON md.project_id = p.id
WHERE p.slug = 'mycoralapp'
ORDER BY md.date DESC
LIMIT 7;

-- 5) Check inner circle
SELECT 
  'project_inner_circle' as table_name,
  COUNT(*) as count
FROM project_inner_circle pic
JOIN projects p ON pic.project_id = p.id
WHERE p.slug = 'mycoralapp'
UNION ALL
SELECT 
  'inner_circle_members',
  COUNT(*)
FROM inner_circle_members;

-- 6) Show inner circle members for this project
SELECT 
  pr.username,
  pr.name,
  pr.followers,
  pic.weight,
  pic.is_follower,
  pic.is_author
FROM project_inner_circle pic
JOIN projects p ON pic.project_id = p.id
JOIN profiles pr ON pic.profile_id = pr.id
WHERE p.slug = 'mycoralapp'
ORDER BY pic.weight DESC
LIMIT 10;

