-- Migration: Allow NULL profile_type for unclassified profiles
-- Purpose: Newly tracked profiles start as NULL (unclassified) until user claims and SuperAdmin classifies
-- Date: 2024-12-26
-- 
-- Classification Flow:
-- 1. Track: profile_type = NULL (unclassified)
-- 2. Claim: User sets identity (individual/company) via akari_users.persona_type
-- 3. Classify: SuperAdmin sets profile_type ('personal' or 'project') which controls ARC visibility
--
-- Only projects with profile_type='project' appear in ARC Top Projects and heat maps.

-- =============================================================================
-- 1. UPDATE CONSTRAINT TO ALLOW NULL
-- =============================================================================

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'projects_profile_type_check'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_profile_type_check;
  END IF;
  
  -- Add constraint that allows NULL, 'personal', or 'project'
  ALTER TABLE projects 
    ADD CONSTRAINT projects_profile_type_check 
    CHECK (profile_type IS NULL OR profile_type IN ('personal', 'project'));
END $$;

-- =============================================================================
-- 2. CHANGE DEFAULT TO NULL (unclassified)
-- =============================================================================

ALTER TABLE projects 
  ALTER COLUMN profile_type SET DEFAULT NULL;

-- =============================================================================
-- 3. UPDATE EXISTING UNCLAIMED PROFILES TO NULL
-- =============================================================================

-- Set profile_type to NULL for profiles that haven't been claimed yet
-- (They should be unclassified until user claims and SuperAdmin classifies)
UPDATE projects 
SET profile_type = NULL
WHERE claimed_by IS NULL
  AND profile_type = 'personal';  -- Only update those that were auto-set to 'personal'

-- =============================================================================
-- 4. UPDATE COMMENT
-- =============================================================================

COMMENT ON COLUMN projects.profile_type IS 
  'Ecosystem Type: NULL (unclassified), personal, or project. SuperAdmin controlled. NULL = newly tracked, not yet claimed/classified. Only projects with profile_type=''project'' appear in ARC Top Projects and heat maps.';

