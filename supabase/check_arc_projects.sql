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
-- 3. LIST UNCLASSIFIED PROJECTS (profile_type IS NULL)
-- =============================================================================
-- These are newly tracked profiles that haven't been classified by SuperAdmin yet
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  profile_type,
  claimed_by,
  is_active,
  first_tracked_at
FROM projects
WHERE is_active = true 
  AND profile_type IS NULL
ORDER BY first_tracked_at DESC
LIMIT 20;

-- =============================================================================
-- 3b. LIST PROJECTS CLASSIFIED AS 'personal' (won't appear in ARC)
-- =============================================================================
SELECT 
  id,
  name,
  display_name,
  x_handle,
  twitter_username,
  profile_type,
  claimed_by,
  is_active,
  first_tracked_at
FROM projects
WHERE is_active = true 
  AND profile_type = 'personal'
ORDER BY first_tracked_at DESC
LIMIT 20;

-- =============================================================================
-- 4. CLASSIFY PROJECT AS 'project' (use with caution - prefer Admin UI)
-- =============================================================================
-- ⚠️ RECOMMENDED: Use the Admin UI at /portal/admin/projects instead
-- Only use this if you need to bulk update or the UI is unavailable
--
-- Classification Flow:
-- 1. Track: profile_type = NULL (unclassified)
-- 2. Claim: User claims profile and sets identity (individual/company) via /portal/me
-- 3. Classify: SuperAdmin sets profile_type ('personal' or 'project') via Admin UI
--
-- To classify a project, uncomment and modify:
-- UPDATE projects 
-- SET profile_type = 'project'  -- or 'personal' for individual profiles
-- WHERE x_handle = 'your-project-handle'  -- Replace with actual handle
--   AND profile_type IS NULL;  -- Only update unclassified profiles
--
-- Example for MuazXinthi (if it's a company/project):
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE x_handle = 'muazxinthi'
--   AND profile_type IS NULL;

