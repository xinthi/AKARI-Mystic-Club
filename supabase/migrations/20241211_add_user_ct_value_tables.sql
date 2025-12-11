-- =============================================================================
-- User CT Activity & Value Scores Tables (Phase 1 Value System)
-- =============================================================================
-- Run this migration in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates tables for tracking user activity and computing value scores per project.
-- Does NOT modify any existing tables.
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. USER_CT_ACTIVITY TABLE
-- Stores per-tweet activity for each AKARI user + project
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_ct_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,                    -- References akari_users(id)
  x_user_id TEXT NOT NULL,                  -- User's X (Twitter) user ID
  tweet_id TEXT NOT NULL,                   -- Tweet ID from Twitter
  tweet_url TEXT NOT NULL,                  -- Full URL to the tweet
  tweeted_at TIMESTAMPTZ NOT NULL,          -- When the tweet was posted
  project_id UUID NOT NULL,                 -- References projects(id)
  project_slug TEXT NOT NULL,               -- Project slug for quick lookup
  likes INT NOT NULL DEFAULT 0,
  replies INT NOT NULL DEFAULT 0,
  retweets INT NOT NULL DEFAULT 0,
  quote_count INT NOT NULL DEFAULT 0,
  sentiment_score INT,                      -- Optional: -100 to 100
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: one record per user+tweet+project combination
  CONSTRAINT user_ct_activity_unique UNIQUE (user_id, tweet_id, project_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_ct_activity_user_id ON user_ct_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ct_activity_project_id ON user_ct_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_user_ct_activity_tweeted_at ON user_ct_activity(tweeted_at DESC);

-- =============================================================================
-- 2. USER_PROJECT_VALUE_SCORES TABLE
-- Aggregated value scores for each user→project pair (based on last 200 tweets)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_project_value_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,                    -- References akari_users(id)
  project_id UUID NOT NULL,                 -- References projects(id)
  project_slug TEXT NOT NULL,               -- Project slug for quick lookup
  source_window TEXT NOT NULL DEFAULT 'last_200_tweets', -- e.g. 'last_200_tweets'
  tweet_count INT NOT NULL DEFAULT 0,
  total_likes INT NOT NULL DEFAULT 0,
  total_replies INT NOT NULL DEFAULT 0,
  total_retweets INT NOT NULL DEFAULT 0,
  total_engagement INT NOT NULL DEFAULT 0,
  value_score INT NOT NULL DEFAULT 0,
  last_tweeted_at TIMESTAMPTZ,              -- Most recent tweet timestamp
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraint: one score per user+project+source_window combination
  CONSTRAINT user_project_value_scores_unique UNIQUE (user_id, project_id, source_window)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_project_value_scores_user_id ON user_project_value_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_project_value_scores_value_score ON user_project_value_scores(value_score DESC);

-- =============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE user_ct_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_project_value_scores ENABLE ROW LEVEL SECURITY;

-- Service role full access (for backend API operations)
CREATE POLICY "Service role full access on user_ct_activity"
  ON user_ct_activity FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on user_project_value_scores"
  ON user_project_value_scores FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 4. HELPER FUNCTION: Update timestamp trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION update_user_ct_activity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on user_ct_activity
DROP TRIGGER IF EXISTS trigger_user_ct_activity_updated_at ON user_ct_activity;
CREATE TRIGGER trigger_user_ct_activity_updated_at
  BEFORE UPDATE ON user_ct_activity
  FOR EACH ROW
  EXECUTE FUNCTION update_user_ct_activity_updated_at();

-- =============================================================================
-- End of migration
-- =============================================================================

