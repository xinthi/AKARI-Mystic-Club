-- Migration: Add ARC Leaderboard Enhancements
-- Purpose: Add header images, affiliate titles, and support for enhanced leaderboard features
-- Date: 2025-01-27

-- =============================================================================
-- 1. ADD header_image_url TO PROJECTS TABLE
-- =============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'header_image_url') THEN
    ALTER TABLE projects ADD COLUMN header_image_url TEXT;
  END IF;
END $$;

-- =============================================================================
-- 2. ADD affiliate_title TO project_team_members TABLE
-- =============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_team_members' AND column_name = 'affiliate_title') THEN
    ALTER TABLE project_team_members ADD COLUMN affiliate_title TEXT;
    -- Examples: 'Founder', 'CMO', 'Investor', 'Advisor', etc.
  END IF;
END $$;

-- Add index for affiliate lookups
CREATE INDEX IF NOT EXISTS idx_project_team_members_affiliate 
  ON project_team_members(project_id) 
  WHERE affiliate_title IS NOT NULL;

