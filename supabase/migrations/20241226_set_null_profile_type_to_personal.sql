-- Migration: Set NULL profile_type to 'personal'
-- Purpose: Ensure all existing projects have a profile_type value
-- Date: 2024-12-26
-- 
-- This migration sets all NULL profile_type values to 'personal' to ensure
-- that all tracked profiles default to 'personal' until SuperAdmin changes them to 'project'.
-- 
-- Only projects with profile_type='project' appear in ARC Top Projects and heat maps.

-- =============================================================================
-- SET NULL profile_type TO 'personal'
-- =============================================================================

UPDATE projects 
SET profile_type = 'personal'
WHERE profile_type IS NULL;

-- Verify no NULLs remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM projects WHERE profile_type IS NULL) THEN
    RAISE EXCEPTION 'Migration failed: Some projects still have NULL profile_type';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN projects.profile_type IS 
  'Ecosystem Type: personal or project. SuperAdmin controlled. Only projects with profile_type=''project'' appear in ARC Top Projects and heat maps. Default: personal.';

