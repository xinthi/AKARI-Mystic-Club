-- Migration: Add ARC access level fields to projects
-- Purpose: Control ARC Universe visibility and clickability
-- Date: 2024-12-22

-- =============================================================================
-- ADD ARC ACCESS LEVEL FIELDS
-- =============================================================================

DO $$ 
BEGIN
  -- Add arc_access_level
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'arc_access_level') THEN
    ALTER TABLE projects ADD COLUMN arc_access_level TEXT NOT NULL DEFAULT 'none' 
      CHECK (arc_access_level IN ('none', 'creator_manager', 'leaderboard', 'gamified'));
  END IF;

  -- Add arc_active
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'arc_active') THEN
    ALTER TABLE projects ADD COLUMN arc_active BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add arc_active_until
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'arc_active_until') THEN
    ALTER TABLE projects ADD COLUMN arc_active_until TIMESTAMPTZ;
  END IF;
END $$;

-- Add index for filtering active ARC projects
CREATE INDEX IF NOT EXISTS idx_projects_arc_active ON projects(arc_active, arc_access_level) WHERE arc_active = true;

