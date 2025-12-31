-- Migration: Add short code to creator_manager_links
-- Purpose: Enable shorter URLs for UTM tracking links
-- Date: 2025-01-05

-- Add code column to creator_manager_links
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_manager_links' AND column_name = 'code') THEN
    ALTER TABLE creator_manager_links ADD COLUMN code TEXT UNIQUE;
  END IF;
END $$;

-- Create index for code lookups
CREATE INDEX IF NOT EXISTS idx_creator_manager_links_code ON creator_manager_links(code) WHERE code IS NOT NULL;

-- Generate codes for existing links (optional, for backward compatibility)
-- This will be handled by the application when links are accessed

