-- Migration: Add Spotlight Links and Objective to Creator Manager Programs
-- Purpose: Enable programs to define up to 5 spotlight URLs that get converted to UTM links per creator
-- Date: 2025-01-12

-- =============================================================================
-- 1. ADD objective FIELD TO creator_manager_programs
-- =============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'creator_manager_programs' 
                 AND column_name = 'objective') THEN
    ALTER TABLE creator_manager_programs ADD COLUMN objective TEXT;
  END IF;
END $$;

-- =============================================================================
-- 2. CREATOR_MANAGER_SPOTLIGHT_LINKS TABLE
-- Stores up to 5 spotlight URLs per program (defined at program creation)
-- These will be converted to per-creator UTM links when creators join
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_spotlight_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT, -- Optional label for the link (e.g., "Website", "Twitter", "Docs")
  display_order INTEGER NOT NULL DEFAULT 0, -- Order in which links should be displayed (0-4)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: Maximum 5 links per program will be enforced at the application level

CREATE INDEX IF NOT EXISTS idx_creator_manager_spotlight_links_program 
  ON creator_manager_spotlight_links(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_spotlight_links_order 
  ON creator_manager_spotlight_links(program_id, display_order);

-- =============================================================================
-- 3. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE creator_manager_spotlight_links ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on creator_manager_spotlight_links"
ON creator_manager_spotlight_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access (creators need to see spotlight links)
CREATE POLICY "Allow public read on creator_manager_spotlight_links"
ON creator_manager_spotlight_links
FOR SELECT
USING (true);

-- =============================================================================
-- NOTE: Per-creator UTM link generation will be handled in application code
-- When a creator joins a program, we'll create creator_manager_links entries
-- for each spotlight link, with UTM parameters specific to that creator
-- =============================================================================
