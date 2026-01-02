-- =============================================================================
-- E2E Approval Test - Complete Verification
-- Run this AFTER approving a test request via API
-- Replace <request_id> and <project_id> with actual values
-- =============================================================================

-- Variables (replace these with actual values from your test)
-- SET @request_id = '<your_request_id>';
-- SET @project_id = '<your_project_id>';

-- =============================================================================
-- Step 1: Verify Request Status
-- =============================================================================
SELECT 
  '1. Request Status' AS verification_step,
  id,
  status,
  decided_at,
  decided_by,
  product_type,
  created_at,
  CASE 
    WHEN status = 'approved' AND decided_at IS NOT NULL THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS status_check
FROM arc_leaderboard_requests
WHERE id = '<request_id>';  -- Replace with actual request_id

-- =============================================================================
-- Step 2: Verify Project Access
-- =============================================================================
SELECT 
  '2. Project Access' AS verification_step,
  id,
  project_id,
  application_status,
  approved_at,
  approved_by_profile_id,
  updated_at,
  CASE 
    WHEN application_status = 'approved' 
      AND approved_at IS NOT NULL 
      AND approved_by_profile_id IS NOT NULL 
    THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS access_check
FROM arc_project_access
WHERE project_id = '<project_id>'  -- Replace with actual project_id
ORDER BY updated_at DESC
LIMIT 1;

-- =============================================================================
-- Step 3: Verify Project Features (based on product_type)
-- =============================================================================
SELECT 
  '3. Project Features' AS verification_step,
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  gamefi_enabled,
  gamefi_start_at,
  gamefi_end_at,
  crm_enabled,
  crm_start_at,
  crm_end_at,
  option1_crm_unlocked,
  option2_normal_unlocked,
  option3_gamified_unlocked,
  updated_at,
  CASE 
    WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN '✓ updated_at refreshed'
    ELSE '⚠ updated_at may not be recent'
  END AS updated_at_check
FROM arc_project_features
WHERE project_id = '<project_id>';  -- Replace with actual project_id

-- =============================================================================
-- Step 4: Verify Arena Created (for ms/gamefi only)
-- =============================================================================
SELECT 
  '4. Arena Created' AS verification_step,
  id,
  project_id,
  kind,
  status,
  name,
  slug,
  starts_at,
  ends_at,
  created_at,
  CASE 
    WHEN id IS NOT NULL AND status = 'active' THEN '✓ PASS'
    ELSE '✗ FAIL or N/A (not ms/gamefi)'
  END AS arena_check
FROM arenas
WHERE project_id = '<project_id>'  -- Replace with actual project_id
  AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC
LIMIT 1;

-- =============================================================================
-- Step 5: Verify Audit Log
-- =============================================================================
SELECT 
  '5. Audit Log' AS verification_step,
  id,
  actor_profile_id,
  project_id,
  entity_type,
  entity_id,
  action,
  success,
  message,
  metadata,
  created_at,
  CASE 
    WHEN action = 'request_approved' 
      AND success = true 
      AND project_id = '<project_id>'  -- Replace with actual project_id
    THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS audit_check
FROM arc_audit_log
WHERE project_id = '<project_id>'  -- Replace with actual project_id
  AND action = 'request_approved'
ORDER BY created_at DESC
LIMIT 1;

-- =============================================================================
-- Step 6: Comprehensive Check (Single Query)
-- =============================================================================
WITH request_check AS (
  SELECT 
    status AS req_status,
    decided_at,
    product_type
  FROM arc_leaderboard_requests
  WHERE id = '<request_id>'  -- Replace with actual request_id
),
access_check AS (
  SELECT 
    application_status AS acc_status,
    approved_at
  FROM arc_project_access
  WHERE project_id = '<project_id>'  -- Replace with actual project_id
  ORDER BY updated_at DESC
  LIMIT 1
),
features_check AS (
  SELECT 
    leaderboard_enabled,
    gamefi_enabled,
    crm_enabled,
    updated_at AS feat_updated_at
  FROM arc_project_features
  WHERE project_id = '<project_id>'  -- Replace with actual project_id
),
arena_check AS (
  SELECT 
    id AS arena_id,
    status AS arena_status
  FROM arenas
  WHERE project_id = '<project_id>'  -- Replace with actual project_id
    AND kind IN ('ms', 'legacy_ms')
  ORDER BY created_at DESC
  LIMIT 1
),
audit_check AS (
  SELECT 
    success AS audit_success
  FROM arc_audit_log
  WHERE project_id = '<project_id>'  -- Replace with actual project_id
    AND action = 'request_approved'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '6. Comprehensive Check' AS verification_step,
  -- Request
  (SELECT req_status FROM request_check) AS request_status,
  (SELECT decided_at FROM request_check) AS request_decided_at,
  -- Access
  (SELECT acc_status FROM access_check) AS access_status,
  (SELECT approved_at FROM access_check) AS access_approved_at,
  -- Features
  (SELECT leaderboard_enabled FROM features_check) AS features_leaderboard,
  (SELECT gamefi_enabled FROM features_check) AS features_gamefi,
  (SELECT crm_enabled FROM features_check) AS features_crm,
  (SELECT feat_updated_at FROM features_check) AS features_updated_at,
  -- Arena
  (SELECT arena_id FROM arena_check) AS arena_id,
  (SELECT arena_status FROM arena_check) AS arena_status,
  -- Audit
  (SELECT audit_success FROM audit_check) AS audit_success,
  -- Overall status
  CASE 
    WHEN (SELECT req_status FROM request_check) = 'approved'
      AND (SELECT acc_status FROM access_check) = 'approved'
      AND (SELECT feat_updated_at FROM features_check) > NOW() - INTERVAL '5 minutes'
      AND (SELECT audit_success FROM audit_check) = true
    THEN '✓ ALL CHECKS PASS'
    ELSE '✗ SOME CHECKS FAILED'
  END AS overall_status;
