-- Migration: Set profile_type='project' for all active Sentiment-tracked projects
-- Purpose: Ensure all projects tracked via Sentiment appear in ARC Treemap (Option A)
-- Date: 2025-01-03
-- 
-- This migration implements Option A: Auto-set profile_type='project' for any project 
-- that is shown in Sentiment, so Treemap includes them all via profile_type='project' filter.
--
-- Rule: All projects in the projects table (when tracked via Sentiment) should have
-- profile_type='project' so they appear in the ARC Treemap universe.
--
-- Note: We exclude projects that are explicitly marked as 'personal' to avoid mixing
-- personal profiles into the Treemap. Only projects with profile_type IS NULL or 
-- already 'project' are updated.

-- =============================================================================
-- 1. SET profile_type='project' FOR ALL ACTIVE PROJECTS (except 'personal')
-- =============================================================================

-- Update all active projects where profile_type IS NULL to 'project'
-- This ensures all Sentiment-tracked projects appear in Treemap
UPDATE projects 
SET profile_type = 'project'
WHERE is_active = true
  AND profile_type IS NULL;

-- =============================================================================
-- 2. OPTIONAL: Update inactive projects too (if you want them in Treemap when reactivated)
-- =============================================================================

-- Uncomment if you want inactive projects to also be set to 'project'
-- UPDATE projects 
-- SET profile_type = 'project'
-- WHERE is_active = false
--   AND profile_type IS NULL;

-- =============================================================================
-- 3. VERIFICATION QUERIES (run separately to verify)
-- =============================================================================

-- Count total projects in Sentiment
-- SELECT COUNT(*) AS total_projects FROM projects;

-- Count projects included in Treemap (should match total if all are set to 'project')
-- SELECT COUNT(*) AS treemap_projects 
-- FROM projects 
-- WHERE profile_type = 'project' AND is_active = true;

-- Count projects that are NOT in Treemap (should only be 'personal' or inactive)
-- SELECT 
--   profile_type,
--   is_active,
--   COUNT(*) AS count
-- FROM projects
-- WHERE profile_type != 'project' OR is_active = false
-- GROUP BY profile_type, is_active
-- ORDER BY profile_type, is_active;

-- =============================================================================
-- NOTES
-- =============================================================================

-- Personal profiles: Projects explicitly marked as profile_type='personal' are 
-- NOT updated by this migration. If you have personal profiles that should NOT
-- appear in Treemap, they should remain as profile_type='personal'.

-- Future projects: New projects tracked via Sentiment currently default to 
-- profile_type=NULL (unclassified). The migration will handle setting them to 'project'
-- when they are active. Alternatively, you can update the track API to set 
-- profile_type='project' by default for new projects.

