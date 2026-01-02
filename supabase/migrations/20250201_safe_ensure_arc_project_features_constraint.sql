-- =============================================================================
-- Migration: Safe Ensure arc_project_features UNIQUE Constraint Name
-- Purpose: Fix ON CONFLICT error in approval RPC function (SAFE VERSION)
-- Date: 2025-02-01
-- 
-- This migration ensures arc_project_features has a named UNIQUE constraint
-- that can be referenced in ON CONFLICT ON CONSTRAINT clauses.
-- 
-- SAFE APPROACH:
-- 1. If arc_project_features_project_id_key exists → do nothing
-- 2. Else, find any single-column UNIQUE constraint on project_id and rename it
-- 3. Else, create arc_project_features_project_id_key UNIQUE(project_id)
-- 
-- This does NOT drop existing constraints - only renames or creates.
-- =============================================================================

DO $$
DECLARE
  v_existing_constraint_name TEXT;
  v_target_constraint_name TEXT := 'arc_project_features_project_id_key';
BEGIN
  -- Step 1: Check if target constraint already exists
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = v_target_constraint_name 
    AND conrelid = 'arc_project_features'::regclass
  ) THEN
    RAISE NOTICE 'Constraint % already exists - no action needed', v_target_constraint_name;
    RETURN;
  END IF;

  -- Step 2: Find any existing single-column UNIQUE constraint on project_id
  SELECT c.conname INTO v_existing_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
  WHERE t.relname = 'arc_project_features'
    AND c.contype = 'u'
    AND a.attname = 'project_id'
    AND array_length(c.conkey, 1) = 1
  LIMIT 1;

  -- Step 3a: If found, rename it to the target name
  IF v_existing_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE arc_project_features RENAME CONSTRAINT %I TO %I', 
                   v_existing_constraint_name, 
                   v_target_constraint_name);
    RAISE NOTICE 'Renamed constraint % to %', v_existing_constraint_name, v_target_constraint_name;
    RETURN;
  END IF;

  -- Step 3b: No existing constraint found - create new one
  ALTER TABLE arc_project_features 
    ADD CONSTRAINT arc_project_features_project_id_key 
    UNIQUE (project_id);
  
  RAISE NOTICE 'Created new constraint %', v_target_constraint_name;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise the exception with context
    RAISE EXCEPTION 'Error ensuring constraint %: %', v_target_constraint_name, SQLERRM;
END $$;
