-- =============================================================================
-- CHECK: Which projects have data and which are missing
-- Run this in Supabase SQL Editor to see the status
-- =============================================================================

-- Check all projects and their data status
SELECT 
  p.name,
  p.slug,
  p.x_handle,
  p.twitter_username,
  p.inner_circle_count,
  COALESCE(pt.tweet_count, 0) as tweets_in_db,
  COALESCE(md.latest_tweet_count, 0) as metrics_tweet_count,
  CASE 
    WHEN p.twitter_username IS NULL THEN '❌ Missing twitter_username'
    WHEN COALESCE(pt.tweet_count, 0) = 0 THEN '⚠️ No tweets - run sentiment:update'
    WHEN p.inner_circle_count = 0 OR p.inner_circle_count IS NULL THEN '⚠️ No inner circle - run inner-circle:update'
    ELSE '✅ Has data'
  END as status
FROM projects p
LEFT JOIN (
  SELECT project_id, COUNT(*) as tweet_count
  FROM project_tweets
  GROUP BY project_id
) pt ON p.id = pt.project_id
LEFT JOIN (
  SELECT project_id, MAX(tweet_count) as latest_tweet_count
  FROM metrics_daily
  GROUP BY project_id
) md ON p.id = md.project_id
WHERE p.is_active = true
ORDER BY 
  CASE WHEN p.twitter_username IS NULL THEN 0 ELSE 1 END,
  COALESCE(pt.tweet_count, 0),
  p.name;

-- =============================================================================
-- Fix: Set twitter_username for projects that are missing it
-- =============================================================================

-- Copy x_handle to twitter_username where missing
UPDATE projects
SET twitter_username = x_handle
WHERE twitter_username IS NULL
  AND x_handle IS NOT NULL
  AND is_active = true;

-- Show which projects were fixed
SELECT name, slug, x_handle, twitter_username 
FROM projects 
WHERE is_active = true
ORDER BY name;

