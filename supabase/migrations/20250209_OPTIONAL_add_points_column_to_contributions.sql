-- =============================================================================
-- Migration: OPTIONAL - Add points column to arc_contributions
-- Purpose: Store calculated points directly in column instead of meta JSONB
-- Date: 2025-02-09
-- Status: OPTIONAL - Only run if you want to store points in a dedicated column
-- =============================================================================

-- Add points column if it doesn't exist
DO $$ 
DECLARE
  v_has_meta_column BOOLEAN;
  v_has_points_column BOOLEAN;
BEGIN
  -- Check if meta column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arc_contributions' AND column_name = 'meta'
  ) INTO v_has_meta_column;
  
  -- Check if points column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'arc_contributions' AND column_name = 'points'
  ) INTO v_has_points_column;
  
  IF NOT v_has_points_column THEN
    -- Add points column
    ALTER TABLE arc_contributions 
    ADD COLUMN points NUMERIC(18,4) DEFAULT 0;
    
    -- Backfill points from meta->>'points' if meta column exists
    IF v_has_meta_column THEN
      UPDATE arc_contributions
      SET points = COALESCE((meta->>'points')::NUMERIC, 0)
      WHERE meta->>'points' IS NOT NULL;
      
      RAISE NOTICE 'Added points column and backfilled from meta JSONB';
    ELSE
      RAISE NOTICE 'Added points column (meta column does not exist, skipping backfill)';
    END IF;
    
    -- Create index for efficient point queries
    CREATE INDEX IF NOT EXISTS idx_arc_contributions_points 
      ON arc_contributions(arena_id, points DESC);
  ELSE
    RAISE NOTICE 'points column already exists in arc_contributions';
  END IF;
END $$;

-- If you add this column, update the ingest_sentiment_to_arc function to:
-- 1. Store points in the column: points = v_points
-- 2. Update the recompute query to use: SUM(points) instead of SUM((meta->>'points')::NUMERIC)
