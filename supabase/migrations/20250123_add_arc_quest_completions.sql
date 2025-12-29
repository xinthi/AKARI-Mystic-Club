-- =============================================================================
-- Migration: Add ARC Quest Completions Table
-- Purpose: Track quest/mission completions for users (v1 minimal)
-- Date: 2025-01-23
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ARC_QUEST_COMPLETIONS
-- Track quest/mission completions per user per arena
-- For v1: mission_id is a string identifier (e.g., 'intro-thread', 'meme-drop')
-- Future: can add quest_id UUID field to map to arc_quests table
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_quest_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  arena_id UUID REFERENCES arenas(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one completion per mission per profile per arena
  CONSTRAINT arc_quest_completions_unique UNIQUE (profile_id, mission_id, arena_id)
);

CREATE INDEX IF NOT EXISTS idx_arc_quest_completions_profile_id 
  ON arc_quest_completions(profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_quest_completions_arena_id 
  ON arc_quest_completions(arena_id);
CREATE INDEX IF NOT EXISTS idx_arc_quest_completions_mission_id 
  ON arc_quest_completions(mission_id);
CREATE INDEX IF NOT EXISTS idx_arc_quest_completions_completed_at 
  ON arc_quest_completions(completed_at DESC);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE arc_quest_completions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API routes use service role)
CREATE POLICY "Service role full access on arc_quest_completions"
  ON arc_quest_completions FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read all completions (for leaderboard/quest visibility)
-- Write access controlled via API endpoints with proper auth checks
CREATE POLICY "Users can read quest completions"
  ON arc_quest_completions FOR SELECT
  USING (true);

