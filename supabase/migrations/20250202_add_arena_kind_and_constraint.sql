-- =============================================================================
-- Migration: Add kind column to arenas and unique constraint
-- Purpose: Support MS/legacy MS arena types and enforce one per project
-- Date: 2025-02-02
-- 
-- Safe to re-run: Uses IF NOT EXISTS checks
-- =============================================================================

-- Step 1: Add kind column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'arenas' 
      AND column_name = 'kind'
  ) THEN
    ALTER TABLE arenas 
    ADD COLUMN kind TEXT;
    
    -- Set default for existing rows (can be NULL for legacy arenas)
    -- We'll update them to 'legacy_ms' if they're MS arenas
    UPDATE arenas 
    SET kind = 'legacy_ms' 
    WHERE kind IS NULL 
      AND project_id IN (
        SELECT DISTINCT project_id 
        FROM arc_project_features 
        WHERE leaderboard_enabled = true
      );
  END IF;
END $$;

-- Step 2: Add check constraint for kind values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'arenas_kind_check'
  ) THEN
    ALTER TABLE arenas 
    ADD CONSTRAINT arenas_kind_check 
    CHECK (kind IS NULL OR kind IN ('ms', 'legacy_ms', 'gamefi', 'crm'));
  END IF;
END $$;

-- Step 3: Create unique constraint for MS arenas (one per project)
-- This is a partial unique index that only applies to MS/legacy_ms arenas
-- Also includes NULL kind (legacy arenas created before kind column existed)
DO $$
BEGIN
  -- Drop existing constraint if it exists (to recreate with NULL handling)
  DROP INDEX IF EXISTS uniq_ms_arena_per_project;
  
  -- First, remove any duplicate MS arenas (keep the most recent one)
  -- This includes NULL kind arenas (legacy)
  DELETE FROM arenas a
  USING arenas b
  WHERE a.id < b.id
    AND a.project_id = b.project_id
    AND (a.kind IN ('ms', 'legacy_ms') OR a.kind IS NULL)
    AND (b.kind IN ('ms', 'legacy_ms') OR b.kind IS NULL);
  
  -- Set NULL kind to 'legacy_ms' for existing arenas (if not already set)
  UPDATE arenas
  SET kind = 'legacy_ms'
  WHERE kind IS NULL
    AND project_id IN (
      SELECT DISTINCT project_id 
      FROM arc_project_features 
      WHERE leaderboard_enabled = true
    );
  
  -- Create the unique constraint (includes NULL as legacy_ms)
  -- This ensures only one MS/legacy_ms arena per project
  CREATE UNIQUE INDEX uniq_ms_arena_per_project 
  ON arenas(project_id) 
  WHERE kind IN ('ms', 'legacy_ms') OR kind IS NULL;
END $$;

-- Step 4: Add comment
COMMENT ON COLUMN arenas.kind IS 
  'Arena type: ms (Mindshare), legacy_ms (legacy Mindshare), gamefi (GameFi), crm (Creator Manager), or NULL (legacy/other)';
