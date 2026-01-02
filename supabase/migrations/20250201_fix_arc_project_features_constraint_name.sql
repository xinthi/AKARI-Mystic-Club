-- =============================================================================
-- Migration: Ensure arc_project_features has explicit UNIQUE constraint name
-- Purpose: Fix ON CONFLICT error in approval RPC function
-- Date: 2025-02-01
-- 
-- This migration ensures arc_project_features has a named UNIQUE constraint
-- that can be referenced in ON CONFLICT ON CONSTRAINT clauses.
-- 
-- PostgreSQL auto-names UNIQUE constraints from column definitions as 
-- <table>_<column>_key, so it should already be named arc_project_features_project_id_key.
-- This migration ensures it exists with that exact name.
-- =============================================================================

-- Step 1: Find and drop any existing unique constraint on project_id
-- This handles both auto-named constraints and any explicitly named ones
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- Find the unique constraint on project_id column
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE t.relname = 'arc_project_features'
    AND c.contype = 'u'
    AND a.attname = 'project_id'
    AND array_length(c.conkey, 1) = 1
  LIMIT 1;

  -- Drop it if found (we'll recreate with explicit name)
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE arc_project_features DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped existing constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No existing unique constraint found on project_id';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If constraint doesn't exist or other error, continue
    RAISE NOTICE 'Error dropping constraint (may not exist): %', SQLERRM;
END $$;

-- Step 2: Add explicit named UNIQUE constraint on project_id
-- This ensures ON CONFLICT ON CONSTRAINT can reference it by name
-- Using IF NOT EXISTS pattern via DO block since ADD CONSTRAINT doesn't support IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'arc_project_features_project_id_key' 
    AND conrelid = 'arc_project_features'::regclass
  ) THEN
    ALTER TABLE arc_project_features 
      ADD CONSTRAINT arc_project_features_project_id_key 
      UNIQUE (project_id);
    RAISE NOTICE 'Created unique constraint: arc_project_features_project_id_key';
  ELSE
    RAISE NOTICE 'Constraint arc_project_features_project_id_key already exists';
  END IF;
END $$;
