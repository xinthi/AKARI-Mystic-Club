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

-- Policy: Requester can read their own requests
CREATE POLICY "Requester can read own requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  requested_by IN (
    SELECT id FROM profiles WHERE username = (
      SELECT username FROM akari_user_identities 
      WHERE user_id = auth.uid()::text::uuid
      AND provider = 'x'
      LIMIT 1
    )
  )
);

-- Policy: Super admin can read all requests
CREATE POLICY "Super admin can read all requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM akari_user_roles
    WHERE user_id = auth.uid()::text::uuid
    AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id IN (
      SELECT id FROM profiles WHERE username = (
        SELECT username FROM akari_user_identities 
        WHERE user_id = auth.uid()::text::uuid
        AND provider = 'x'
        LIMIT 1
      )
    )
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);

-- Policy: Super admin can update all requests
CREATE POLICY "Super admin can update all requests"
ON arc_leaderboard_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM akari_user_roles
    WHERE user_id = auth.uid()::text::uuid
    AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id IN (
      SELECT id FROM profiles WHERE username = (
        SELECT username FROM akari_user_identities 
        WHERE user_id = auth.uid()::text::uuid
        AND provider = 'x'
        LIMIT 1
      )
    )
    AND real_roles @> ARRAY['super_admin']::text[]
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM akari_user_roles
    WHERE user_id = auth.uid()::text::uuid
    AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE id IN (
      SELECT id FROM profiles WHERE username = (
        SELECT username FROM akari_user_identities 
        WHERE user_id = auth.uid()::text::uuid
        AND provider = 'x'
        LIMIT 1
      )
    )
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);

-- Policy: Service role can do everything (for API routes)
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

