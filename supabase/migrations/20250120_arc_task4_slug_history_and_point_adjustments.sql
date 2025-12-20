-- Migration: ARC Task 4 - Slug History and Point Adjustments
-- Purpose: Add slug history tracking, enforce slug uniqueness for projects, and add point adjustments table
-- Date: 2025-01-20

-- =============================================================================
-- PART A1: SLUG HISTORY
-- =============================================================================

-- =============================================================================
-- CREATE TABLE: project_slug_history
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_slug_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on slug to prevent reuse/squatting across all time
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_slug_history_slug_unique 
ON project_slug_history(slug);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_project_slug_history_project_id 
ON project_slug_history(project_id);

CREATE INDEX IF NOT EXISTS idx_project_slug_history_slug 
ON project_slug_history(slug);

-- Seed existing PROJECT slugs into history
INSERT INTO project_slug_history (project_id, slug)
SELECT id, slug
FROM projects
WHERE slug IS NOT NULL
  AND profile_type = 'project'
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- TRIGGER: Record slug changes in history
-- =============================================================================

CREATE OR REPLACE FUNCTION record_project_slug_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track slug history for PROJECT profiles
  IF NEW.profile_type = 'project'
     AND OLD.slug IS NOT NULL
     AND NEW.slug IS NOT NULL
     AND OLD.slug != NEW.slug THEN
    INSERT INTO project_slug_history (project_id, slug)
    VALUES (OLD.id, OLD.slug)
    ON CONFLICT (slug) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_record_project_slug_change ON projects;
CREATE TRIGGER trigger_record_project_slug_change
  BEFORE UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION record_project_slug_change();

-- =============================================================================
-- HELPER FUNCTION: Resolve project_id by slug
-- =============================================================================

CREATE OR REPLACE FUNCTION resolve_project_id_by_slug(input_slug TEXT)
RETURNS UUID AS $$
DECLARE
  resolved_id UUID;
BEGIN
  -- First check current projects.slug
  SELECT id INTO resolved_id
  FROM projects
  WHERE slug = input_slug
  LIMIT 1;
  
  -- If found, return it
  IF resolved_id IS NOT NULL THEN
    RETURN resolved_id;
  END IF;
  
  -- Else check history
  SELECT project_id INTO resolved_id
  FROM project_slug_history
  WHERE slug = input_slug
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN resolved_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PART A2: POINT ADJUSTMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS arc_point_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id UUID NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points_delta NUMERIC(18,4) NOT NULL,
  reason TEXT NOT NULL,
  created_by_profile_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_arc_point_adjustments_arena_created 
ON arc_point_adjustments(arena_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arc_point_adjustments_creator_created 
ON arc_point_adjustments(creator_profile_id, created_at DESC);

-- =============================================================================
-- RLS POLICIES FOR arc_point_adjustments
-- =============================================================================

ALTER TABLE arc_point_adjustments ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access on arc_point_adjustments" ON arc_point_adjustments;
CREATE POLICY "Service role full access on arc_point_adjustments"
ON arc_point_adjustments
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- SuperAdmins can SELECT/INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "SuperAdmins full access on arc_point_adjustments" ON arc_point_adjustments;
CREATE POLICY "SuperAdmins full access on arc_point_adjustments"
ON arc_point_adjustments
FOR ALL
TO authenticated
USING (is_user_super_admin(get_current_user_profile_id()))
WITH CHECK (is_user_super_admin(get_current_user_profile_id()));

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE project_slug_history IS 'Tracks historical slugs for projects to enable redirects from old slugs to current ones';
COMMENT ON TABLE arc_point_adjustments IS 'Audit trail for manual point adjustments (slashing/bonuses) by SuperAdmins. Never directly modify arena_creators.arc_points without logging here.';
COMMENT ON FUNCTION resolve_project_id_by_slug IS 'Resolves a slug (current or historical) to a project_id. Checks projects.slug first, then project_slug_history.';
