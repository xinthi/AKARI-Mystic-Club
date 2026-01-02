-- =============================================================================
-- Production DB Verification Queries
-- Run these in Supabase SQL Editor to verify constraint and RPC state
-- =============================================================================

-- Step 1: Check if constraint exists
SELECT 
  'Constraint Check' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'arc_project_features_project_id_key' 
      AND conrelid = 'arc_project_features'::regclass
    ) THEN '✓ EXISTS'
    ELSE '✗ MISSING - Run migration 20250201_safe_ensure_arc_project_features_constraint.sql'
  END AS status,
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';

-- Step 2: Verify RPC uses correct constraint syntax for all product types
SELECT 
  'RPC Constraint Check' AS check_type,
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) = 3
    THEN '✓ CORRECT (all 3 product types use named constraint)'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%'
    THEN '⚠ PARTIAL (some product types may not use named constraint)'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT (project_id)%'
    THEN '✗ WRONG (uses column list - will fail)'
    ELSE '? UNKNOWN'
  END AS constraint_usage_status,
  (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) AS constraint_references_count
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';

-- Step 3: Verify RPC updates updated_at for all product types
SELECT 
  'RPC updated_at Check' AS check_type,
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%updated_at = NOW()%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'updated_at = NOW\(\)', 'g')) >= 3
    THEN '✓ CORRECT (all product types update updated_at)'
    WHEN pg_get_functiondef(oid) LIKE '%updated_at = NOW()%'
    THEN '⚠ PARTIAL (some product types may not update updated_at)'
    ELSE '✗ MISSING (updated_at not updated)'
  END AS updated_at_status,
  (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'updated_at = NOW\(\)', 'g')) AS updated_at_references_count
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';

-- Step 4: Show full constraint details if it exists
SELECT 
  'Constraint Details' AS check_type,
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition,
  conrelid::regclass AS table_name
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';

-- Step 5: Show RPC function signature (quick check)
SELECT 
  'RPC Function Exists' AS check_type,
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments,
  CASE WHEN prosrc IS NOT NULL THEN '✓ EXISTS' ELSE '✗ MISSING' END AS status
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
