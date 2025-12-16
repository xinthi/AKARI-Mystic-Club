-- Migration: Add arc_leaderboard_requests table
-- Purpose: Allow users to request ARC leaderboard access for projects
-- Date: 2024-12-27

-- =============================================================================
-- CREATE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS arc_leaderboard_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: prevent duplicate pending requests per project
-- Note: This allows multiple requests if previous ones are approved/rejected
-- Only one pending request per project total (regardless of requester)
CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_unique_pending
  ON arc_leaderboard_requests(project_id)
  WHERE status = 'pending';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_project_id
  ON arc_leaderboard_requests(project_id);

-- Index for fast lookups by requester
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_requested_by
  ON arc_leaderboard_requests(requested_by);

-- Index for fast lookups by status
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_status
  ON arc_leaderboard_requests(status);

-- Index for pending requests (most common query)
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_pending
  ON arc_leaderboard_requests(project_id, requested_by, status)
  WHERE status = 'pending';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE arc_leaderboard_requests ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's profile ID from auth.uid()
-- Maps from akari_users.id (auth.uid()) to profiles.id via akari_user_identities
CREATE OR REPLACE FUNCTION get_current_user_profile_id()
RETURNS UUID AS $$
DECLARE
  profile_id UUID;
BEGIN
  SELECT p.id INTO profile_id
  FROM profiles p
  INNER JOIN akari_user_identities aui ON aui.username = p.username
  WHERE aui.user_id = auth.uid()::text::uuid
    AND aui.provider = 'x'
  LIMIT 1;
  
  RETURN profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy 1: Requester can insert their own row
-- Check that requested_by matches the current user's profile ID
CREATE POLICY "Requester can insert own requests"
ON arc_leaderboard_requests FOR INSERT
WITH CHECK (
  requested_by = get_current_user_profile_id()
);

-- Policy 2: Requester can read rows where requested_by = their profile ID
CREATE POLICY "Requester can read own requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  requested_by = get_current_user_profile_id()
);

-- Policy 3: Super admin can read all rows
-- Check profiles.real_roles contains 'super_admin'
CREATE POLICY "Super admin can read all requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);

-- Policy 4: Super admin can update all rows
CREATE POLICY "Super admin can update all requests"
ON arc_leaderboard_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);

-- Policy: Service role can do everything (for API routes using service key)
CREATE POLICY "Service role full access on arc_leaderboard_requests"
ON arc_leaderboard_requests FOR ALL
USING (true)
WITH CHECK (true);

-- =============================================================================
-- TRIGGER: Update updated_at timestamp
-- =============================================================================

CREATE OR REPLACE FUNCTION update_arc_leaderboard_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_arc_leaderboard_requests_updated_at
  BEFORE UPDATE ON arc_leaderboard_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_leaderboard_requests_updated_at();

