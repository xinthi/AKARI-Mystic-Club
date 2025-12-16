-- Migration: Change profile_type default to 'personal'
-- Purpose: Ensure new projects default to 'personal' instead of 'project'
-- Date: 2024-12-24
-- 
-- This enforces that only SuperAdmin can classify a profile as 'project'
-- Users tracking profiles will default to 'personal' until SuperAdmin approval

-- Change the default value for profile_type
ALTER TABLE projects 
  ALTER COLUMN profile_type SET DEFAULT 'personal';

-- Update the check constraint comment (if needed, the constraint itself is fine)
-- The constraint already allows both 'project' and 'personal', we're just changing the default

