-- =============================================================================
-- FIX: Set twitter_username for projects that only have x_handle
-- Run this in Supabase SQL Editor
-- =============================================================================

-- See which projects are missing twitter_username
SELECT 
  slug, 
  name, 
  x_handle, 
  twitter_username,
  CASE WHEN twitter_username IS NULL THEN '❌ MISSING' ELSE '✅ SET' END as status
FROM projects
WHERE is_active = true
ORDER BY name;

-- =============================================================================
-- Fix: Copy x_handle to twitter_username where missing
-- =============================================================================

UPDATE projects
SET twitter_username = x_handle
WHERE twitter_username IS NULL
  AND x_handle IS NOT NULL;

-- =============================================================================
-- Verify the fix
-- =============================================================================

SELECT 
  slug, 
  name, 
  x_handle, 
  twitter_username,
  '✅ FIXED' as status
FROM projects
WHERE is_active = true
ORDER BY name;

