-- =============================================================================
-- Migration: Add Unique Constraint on arc_project_access(project_id)
-- Purpose: Fix ON CONFLICT error in approval RPC function
-- Date: 2025-02-01
-- 
-- This migration adds a unique constraint on arc_project_access(project_id)
-- to support the upsert operation in arc_admin_approve_leaderboard_request.
-- 
-- Safe approach:
-- 1. First dedupe existing rows (keep newest updated_at, delete others)
-- 2. Then add the unique index
-- =============================================================================

-- Step 1: Dedupe existing rows (keep the one with newest updated_at per project_id)
-- Delete duplicates, keeping only the row with the most recent updated_at
DO $$
DECLARE
  v_duplicate_count INTEGER;
BEGIN
  -- Count duplicates first
  SELECT COUNT(*)
  INTO v_duplicate_count
  FROM (
    SELECT project_id, COUNT(*) as cnt
    FROM arc_project_access
    GROUP BY project_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF v_duplicate_count > 0 THEN
    RAISE NOTICE 'Found % projects with duplicate arc_project_access rows. Deduping...', v_duplicate_count;
    
    -- Delete duplicates, keeping only the row with the newest updated_at per project_id
    DELETE FROM arc_project_access
    WHERE id IN (
      SELECT id
      FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (
            PARTITION BY project_id 
            ORDER BY updated_at DESC, created_at DESC, id DESC
          ) as rn
        FROM arc_project_access
      ) ranked
      WHERE rn > 1
    );
    
    RAISE NOTICE 'Deduplication complete. Removed duplicate rows.';
  ELSE
    RAISE NOTICE 'No duplicates found. Proceeding to add unique constraint.';
  END IF;
END $$;

-- Step 2: Add unique index on project_id
-- This will ensure only one row per project_id (required for ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS arc_project_access_project_id_unique 
  ON arc_project_access(project_id);

-- Note: This replaces the need for the partial unique index on pending requests
-- The partial index (idx_arc_project_access_unique_pending) can remain for query optimization
-- but is not sufficient for the ON CONFLICT clause in the RPC function
