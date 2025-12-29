-- =============================================================================
-- Migration: Add ARC Follow Verification Table
-- Purpose: Store follow verification status for Option 2 (Normal Leaderboard)
-- Date: 2025-01-21
-- =============================================================================

CREATE TABLE IF NOT EXISTS arc_project_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  twitter_username TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One verification per project per profile/twitter_username
  UNIQUE (project_id, profile_id),
  UNIQUE (project_id, twitter_username)
);

CREATE INDEX IF NOT EXISTS idx_arc_project_follows_project_id 
  ON arc_project_follows(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_project_follows_profile_id 
  ON arc_project_follows(profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_project_follows_twitter_username 
  ON arc_project_follows(twitter_username);

-- Enable RLS
ALTER TABLE arc_project_follows ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on arc_project_follows"
ON arc_project_follows FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can read their own verifications
CREATE POLICY "Users can read own arc_project_follows"
ON arc_project_follows FOR SELECT
USING (
  profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
);

-- Users can insert their own verifications
CREATE POLICY "Users can insert own arc_project_follows"
ON arc_project_follows FOR INSERT
WITH CHECK (
  profile_id = get_current_user_profile_id()
);

