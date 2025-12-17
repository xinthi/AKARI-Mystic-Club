-- =============================================================================
-- Check ARC Top Projects Classification Status
-- Run this to diagnose why ARC Top Projects chart is empty
-- =============================================================================

-- 1. Count projects by profile_type
SELECT 
  profile_type,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count,
  COUNT(*) FILTER (WHERE is_active = true AND profile_type = 'project') as arc_eligible_count
FROM projects
GROUP BY profile_type
ORDER BY profile_type NULLS FIRST;

-- 2. List all projects with profile_type = 'project' (these should appear in ARC)
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  slug,
  profile_type,
  is_company,
  is_active,
  arc_active,
  arc_access_level,
  first_tracked_at,
  last_refreshed_at
FROM projects
WHERE profile_type = 'project' 
  AND is_active = true
ORDER BY name
LIMIT 50;

-- 3. List unclassified projects (profile_type IS NULL) - these WON'T appear in ARC
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  slug,
  profile_type,
  is_company,
  is_active,
  first_tracked_at
FROM projects
WHERE is_active = true 
  AND profile_type IS NULL
ORDER BY first_tracked_at DESC
LIMIT 20;

-- 4. List projects marked as 'personal' - these WON'T appear in ARC
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  slug,
  profile_type,
  is_company,
  is_active,
  first_tracked_at
FROM projects
WHERE is_active = true 
  AND profile_type = 'personal'
ORDER BY name
LIMIT 20;

-- 5. Check if projects have metrics (required for growth calculation)
SELECT 
  p.id,
  p.name,
  p.display_name,
  p.profile_type,
  p.is_active,
  COUNT(m.id) as metrics_count,
  MAX(m.date) as latest_metrics_date
FROM projects p
LEFT JOIN metrics_daily m ON m.project_id = p.id
WHERE p.profile_type = 'project' 
  AND p.is_active = true
GROUP BY p.id, p.name, p.display_name, p.profile_type, p.is_active
ORDER BY metrics_count DESC, p.name
LIMIT 30;

-- =============================================================================
-- FIX: Classify projects that should appear in ARC
-- =============================================================================

-- To classify a project as 'project' type (so it appears in ARC):
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE id = 'PROJECT_ID_HERE';

-- To classify multiple projects at once (be careful!):
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE x_handle IN ('project1', 'project2', 'project3')
--   AND is_active = true;

-- =============================================================================
-- NOTES
-- =============================================================================
-- 
-- The ARC Top Projects chart ONLY shows projects where:
--   1. is_active = true
--   2. profile_type = 'project'
--
-- Projects are NOT shown if:
--   - profile_type = 'personal' (personal profiles)
--   - profile_type IS NULL (unclassified - default state)
--   - is_active = false (hidden/inactive projects)
--
-- To make projects appear:
--   1. Go to /portal/admin/projects
--   2. Click "Classify" on a project
--   3. Set "Ecosystem Type" to "Project"
--   4. Optionally set "Is Company" checkbox
--   5. Save
--
-- After classification, projects will appear in:
--   - /portal/arc (Top Projects treemap)
--   - /portal/sentiment (if they have metrics)

