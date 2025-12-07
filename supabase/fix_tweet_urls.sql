-- =============================================================================
-- FIX: Repair malformed tweet_urls in project_tweets
-- Run this in Supabase SQL Editor
-- =============================================================================

-- See the bad URLs (missing username)
SELECT 
  p.name,
  pt.tweet_id,
  pt.author_handle,
  pt.tweet_url,
  pt.likes,
  pt.retweets,
  pt.replies
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
WHERE pt.tweet_url LIKE '%x.com/status/%'  -- Missing username between x.com/ and status/
   OR pt.tweet_url LIKE '%x.com//status/%' -- Double slash (empty username)
   OR pt.tweet_url LIKE '%/undefined/status/%' -- undefined username
   OR pt.tweet_url LIKE '%/unknown/status/%' -- unknown username
ORDER BY p.name, pt.created_at DESC
LIMIT 50;

-- =============================================================================
-- Fix URLs that are missing the username
-- Use author_handle to reconstruct the correct URL
-- =============================================================================

UPDATE project_tweets
SET tweet_url = 'https://x.com/' || COALESCE(NULLIF(author_handle, ''), 'unknown') || '/status/' || tweet_id
WHERE tweet_url LIKE '%x.com/status/%'
   OR tweet_url LIKE '%x.com//status/%'
   OR tweet_url LIKE '%/undefined/status/%'
   OR tweet_url LIKE '%/unknown/status/%'
   OR tweet_url IS NULL
   OR tweet_url = '';

-- =============================================================================
-- For tweets where author_handle is also bad, use the project's x_handle
-- =============================================================================

UPDATE project_tweets pt
SET 
  author_handle = COALESCE(p.twitter_username, p.x_handle),
  tweet_url = 'https://x.com/' || COALESCE(p.twitter_username, p.x_handle) || '/status/' || pt.tweet_id
FROM projects p
WHERE pt.project_id = p.id
  AND pt.is_official = true
  AND (pt.author_handle IS NULL OR pt.author_handle = '' OR pt.author_handle = 'unknown' OR pt.author_handle = 'undefined');

-- =============================================================================
-- Verify the fix
-- =============================================================================

SELECT 
  p.name,
  COUNT(*) as tweet_count,
  COUNT(CASE WHEN pt.tweet_url LIKE 'https://x.com/%/status/%' AND pt.tweet_url NOT LIKE '%/unknown/%' AND pt.tweet_url NOT LIKE '%/undefined/%' THEN 1 END) as valid_urls,
  COUNT(CASE WHEN pt.likes > 0 OR pt.retweets > 0 THEN 1 END) as has_engagement
FROM project_tweets pt
JOIN projects p ON pt.project_id = p.id
GROUP BY p.name
ORDER BY p.name;

