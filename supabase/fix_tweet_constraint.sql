-- =============================================================================
-- FIX: Tweet unique constraint should be on (project_id, tweet_id), not just tweet_id
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Step 1: Drop the incorrect constraint (on tweet_id alone)
DROP INDEX IF EXISTS idx_project_tweets_tweet_id;

-- Step 2: Also check for any other unique constraint on tweet_id
ALTER TABLE project_tweets DROP CONSTRAINT IF EXISTS project_tweets_tweet_id_key;
ALTER TABLE project_tweets DROP CONSTRAINT IF EXISTS idx_project_tweets_tweet_id;

-- Step 3: Remove duplicate tweets (keep only the first one per project_id + tweet_id)
DELETE FROM project_tweets a
USING project_tweets b
WHERE a.id > b.id
  AND a.project_id = b.project_id
  AND a.tweet_id = b.tweet_id;

-- Step 4: Create the CORRECT unique constraint (per project)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tweets_project_tweet 
ON project_tweets(project_id, tweet_id);

-- Step 5: Also clean up the fake seed data while we're at it
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

-- Step 6: Verify
SELECT 
  'Total tweets remaining' as metric,
  COUNT(*)::text as value
FROM project_tweets
UNION ALL
SELECT 
  'Unique constraint exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_project_tweets_project_tweet'
  ) THEN 'YES ✓' ELSE 'NO ✗' END;

