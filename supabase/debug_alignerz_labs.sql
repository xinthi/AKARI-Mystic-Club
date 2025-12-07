-- ============================================================================
-- DEBUG: Check @alignerz_labs profile data
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Check if project exists
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
  quality_follower_ratio,
  first_tracked_at,
  last_refreshed_at
FROM projects 
WHERE x_handle ILIKE '%alignerz%' 
   OR twitter_username ILIKE '%alignerz%'
   OR slug ILIKE '%alignerz%'
   OR name ILIKE '%alignerz%';

-- 2. Check project_tweets for this project
SELECT 
  COUNT(*) as tweet_count,
  MIN(created_at) as oldest_tweet,
  MAX(created_at) as newest_tweet
FROM project_tweets 
WHERE project_id = (
  SELECT id FROM projects 
  WHERE x_handle ILIKE '%alignerz%' OR twitter_username ILIKE '%alignerz%'
  LIMIT 1
);

-- 3. Check metrics_daily
SELECT 
  date,
  sentiment_score,
  ct_heat_score,
  tweet_count,
  followers,
  akari_score,
  inner_circle_count
FROM metrics_daily 
WHERE project_id = (
  SELECT id FROM projects 
  WHERE x_handle ILIKE '%alignerz%' OR twitter_username ILIKE '%alignerz%'
  LIMIT 1
)
ORDER BY date DESC
LIMIT 7;

-- 4. Check project_inner_circle
SELECT 
  COUNT(*) as inner_circle_members,
  SUM(weight) as total_weight
FROM project_inner_circle 
WHERE project_id = (
  SELECT id FROM projects 
  WHERE x_handle ILIKE '%alignerz%' OR twitter_username ILIKE '%alignerz%'
  LIMIT 1
);

-- 5. Check profiles linked to this project's inner circle
SELECT 
  p.username,
  p.name,
  p.followers,
  p.influence_score,
  p.farm_risk_score,
  p.akari_profile_score
FROM profiles p
JOIN project_inner_circle pic ON pic.profile_id = p.id
WHERE pic.project_id = (
  SELECT id FROM projects 
  WHERE x_handle ILIKE '%alignerz%' OR twitter_username ILIKE '%alignerz%'
  LIMIT 1
)
ORDER BY p.akari_profile_score DESC
LIMIT 20;

-- 6. Show all projects to verify what's tracked
SELECT slug, x_handle, twitter_username, inner_circle_count, inner_circle_power
FROM projects
WHERE is_active = true
ORDER BY inner_circle_count DESC NULLS LAST
LIMIT 20;

