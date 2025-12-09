-- =============================================================================
-- Migration: Add project_topic_stats table for Zone of Expertise
-- Date: 2024-12-09
-- 
-- Stores topic scores per project based on tweet content analysis.
-- Topics include: ai, defi, nfts, news, macro, airdrops, memes, trading, gaming, crypto
-- =============================================================================

-- Create the project_topic_stats table
CREATE TABLE IF NOT EXISTS project_topic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (topic IN (
    'ai', 'defi', 'nfts', 'news', 'macro', 
    'airdrops', 'memes', 'trading', 'gaming', 'crypto'
  )),
  time_window TEXT NOT NULL CHECK (time_window IN ('7d', '30d')),
  score NUMERIC NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  tweet_count INTEGER NOT NULL DEFAULT 0,
  weighted_score NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each project can only have one score per topic per time_window
  CONSTRAINT project_topic_stats_unique UNIQUE (project_id, topic, time_window)
);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_project_topic_stats_project 
ON project_topic_stats (project_id);

-- Index for fast lookups by project + time_window
CREATE INDEX IF NOT EXISTS idx_project_topic_stats_project_time_window 
ON project_topic_stats (project_id, time_window);

-- Enable RLS
ALTER TABLE project_topic_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access on project_topic_stats" 
ON project_topic_stats FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_topic_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS project_topic_stats_updated_at ON project_topic_stats;
CREATE TRIGGER project_topic_stats_updated_at
  BEFORE UPDATE ON project_topic_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_project_topic_stats_updated_at();

-- =============================================================================
-- COMMENT: Run this migration with:
--   psql $DATABASE_URL -f supabase/migrations/20241209_add_project_topic_stats.sql
-- Or via Supabase Dashboard -> SQL Editor
-- =============================================================================

