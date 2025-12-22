-- =============================================================================
-- Migration: Add ARC Quests (Option 3) and Contributions Tables
-- Purpose: Support gamified leaderboard quests and contribution tracking
-- Date: 2025-01-22
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ARC_QUESTS
-- Quests/sprints for Option 3 (Gamified Leaderboard)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arena_id UUID REFERENCES arenas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  narrative_focus TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reward_desc TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure end_at > start_at
  CONSTRAINT arc_quests_valid_dates CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_arc_quests_project_id 
  ON arc_quests(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_quests_arena_id 
  ON arc_quests(arena_id);
CREATE INDEX IF NOT EXISTS idx_arc_quests_status 
  ON arc_quests(status);
CREATE INDEX IF NOT EXISTS idx_arc_quests_dates 
  ON arc_quests(starts_at, ends_at);

-- =============================================================================
-- 2. ARC_CONTRIBUTIONS
-- Tracked X activity for scoring pipeline
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arena_id UUID REFERENCES arenas(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  twitter_username TEXT NOT NULL,
  post_id TEXT,
  post_type TEXT NOT NULL DEFAULT 'original'
    CHECK (post_type IN ('original', 'quote', 'reply', 'retweet')),
  media_type TEXT
    CHECK (media_type IN ('text', 'image', 'video', 'link')),
  engagement_json JSONB,
  sentiment_score NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Index for efficient lookups
  CONSTRAINT arc_contributions_post_unique UNIQUE (project_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_arc_contributions_project_id 
  ON arc_contributions(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_contributions_arena_id 
  ON arc_contributions(arena_id);
CREATE INDEX IF NOT EXISTS idx_arc_contributions_profile_id 
  ON arc_contributions(profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_contributions_twitter_username 
  ON arc_contributions(twitter_username);
CREATE INDEX IF NOT EXISTS idx_arc_contributions_created_at 
  ON arc_contributions(created_at);
CREATE INDEX IF NOT EXISTS idx_arc_contributions_post_type 
  ON arc_contributions(post_type);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE arc_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_contributions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role full access on arc_quests"
  ON arc_quests FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on arc_contributions"
  ON arc_contributions FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read quests for projects they have access to
CREATE POLICY "Users can read quests for accessible projects"
  ON arc_quests FOR SELECT
  USING (true); -- Simplified: all authenticated users can read

-- Users can read contributions (for leaderboard visibility)
CREATE POLICY "Users can read contributions"
  ON arc_contributions FOR SELECT
  USING (true); -- Simplified: all authenticated users can read

-- Only service role can write contributions (via API)
CREATE POLICY "Only service role can write contributions"
  ON arc_contributions FOR INSERT
  USING (auth.role() = 'service_role');


