-- Migration: Add Creator Gamification tables (badges)
-- Purpose: Enable badge system for Creator Manager
-- Date: 2024-12-18

-- =============================================================================
-- 1. CREATOR_MANAGER_BADGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- e.g. "narrative_master", "engagement_king"
  name TEXT NOT NULL, -- User-facing name
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_badges_slug ON creator_manager_badges(slug);

-- =============================================================================
-- 2. CREATOR_MANAGER_CREATOR_BADGES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_creator_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES creator_manager_badges(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, creator_profile_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_creator_badges_program ON creator_manager_creator_badges(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_creator_badges_creator ON creator_manager_creator_badges(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_creator_badges_badge ON creator_manager_creator_badges(badge_id);

-- =============================================================================
-- 3. RLS POLICIES
-- =============================================================================

ALTER TABLE creator_manager_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_creator_badges ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on creator_manager_badges"
ON creator_manager_badges
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_creator_badges"
ON creator_manager_creator_badges
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access for badges
CREATE POLICY "Allow public read on creator_manager_badges"
ON creator_manager_badges
FOR SELECT
USING (true);

CREATE POLICY "Allow public read on creator_manager_creator_badges"
ON creator_manager_creator_badges
FOR SELECT
USING (true);

