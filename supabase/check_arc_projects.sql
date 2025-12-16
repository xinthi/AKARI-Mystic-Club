-- Diagnostic Query: Check ARC Project Classification Status
-- Run this in Supabase SQL Editor to see which projects are classified for ARC
-- 
-- ⚠️ LOCAL USE ONLY - Do not commit sensitive queries or data modifications
-- This file is for diagnostic purposes only

-- =============================================================================
-- 1. COUNT PROJECTS BY profile_type
-- =============================================================================
SELECT 
  profile_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE is_active = true) as active_count
FROM projects
GROUP BY profile_type
ORDER BY profile_type;

-- =============================================================================
-- 2. LIST ALL PROJECTS WITH profile_type = 'project' (should appear in ARC)
-- =============================================================================
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  profile_type,
  is_active,
  arc_active,
  arc_access_level,
  claimed_by,
  first_tracked_at
FROM projects
WHERE profile_type = 'project'
ORDER BY first_tracked_at DESC;

-- =============================================================================
-- 3. LIST PROJECTS THAT ARE ACTIVE BUT NOT CLASSIFIED AS 'project'
-- =============================================================================
-- These won't appear in ARC heatmap until SuperAdmin classifies them
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  profile_type,
  is_active,
  first_tracked_at
FROM projects
WHERE is_active = true 
  AND profile_type != 'project'
ORDER BY first_tracked_at DESC
LIMIT 20;

-- =============================================================================
-- 4. CLASSIFY PROJECT AS 'project' (use with caution - prefer Admin UI)
-- =============================================================================
-- ⚠️ RECOMMENDED: Use the Admin UI at /portal/admin/projects instead
-- Only use this if you need to bulk update or the UI is unavailable
--
-- To classify a project, uncomment and modify:
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE x_handle = 'your-project-handle'  -- Replace with actual handle
--   AND profile_type != 'project';
--
-- Example for MuazXinthi:
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE x_handle = 'muazxinthi'
--   AND profile_type != 'project';

