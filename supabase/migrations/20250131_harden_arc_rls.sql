-- =============================================================================
-- Migration: Harden ARC RLS Policies
-- Purpose: Enforce strict access control on ARC tables
-- Date: 2025-01-31
-- 
-- This migration:
-- 1. Ensures helper functions exist (get_current_user_profile_id, is_user_super_admin, is_user_project_admin)
-- 2. Enables RLS on all ARC tables
-- 3. Creates strict policies:
--    - arc_leaderboard_requests: Project team can read/insert their project's requests; service role for updates
--    - arc_project_access/features/billing: Project team can read; service role only for writes
-- 
-- Safe to re-run: Uses CREATE OR REPLACE and DROP POLICY IF EXISTS
-- =============================================================================

-- =============================================================================
-- 1. ENSURE HELPER FUNCTIONS EXIST
-- =============================================================================

-- Helper function to get current user's profile ID from auth.uid()
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

-- Helper function to check if user is super admin (via profiles.real_roles)
CREATE OR REPLACE FUNCTION is_user_super_admin(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = profile_id
    AND real_roles @> ARRAY['super_admin']::text[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is project team member (owner/admin/moderator)
CREATE OR REPLACE FUNCTION is_user_project_admin(profile_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check project_team_members for owner/admin/moderator role
  -- OR check if user is super admin
  RETURN EXISTS (
    SELECT 1
    FROM project_team_members ptm
    WHERE ptm.profile_id = $1
      AND ptm.project_id = $2
      AND ptm.role IN ('owner', 'admin', 'moderator')
  )
  OR is_user_super_admin($1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 2. ENABLE RLS ON ALL ARC TABLES
-- =============================================================================

ALTER TABLE IF EXISTS arc_leaderboard_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_project_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_billing_records ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. arc_leaderboard_requests POLICIES
-- =============================================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Service role full access on arc_leaderboard_requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Project team can read their project requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Project team can insert requests for their project" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Super admin can read all requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Super admin can update all requests" ON arc_leaderboard_requests;

-- Service role has full access (for admin API routes)
CREATE POLICY "Service role full access on arc_leaderboard_requests"
ON arc_leaderboard_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Project team members can read requests for their project
-- Policy: User must be in project_team_members for the request's project_id
CREATE POLICY "Project team can read their project requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Project team members can insert requests for their project
-- Policy: User must be in project_team_members for the project_id being inserted
CREATE POLICY "Project team can insert requests for their project"
ON arc_leaderboard_requests FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Note: UPDATE and DELETE are handled by service role only (via the service role policy above)
-- No additional policies needed for UPDATE/DELETE - service role is the only way

-- =============================================================================
-- 4. arc_project_access POLICIES
-- =============================================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Service role full access on arc_project_access" ON arc_project_access;
DROP POLICY IF EXISTS "Project team can read their project access" ON arc_project_access;
DROP POLICY IF EXISTS "Super admin can read all project access" ON arc_project_access;

-- Service role has full access (for admin API routes)
CREATE POLICY "Service role full access on arc_project_access"
ON arc_project_access FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Project team members can read access records for their project
CREATE POLICY "Project team can read their project access"
ON arc_project_access FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Note: INSERT/UPDATE/DELETE are handled by service role only

-- =============================================================================
-- 5. arc_project_features POLICIES
-- =============================================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Service role full access on arc_project_features" ON arc_project_features;
DROP POLICY IF EXISTS "Project team can read their project features" ON arc_project_features;
DROP POLICY IF EXISTS "Super admin can read all project features" ON arc_project_features;

-- Service role has full access (for admin API routes)
CREATE POLICY "Service role full access on arc_project_features"
ON arc_project_features FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Project team members can read features for their project
CREATE POLICY "Project team can read their project features"
ON arc_project_features FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Note: INSERT/UPDATE/DELETE are handled by service role only

-- =============================================================================
-- 6. arc_billing_records POLICIES
-- =============================================================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Service role full access on arc_billing_records" ON arc_billing_records;
DROP POLICY IF EXISTS "Project team can read their project billing" ON arc_billing_records;
DROP POLICY IF EXISTS "Super admin can read all billing records" ON arc_billing_records;

-- Service role has full access (for admin API routes)
CREATE POLICY "Service role full access on arc_billing_records"
ON arc_billing_records FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Project team members can read billing records for their project
CREATE POLICY "Project team can read their project billing"
ON arc_billing_records FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Note: INSERT/UPDATE/DELETE are handled by service role only

-- =============================================================================
-- NOTES
-- =============================================================================

-- Policy Summary:
-- 
-- arc_leaderboard_requests:
--   - SELECT: Authenticated users who are project team members (owner/admin/moderator) for that project OR superadmin
--   - INSERT: Authenticated users who are project team members for that project
--   - UPDATE/DELETE: Service role only (admin API routes)
-- 
-- arc_project_access:
--   - SELECT: Project team members OR superadmin
--   - INSERT/UPDATE/DELETE: Service role only
-- 
-- arc_project_features:
--   - SELECT: Project team members OR superadmin
--   - INSERT/UPDATE/DELETE: Service role only
-- 
-- arc_billing_records:
--   - SELECT: Project team members OR superadmin
--   - INSERT/UPDATE/DELETE: Service role only
-- 
-- Security Model:
--   - Public/anonymous users: NO access to any ARC tables
--   - Authenticated users: Can only read/insert for projects they're team members of
--   - Service role (admin API routes): Full access to all tables
--   - Superadmin check: Handled via is_user_super_admin() which checks profiles.real_roles
-- 
-- Implementation Notes:
--   - Uses get_current_user_profile_id() to convert auth.uid() to profile_id
--   - Uses is_user_project_admin() to check project_team_members table
--   - Superadmin operations should be done via service role API routes (server-side)
--   - All write operations (INSERT/UPDATE/DELETE) require service role except INSERT on arc_leaderboard_requests
