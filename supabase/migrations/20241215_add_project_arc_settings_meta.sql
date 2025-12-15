-- Migration: Add meta column to project_arc_settings
-- Purpose: Store custom header settings (banner_url, accent_color, tagline)
-- Date: 2024-12-15

-- Add meta JSONB column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'project_arc_settings' 
    AND column_name = 'meta'
  ) THEN
    ALTER TABLE project_arc_settings 
    ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
