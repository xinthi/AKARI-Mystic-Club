-- =============================================================================
-- Migration: ARC RLS Hotfix v2
-- Purpose: Fix function parameter references, standardize policies, enforce immutability
-- Date: 2025-12-18
-- 
-- This migration:
-- A) Fixes is_user_project_admin() function using $1/$2 parameter references
-- B) Standardizes arc_leaderboard_requests policies to use helper function (idempotent)
-- C) Makes arc_link_events explicitly immutable with idempotent policies
-- 
-- Safe to re-run: Uses CREATE OR REPLACE and DROP POLICY IF EXISTS
-- =============================================================================

-- =============================================================================
-- A) FIX is_user_project_admin() FUNCTION
-- =============================================================================

-- Fix parameter references using $1/$2 to avoid ambiguity with column names
CREATE OR REPLACE FUNCTION is_user_project_admin(profile_id UUID, project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM project_team_members ptm
    WHERE ptm.profile_id = $1
      AND ptm.project_id = $2
      AND ptm.role IN ('owner', 'admin', 'moderator')
  )
  OR is_user_super_admin($1);
END;
$$;

-- =============================================================================
-- B) STANDARDIZE arc_leaderboard_requests POLICIES (IDEMPOTENT)
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
-- C) MAKE arc_link_events EXPLICITLY IMMUTABLE (IDEMPOTENT)
-- =============================================================================

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "No updates allowed on arc_link_events" ON arc_link_events;
DROP POLICY IF EXISTS "No deletes allowed on arc_link_events" ON arc_link_events;

-- Add explicit UPDATE deny policy (service role already has full access, so this applies to regular users)
CREATE POLICY "No updates allowed on arc_link_events"
ON arc_link_events FOR UPDATE
USING (false)
WITH CHECK (false);

-- Add explicit DELETE deny policy (service role already has full access, so this applies to regular users)
CREATE POLICY "No deletes allowed on arc_link_events"
ON arc_link_events FOR DELETE
USING (false);

