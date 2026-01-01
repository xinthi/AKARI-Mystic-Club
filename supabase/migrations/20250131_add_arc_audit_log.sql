-- =============================================================================
-- Migration: Add ARC Audit Log Table
-- Purpose: Track all ARC-related actions for observability and compliance
-- Date: 2025-01-31
-- 
-- This migration creates an audit log table to track all ARC operations:
-- - Leaderboard requests (create, approve, reject)
-- - Arena operations (activate, create, update)
-- - Project features updates
-- - Project access changes
-- 
-- Safe to re-run: Uses CREATE TABLE IF NOT EXISTS
-- =============================================================================

-- =============================================================================
-- 1. CREATE arc_audit_log TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS arc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_profile_id UUID NULL,  -- Who performed the action (superadmin or project team member)
  project_id UUID NULL,         -- Project affected by the action
  entity_type TEXT NOT NULL,    -- Type of entity: 'leaderboard_request', 'arena', 'project_features', 'project_access', 'billing_record'
  entity_id UUID NULL,          -- ID of the affected entity
  action TEXT NOT NULL,         -- Action performed: 'request_created', 'request_approved', 'request_rejected', 'arena_activated', 'arena_created', 'arena_updated', 'features_updated', 'access_updated', etc.
  success BOOLEAN NOT NULL DEFAULT true,  -- Whether the action succeeded
  message TEXT NULL,            -- Human-readable message or error description
  request_id TEXT NULL,         -- HTTP request ID or correlation ID for tracing
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb  -- Additional context: payload, diffs, counts, etc.
);

-- =============================================================================
-- 2. ADD INDEXES
-- =============================================================================

-- Index for querying by project and time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_arc_audit_project_created_at 
  ON arc_audit_log(project_id, created_at DESC) 
  WHERE project_id IS NOT NULL;

-- Index for querying by actor and time (audit trail for specific users)
CREATE INDEX IF NOT EXISTS idx_arc_audit_actor_created_at 
  ON arc_audit_log(actor_profile_id, created_at DESC) 
  WHERE actor_profile_id IS NOT NULL;

-- Index for querying by entity type and ID (find all actions on a specific entity)
CREATE INDEX IF NOT EXISTS idx_arc_audit_entity 
  ON arc_audit_log(entity_type, entity_id) 
  WHERE entity_id IS NOT NULL;

-- Additional index for time-based queries (recent activity)
CREATE INDEX IF NOT EXISTS idx_arc_audit_created_at 
  ON arc_audit_log(created_at DESC);

-- Index for querying by action type
CREATE INDEX IF NOT EXISTS idx_arc_audit_action 
  ON arc_audit_log(action);

-- =============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE arc_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. RLS POLICIES
-- =============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Service role full access on arc_audit_log" ON arc_audit_log;
DROP POLICY IF EXISTS "Project team can read their project audit logs" ON arc_audit_log;
DROP POLICY IF EXISTS "Super admin can read all audit logs" ON arc_audit_log;

-- Service role has full access (for API routes and admin operations)
CREATE POLICY "Service role full access on arc_audit_log"
ON arc_audit_log FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: No client-side access policies by default
-- Audit logs are sensitive and should only be accessed via service role API routes
-- If read access is needed for project teams, add a policy like:
-- 
-- CREATE POLICY "Project team can read their project audit logs"
-- ON arc_audit_log FOR SELECT
-- USING (
--   auth.uid() IS NOT NULL
--   AND is_user_project_admin(get_current_user_profile_id(), project_id)
-- );

-- =============================================================================
-- 5. HELPER FUNCTION (Optional - for easy logging from RPC functions)
-- =============================================================================

-- Helper function to insert audit log entries
-- Can be called from RPC functions or API routes
CREATE OR REPLACE FUNCTION arc_audit_log_insert(
  p_actor_profile_id UUID,
  p_project_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_success BOOLEAN DEFAULT true,
  p_message TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO arc_audit_log (
    actor_profile_id,
    project_id,
    entity_type,
    entity_id,
    action,
    success,
    message,
    request_id,
    metadata
  )
  VALUES (
    p_actor_profile_id,
    p_project_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_success,
    p_message,
    p_request_id,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- =============================================================================
-- NOTES
-- =============================================================================

-- Table Summary:
-- 
-- arc_audit_log tracks all ARC-related operations for observability:
-- 
-- Common entity_type values:
--   - 'leaderboard_request': ARC leaderboard access requests
--   - 'arena': Arena entities
--   - 'project_features': arc_project_features updates
--   - 'project_access': arc_project_access updates
--   - 'billing_record': arc_billing_records
-- 
-- Common action values:
--   - 'request_created': New leaderboard request submitted
--   - 'request_approved': Request approved by admin
--   - 'request_rejected': Request rejected by admin
--   - 'arena_activated': Arena activated for a project
--   - 'arena_created': New arena created
--   - 'arena_updated': Arena details updated
--   - 'arena_ended': Arena ended/deactivated
--   - 'features_updated': Project features enabled/disabled
--   - 'access_updated': Project access status changed
--   - 'billing_created': Billing record created
-- 
-- Usage:
--   - Insert audit logs from API routes after operations complete
--   - Use arc_audit_log_insert() helper function for convenience
--   - Query audit logs via service role API routes only
--   - Use metadata JSONB field for flexible context storage
-- 
-- Security:
--   - RLS enabled: Only service role can write
--   - No client-side access by default (add policies if needed)
--   - All writes must go through service role API routes
-- 
-- Performance:
--   - Indexes optimized for common query patterns:
--     - By project + time (most common)
--     - By actor + time (user audit trail)
--     - By entity type + ID (entity history)
--     - By time (recent activity)
--     - By action (action type analysis)
