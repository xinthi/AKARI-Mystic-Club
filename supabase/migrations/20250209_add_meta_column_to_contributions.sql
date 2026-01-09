-- =============================================================================
-- Migration: Add meta column to arc_contributions
-- Purpose: Add meta JSONB column to store additional metadata like points, seed_key, source
-- Date: 2025-02-09
-- =============================================================================

-- Add meta column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arc_contributions' AND column_name = 'meta'
  ) THEN
    ALTER TABLE arc_contributions 
    ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    
    RAISE NOTICE 'Added meta column to arc_contributions';
  ELSE
    RAISE NOTICE 'meta column already exists in arc_contributions';
  END IF;
END $$;

-- Create index on meta for efficient queries (optional)
CREATE INDEX IF NOT EXISTS idx_arc_contributions_meta_points 
  ON arc_contributions((meta->>'points'))
  WHERE meta->>'points' IS NOT NULL;
