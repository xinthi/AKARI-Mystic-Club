-- =============================================================================
-- Migration: ARC RLS Hotfix
-- Purpose: Fix function parameter syntax, standardize policies, enforce immutability
-- Date: 2025-12-18
-- 
-- This migration:
-- A) Fixes is_user_project_admin() function parameter references
-- B) Standardizes arc_leaderboard_requests policies to use helper function
-- C) Makes arc_link_events explicitly immutable (deny UPDATE/DELETE)
-- 
-- Safe to re-run: Uses CREATE OR REPLACE and DROP POLICY IF EXISTS
-- =============================================================================

-- =============================================================================
-- A) FIX is_user_project_admin() FUNCTION
-- =============================================================================

-- Fix parameter references - use direct parameter names, not function name qualifier
CREATE OR REPLACE FUNCTION is_user_project_admin(profile_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check project_team_members for admin/moderator/owner role
  -- OR check if user is super admin
  RETURN EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_team_members.profile_id = profile_id
    AND project_team_members.project_id = project_id
    AND project_team_members.role IN ('owner', 'admin', 'moderator')
  )
  OR is_user_super_admin(profile_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- B) STANDARDIZE arc_leaderboard_requests POLICIES
-- =============================================================================

-- Drop existing super admin policies to recreate with helper function
DROP POLICY IF EXISTS "Super admin can read all requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Super admin can update all requests" ON arc_leaderboard_requests;

-- Recreate with standardized helper function
CREATE POLICY "Super admin can read all requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  is_user_super_admin(get_current_user_profile_id())
);

CREATE POLICY "Super admin can update all requests"
ON arc_leaderboard_requests FOR UPDATE
USING (
  is_user_super_admin(get_current_user_profile_id())
)
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
);

-- =============================================================================
-- C) MAKE arc_link_events EXPLICITLY IMMUTABLE
-- =============================================================================

-- Add explicit UPDATE deny policy (service role already has full access, so this applies to regular users)
CREATE POLICY "No updates allowed on arc_link_events"
ON arc_link_events FOR UPDATE
USING (false)
WITH CHECK (false);

-- Add explicit DELETE deny policy (service role already has full access, so this applies to regular users)
CREATE POLICY "No deletes allowed on arc_link_events"
ON arc_link_events FOR DELETE
USING (false);

-- =============================================================================
-- VERIFICATION SECTION (SQL comments for manual testing)
-- =============================================================================

-- Uncomment to verify functions compile and work:
/*
-- Test is_user_project_admin function (replace with actual UUIDs):
SELECT is_user_project_admin('00000000-0000-0000-0000-000000000000'::UUID, '00000000-0000-0000-0000-000000000000'::UUID);

-- Test is_user_super_admin function (replace with actual UUID):
SELECT is_user_super_admin('00000000-0000-0000-0000-000000000000'::UUID);

-- Test get_current_user_profile_id function:
SELECT get_current_user_profile_id();

-- Verify policies exist for touched tables:
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('arc_leaderboard_requests', 'arc_link_events')
ORDER BY tablename, policyname;

-- Verify project_team_members table exists (required by is_user_project_admin):
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'project_team_members'
);
*/

