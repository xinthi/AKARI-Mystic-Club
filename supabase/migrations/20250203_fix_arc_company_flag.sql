-- =============================================================================
-- Migration: Fix is_arc_company flag for approved projects
-- Purpose: Ensure all projects with approved ARC access have is_arc_company = true
-- Date: 2025-02-03
-- =============================================================================

-- Fix 1: Set is_arc_company = true for all projects with approved ARC access
-- This ensures they appear in /api/portal/arc/projects
UPDATE projects
SET is_arc_company = true
WHERE id IN (
  SELECT DISTINCT project_id
  FROM arc_project_access
  WHERE application_status = 'approved'
)
AND (is_arc_company IS NULL OR is_arc_company = false);

-- Fix 2: Ensure leaderboard_enabled is set for projects with approved MS requests
-- This ensures they appear correctly in reports and have proper feature flags
INSERT INTO arc_project_features (
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  option2_normal_unlocked
)
SELECT DISTINCT
  lr.project_id,
  true,
  lr.start_at,
  lr.end_at,
  true
FROM arc_leaderboard_requests lr
INNER JOIN arc_project_access apa ON lr.project_id = apa.project_id
WHERE lr.status = 'approved'
  AND lr.product_type = 'ms'
  AND apa.application_status = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM arc_project_features apf
    WHERE apf.project_id = lr.project_id
  )
ON CONFLICT (project_id)
DO UPDATE SET
  leaderboard_enabled = COALESCE(arc_project_features.leaderboard_enabled, true),
  leaderboard_start_at = COALESCE(arc_project_features.leaderboard_start_at, EXCLUDED.leaderboard_start_at),
  leaderboard_end_at = COALESCE(arc_project_features.leaderboard_end_at, EXCLUDED.leaderboard_end_at),
  option2_normal_unlocked = COALESCE(arc_project_features.option2_normal_unlocked, true),
  updated_at = NOW();

-- Fix 3: Update existing arc_project_features rows to ensure leaderboard_enabled is true
-- for projects with approved MS requests (in case the flag was not set)
UPDATE arc_project_features
SET
  leaderboard_enabled = true,
  option2_normal_unlocked = true,
  updated_at = NOW()
WHERE project_id IN (
  SELECT DISTINCT lr.project_id
  FROM arc_leaderboard_requests lr
  INNER JOIN arc_project_access apa ON lr.project_id = apa.project_id
  WHERE lr.status = 'approved'
    AND lr.product_type = 'ms'
    AND apa.application_status = 'approved'
)
AND (leaderboard_enabled IS NULL OR leaderboard_enabled = false);
