-- ============================================
-- FIX: Add unique constraint for project_tweets
-- ============================================
-- The updateAllProjects script uses ON CONFLICT (project_id, tweet_id)
-- but the table doesn't have a unique constraint on these columns.
-- ============================================

-- Step 1: Remove any duplicate rows (keep the first one)
DELETE FROM project_tweets a
USING project_tweets b
WHERE a.id > b.id 
  AND a.project_id = b.project_id 
  AND a.tweet_id = b.tweet_id;

-- Step 2: Add the unique constraint
ALTER TABLE project_tweets
ADD CONSTRAINT project_tweets_project_id_tweet_id_key 
UNIQUE (project_id, tweet_id);

-- Verify
SELECT 
  constraint_name,
  table_name
FROM information_schema.table_constraints 
WHERE table_name = 'project_tweets' 
  AND constraint_type = 'UNIQUE';

