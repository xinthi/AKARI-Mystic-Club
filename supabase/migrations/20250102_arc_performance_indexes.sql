-- Migration: Add performance indexes for ARC queries
-- Purpose: Optimize frequent ARC queries on projects and metrics tables
-- Date: 2025-01-02

-- =============================================================================
-- INDEXES FOR ARC QUERIES
-- =============================================================================

-- Index for filtering projects by profile_type (used in top-projects, summary)
-- Note: Partial index already exists from 20241225, but ensure it's there
CREATE INDEX IF NOT EXISTS idx_projects_profile_type_project 
  ON projects(profile_type) 
  WHERE profile_type = 'project';

-- Index for ARC active + access level filtering (used in summary, top-projects)
-- Note: Partial index already exists from 20241222, but ensure it's there
CREATE INDEX IF NOT EXISTS idx_projects_arc_active 
  ON projects(arc_active, arc_access_level) 
  WHERE arc_active = true;

-- Composite index for common ARC queries: profile_type + arc_active + arc_access_level
-- This helps queries that filter by all three conditions
CREATE INDEX IF NOT EXISTS idx_projects_arc_composite 
  ON projects(profile_type, arc_active, arc_access_level) 
  WHERE profile_type = 'project' AND arc_active = true;

-- Index for metrics_daily queries by project_id and date (if not exists)
-- Used for calculating growth metrics in top-projects
CREATE INDEX IF NOT EXISTS idx_metrics_daily_project_date 
  ON metrics_daily(project_id, date DESC);

-- Index for arenas by project_id and status (used in projects API)
CREATE INDEX IF NOT EXISTS idx_arenas_project_status 
  ON arenas(project_id, status) 
  WHERE status = 'active';

-- Index for arena_creators by arena_id (used in projects API for stats)
CREATE INDEX IF NOT EXISTS idx_arena_creators_arena_id 
  ON arena_creators(arena_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON INDEX idx_projects_arc_composite IS 
  'Composite index for ARC queries filtering by profile_type, arc_active, and arc_access_level';

COMMENT ON INDEX idx_metrics_daily_project_date IS 
  'Index for fast lookups of daily metrics by project and date (used in growth calculations)';

