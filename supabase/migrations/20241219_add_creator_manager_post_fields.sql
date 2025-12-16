-- Migration: Add post linking fields to creator_manager_mission_progress
-- Purpose: Enable linking mission submissions to posts (tweets) for ARC scoring
-- Date: 2024-12-19

-- =============================================================================
-- EXTEND creator_manager_mission_progress TABLE
-- =============================================================================

DO $$ 
BEGIN
  -- Add post_url field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_manager_mission_progress' AND column_name = 'post_url') THEN
    ALTER TABLE creator_manager_mission_progress ADD COLUMN post_url TEXT;
  END IF;

  -- Add post_tweet_id field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_manager_mission_progress' AND column_name = 'post_tweet_id') THEN
    ALTER TABLE creator_manager_mission_progress ADD COLUMN post_tweet_id TEXT;
  END IF;
END $$;

-- Add index for tweet_id lookups (for future engagement data fetching)
CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_tweet_id 
  ON creator_manager_mission_progress(post_tweet_id) 
  WHERE post_tweet_id IS NOT NULL;

-- Add index for program_id + creator_profile_id (for scoring queries)
CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_program_creator 
  ON creator_manager_mission_progress(program_id, creator_profile_id);

