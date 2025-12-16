-- Migration: Add UTM tracking for Creator Manager
-- Purpose: Enable click tracking for campaign links
-- Date: 2024-12-21

-- =============================================================================
-- 1. CREATOR_MANAGER_LINKS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  utm_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_links_program ON creator_manager_links(program_id);

-- =============================================================================
-- 2. CREATOR_MANAGER_LINK_CLICKS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES creator_manager_links(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  creator_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_link_clicks_link ON creator_manager_link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_link_clicks_program ON creator_manager_link_clicks(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_link_clicks_creator ON creator_manager_link_clicks(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_link_clicks_created ON creator_manager_link_clicks(created_at);

-- =============================================================================
-- 3. RLS POLICIES
-- =============================================================================

ALTER TABLE creator_manager_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_link_clicks ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on creator_manager_links"
ON creator_manager_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_link_clicks"
ON creator_manager_link_clicks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access for links (creators need to see them)
CREATE POLICY "Allow public read on creator_manager_links"
ON creator_manager_links
FOR SELECT
USING (true);

