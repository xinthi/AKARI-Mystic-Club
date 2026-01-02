-- =============================================================================
-- Migration: Add is_arc_company field to projects table
-- Purpose: Only company/project profiles can have ARC leaderboards
-- Date: 2025-02-02
-- =============================================================================

-- Add is_arc_company column to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_arc_company BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_projects_is_arc_company 
  ON projects(is_arc_company) 
  WHERE is_arc_company = true;

-- Add comment
COMMENT ON COLUMN projects.is_arc_company IS 
  'Whether this project is eligible for ARC leaderboards. Only projects with is_arc_company=true can submit leaderboard requests, be approved, and have arenas.';
