-- Migration: Add project claiming and classification fields
-- Purpose: Enable project claiming, classification, and team management
-- Date: 2024-12-16

-- =============================================================================
-- 1. EXTEND PROJECTS TABLE with claiming and classification fields
-- =============================================================================

DO $$ 
BEGIN
  -- Add display_name if missing (for better display)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'display_name') THEN
    ALTER TABLE projects ADD COLUMN display_name TEXT;
    -- Copy name to display_name for existing rows
    UPDATE projects SET display_name = name WHERE display_name IS NULL;
  END IF;

  -- Add is_company flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'is_company') THEN
    ALTER TABLE projects ADD COLUMN is_company BOOLEAN DEFAULT false;
  END IF;

  -- Add profile_type (project vs personal)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'profile_type') THEN
    ALTER TABLE projects ADD COLUMN profile_type TEXT DEFAULT 'project' 
      CHECK (profile_type IN ('project', 'personal'));
  END IF;

  -- Add claimed_by (references akari_users.id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'claimed_by') THEN
    ALTER TABLE projects ADD COLUMN claimed_by UUID REFERENCES akari_users(id) ON DELETE SET NULL;
  END IF;

  -- Add claimed_at timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'claimed_at') THEN
    ALTER TABLE projects ADD COLUMN claimed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Ensure twitter_username is unique (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'projects_twitter_username_key'
  ) THEN
    -- Check if there are duplicates first
    IF NOT EXISTS (
      SELECT 1 FROM projects 
      GROUP BY LOWER(twitter_username) 
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS projects_twitter_username_key 
        ON projects(LOWER(twitter_username));
    END IF;
  END IF;
END $$;

-- Add indexes for claiming fields
CREATE INDEX IF NOT EXISTS idx_projects_claimed_by ON projects(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_profile_type ON projects(profile_type);
CREATE INDEX IF NOT EXISTS idx_projects_is_company ON projects(is_company) WHERE is_company = true;

-- =============================================================================
-- 2. ADD real_roles TO PROFILES TABLE (Twitter profiles)
-- =============================================================================
-- Note: This stores roles for Twitter profiles that are linked to AKARI users
-- Values: 'user', 'creator', 'project_admin', 'super_admin', 'institutional'

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'real_roles') THEN
    ALTER TABLE profiles ADD COLUMN real_roles TEXT[] DEFAULT ARRAY['user']::TEXT[];
    
    -- Add check constraint to ensure valid roles
    ALTER TABLE profiles ADD CONSTRAINT profiles_real_roles_check 
      CHECK (
        real_roles <@ ARRAY['user', 'creator', 'project_admin', 'super_admin', 'institutional']::TEXT[]
      );
  END IF;
END $$;

-- Add index for role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_real_roles ON profiles USING GIN(real_roles);

-- =============================================================================
-- 3. CREATE project_team_members TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator', 'investor_view')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One role per profile per project
  UNIQUE(project_id, profile_id, role)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_team_members_project ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_profile ON project_team_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_role ON project_team_members(project_id, role);

-- =============================================================================
-- 4. RLS POLICIES for project_team_members
-- =============================================================================

ALTER TABLE project_team_members ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on project_team_members"
ON project_team_members
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access (for checking team membership)
CREATE POLICY "Allow public read on project_team_members"
ON project_team_members
FOR SELECT
USING (true);

