-- Migration: Add notes field to creator_manager_mission_progress
-- Purpose: Allow creators to add notes when submitting missions
-- Date: 2024-12-23

-- =============================================================================
-- EXTEND creator_manager_mission_progress TABLE
-- =============================================================================

DO $$ 
BEGIN
  -- Add notes field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_manager_mission_progress' AND column_name = 'notes') THEN
    ALTER TABLE creator_manager_mission_progress ADD COLUMN notes TEXT;
  END IF;
END $$;

