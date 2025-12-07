-- ============================================================================
-- DEBUG: Check Polkadot data in all relevant tables
-- Run this in Supabase SQL Editor to see what data exists
-- ============================================================================

-- 1. Get Polkadot project info
SELECT 
  id,
  slug,
  name,
  x_handle,
  twitter_username,
  avatar_url,
  twitter_profile_image_url,
  inner_circle_count,
  inner_circle_power,
  quality_follower_ratio
FROM projects 
WHERE slug = 'polkadot' OR x_handle = 'polkadot' OR twitter_username ILIKE 'polkadot';

-- 2. Check project_tweets for Polkadot
SELECT 
  tweet_id,
  author_handle,
  is_official,
  is_kol,
  created_at::date as tweet_date,
  likes,
  retweets,
  LEFT(text, 50) as text_preview,
  tweet_url
FROM project_tweets 
WHERE project_id = (SELECT id FROM projects WHERE slug = 'polkadot' OR x_handle = 'polkadot' LIMIT 1)
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check metrics_daily for Polkadot
SELECT 
  date,
  sentiment_score,
  ct_heat_score,
  tweet_count,
  followers,
  akari_score,
  inner_circle_count
FROM metrics_daily 
WHERE project_id = (SELECT id FROM projects WHERE slug = 'polkadot' OR x_handle = 'polkadot' LIMIT 1)
ORDER BY date DESC
LIMIT 10;

-- 4. Check project_inner_circle for Polkadot
SELECT COUNT(*) as inner_circle_members
FROM project_inner_circle 
WHERE project_id = (SELECT id FROM projects WHERE slug = 'polkadot' OR x_handle = 'polkadot' LIMIT 1);

-- 5. Count tweets by type
SELECT 
  is_official,
  is_kol,
  COUNT(*) as tweet_count
FROM project_tweets 
WHERE project_id = (SELECT id FROM projects WHERE slug = 'polkadot' OR x_handle = 'polkadot' LIMIT 1)
GROUP BY is_official, is_kol;

-- 6. Check dates distribution of tweets (for chart markers)
SELECT 
  created_at::date as tweet_date,
  COUNT(*) as tweets_on_day,
  SUM(CASE WHEN is_official THEN 1 ELSE 0 END) as official_count,
  SUM(CASE WHEN is_kol THEN 1 ELSE 0 END) as kol_count
FROM project_tweets 
WHERE project_id = (SELECT id FROM projects WHERE slug = 'polkadot' OR x_handle = 'polkadot' LIMIT 1)
GROUP BY created_at::date
ORDER BY tweet_date DESC
LIMIT 30;

