-- =============================================================================
-- CLEANUP: Remove fake/seed tweets from project_tweets
-- Run this in Supabase SQL Editor
-- =============================================================================

-- First, let's see what we have
SELECT 
  p.name,
  COUNT(pt.id) as total_tweets,
  COUNT(CASE WHEN pt.tweet_id LIKE '17%' OR pt.tweet_id LIKE '18%' THEN 1 END) as likely_real,
  COUNT(CASE WHEN pt.text LIKE '%announcement%' OR pt.text LIKE '%Stay tuned%' OR pt.text LIKE '%milestone%' OR pt.text LIKE '%partnership alert%' OR pt.text LIKE '%going to be huge%' THEN 1 END) as likely_fake
FROM projects p
LEFT JOIN project_tweets pt ON p.id = pt.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name
ORDER BY p.name;

-- =============================================================================
-- Delete ALL tweets that match the seed data patterns
-- =============================================================================

-- Delete tweets with fake/template text patterns from seed_project_tweets.sql
DELETE FROM project_tweets
WHERE text LIKE '%Big announcement coming soon%'
   OR text LIKE '%Stay tuned for exciting%'
   OR text LIKE '%just hit a new milestone%'
   OR text LIKE '%New partnership alert%'
   OR text LIKE '%working hard on something special%'
   OR text LIKE '%GM! Another great day%'
   OR text LIKE '%Development is progressing smoothly%'
   OR text LIKE '%community call is happening%'
   OR text LIKE '%listened to your feedback%'
   OR text LIKE '%Alpha leak%'
   OR text LIKE '%Security is our top priority%'
   OR text LIKE '%To the moon%'
   OR text LIKE '%New feature just shipped%'
   OR text LIKE '%AMA happening right now%'
   OR text LIKE '%ecosystem is growing fast%'
   OR text LIKE '%conference next week%'
   OR text LIKE '%going to be huge%'
   OR text LIKE '%Just checked out @%';

-- =============================================================================
-- Verify cleanup
-- =============================================================================

SELECT 
  p.name,
  COUNT(pt.id) as remaining_tweets,
  MIN(pt.created_at) as oldest_tweet,
  MAX(pt.created_at) as newest_tweet
FROM projects p
LEFT JOIN project_tweets pt ON p.id = pt.project_id
WHERE p.is_active = true
GROUP BY p.id, p.name
ORDER BY p.name;

-- =============================================================================
-- Show sample of remaining tweets (should be real API data)
-- =============================================================================

SELECT 
  pt.tweet_id,
  p.name as project,
  pt.author_handle,
  LEFT(pt.text, 80) as text_preview,
  pt.is_official,
  pt.is_kol,
  pt.tweet_url
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
ORDER BY pt.created_at DESC
LIMIT 20;

