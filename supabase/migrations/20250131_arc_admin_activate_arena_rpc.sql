-- =============================================================================
-- Migration: ARC Admin Activate MS Arena RPC Function
-- Purpose: Transaction-safe arena activation function
-- Date: 2025-01-31
-- 
-- This migration creates a Postgres RPC function that handles arena activation
-- in a single transaction, ensuring atomicity and preventing race conditions.
-- 
-- Safe to re-run: Uses CREATE OR REPLACE
-- =============================================================================

-- =============================================================================
-- FUNCTION: arc_admin_activate_ms_arena
-- =============================================================================

CREATE OR REPLACE FUNCTION arc_admin_activate_ms_arena(
  p_arena_id UUID,
  p_admin_profile_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_arena RECORD;
  v_result JSONB;
BEGIN
  -- Step 1: Load arena row FOR UPDATE (lock row for transaction)
  SELECT 
    id,
    project_id,
    kind,
    status
  INTO v_arena
  FROM arenas
  WHERE id = p_arena_id
  FOR UPDATE;

  -- Validate arena exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_not_found';
  END IF;

  -- Validate arena kind - must be 'ms' or 'legacy_ms'
  IF v_arena.kind NOT IN ('ms', 'legacy_ms') THEN
    RAISE EXCEPTION 'invalid_arena_kind';
  END IF;

  -- Validate project_id exists
  IF v_arena.project_id IS NULL THEN
    RAISE EXCEPTION 'invalid_project_id';
  END IF;

  -- Step 2: End any other active MS/legacy_ms arenas for this project
  UPDATE arenas
  SET 
    status = 'ended',
    ends_at = NOW(),
    updated_at = NOW()
  WHERE project_id = v_arena.project_id
    AND status = 'active'
    AND kind IN ('ms', 'legacy_ms')
    AND id <> p_arena_id;

  -- Step 3: Activate the target arena
  UPDATE arenas
  SET 
    status = 'active',
    updated_at = NOW()
  WHERE id = p_arena_id;

  -- Step 4: Build and return result
  v_result := jsonb_build_object(
    'ok', true,
    'projectId', v_arena.project_id,
    'activatedArenaId', p_arena_id
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with error message
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- =============================================================================
-- NOTES
-- =============================================================================

-- Function Summary:
-- 
-- arc_admin_activate_ms_arena(p_arena_id, p_admin_profile_id)
-- 
-- This function performs arena activation in a single transaction:
-- 1. Locks the arena row with FOR UPDATE to prevent race conditions
-- 2. Validates arena exists and kind is 'ms' or 'legacy_ms'
-- 3. Ends any other active MS/legacy_ms arenas for the same project
-- 4. Activates the target arena
-- 
-- Returns JSONB:
-- {
--   "ok": true,
--   "projectId": "...",
--   "activatedArenaId": "..."
-- }
-- 
-- Error Handling:
-- - arena_not_found: Arena ID doesn't exist
-- - invalid_arena_kind: Arena kind is not 'ms' or 'legacy_ms'
-- - invalid_project_id: Arena has no project_id
-- - Other errors: Re-raised with SQLERRM
-- 
-- Security:
-- - Uses SECURITY DEFINER to run with function owner privileges
-- - Should only be called from service role API routes
-- - All operations are atomic (single transaction)
-- 
-- Transaction Safety:
-- - FOR UPDATE lock prevents concurrent activations
-- - All updates happen in a single transaction (all-or-nothing)
-- - No partial state possible
