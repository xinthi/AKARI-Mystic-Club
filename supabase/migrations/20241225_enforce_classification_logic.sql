-- Migration: Enforce Classification Logic
-- Purpose: Ensure clear separation between identity (user-declared) and ecosystem type (admin-controlled)
-- Date: 2024-12-25
-- 
-- Classification Logic:
-- 1. Identity (akari_users.persona_type): User self-declared in /portal/me
--    - Values: 'individual' | 'company'
--    - Default: 'individual'
--    - Updated by: Users via /api/portal/profile/persona
--    - NEVER updated by admin classification
--
-- 2. Ecosystem Type (projects.profile_type): SuperAdmin controlled
--    - Values: 'personal' | 'project'
--    - Default: 'personal'
--    - Updated by: SuperAdmin only via Projects Admin
--    - Controls: ARC Top Projects visibility (only 'project' appears)

-- =============================================================================
-- 1. ENSURE projects.profile_type DEFAULT IS 'personal'
-- =============================================================================

-- Change default if not already set
ALTER TABLE projects 
  ALTER COLUMN profile_type SET DEFAULT 'personal';

-- Ensure check constraint allows both values
DO $$
BEGIN
  -- Drop existing constraint if it exists with different values
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'projects_profile_type_check'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_profile_type_check;
  END IF;
  
  -- Add correct constraint
  ALTER TABLE projects 
    ADD CONSTRAINT projects_profile_type_check 
    CHECK (profile_type IN ('personal', 'project'));
END $$;

-- =============================================================================
-- 2. ENSURE akari_users.persona_type DEFAULT IS 'individual'
-- =============================================================================

-- Change default if not already set
ALTER TABLE akari_users 
  ALTER COLUMN persona_type SET DEFAULT 'individual';

-- Ensure check constraint allows both values
DO $$
BEGIN
  -- Drop existing constraint if it exists with different values
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'akari_users_persona_type_check'
  ) THEN
    ALTER TABLE akari_users DROP CONSTRAINT IF EXISTS akari_users_persona_type_check;
  END IF;
  
  -- Add correct constraint
  ALTER TABLE akari_users 
    ADD CONSTRAINT akari_users_persona_type_check 
    CHECK (persona_type IN ('individual', 'company'));
END $$;

-- =============================================================================
-- 3. ADD COMMENTS FOR CLARITY
-- =============================================================================

COMMENT ON COLUMN projects.profile_type IS 
  'Ecosystem Type: personal or project. SuperAdmin controlled. Only projects with profile_type=''project'' appear in ARC Top Projects.';

COMMENT ON COLUMN akari_users.persona_type IS 
  'Identity: individual or company. User self-declared via /portal/me. Does NOT affect ARC Top Projects visibility.';

-- =============================================================================
-- 4. ENSURE INDEXES EXIST
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_projects_profile_type_project 
  ON projects(profile_type) 
  WHERE profile_type = 'project';

CREATE INDEX IF NOT EXISTS idx_akari_users_persona_type 
  ON akari_users(persona_type) 
  WHERE persona_type IS NOT NULL;

