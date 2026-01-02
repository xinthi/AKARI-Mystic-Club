-- =============================================================================
-- Migration: Add UTM Tracking Fields for ARC CRM Campaigns
-- Purpose: Add missing fields for visitor tracking and geo-location
-- Date: 2025-02-01
-- =============================================================================

-- Add short_code column to arc_participant_links (alias for code, for compatibility)
-- Note: code already exists and is unique, so we'll use it as short_code
ALTER TABLE IF EXISTS arc_participant_links
  ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Add label column to arc_participant_links for multiple links per participant
ALTER TABLE IF EXISTS arc_participant_links
  ADD COLUMN IF NOT EXISTS label TEXT;

-- Populate short_code from code if not already set
UPDATE arc_participant_links
SET short_code = code
WHERE short_code IS NULL;

-- Create unique index on short_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_participant_links_short_code 
  ON arc_participant_links(short_code) 
  WHERE short_code IS NOT NULL;

-- Add missing fields to arc_link_events for enhanced tracking
ALTER TABLE IF EXISTS arc_link_events
  ADD COLUMN IF NOT EXISTS utm_link_id UUID REFERENCES arc_participant_links(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT,
  ADD COLUMN IF NOT EXISTS geo_country TEXT,
  ADD COLUMN IF NOT EXISTS geo_city TEXT;

-- Populate clicked_at from ts if not already set
UPDATE arc_link_events
SET clicked_at = ts
WHERE clicked_at IS NULL;

-- Create index on visitor_id for unique click tracking
CREATE INDEX IF NOT EXISTS idx_arc_link_events_visitor_id 
  ON arc_link_events(visitor_id) 
  WHERE visitor_id IS NOT NULL;

-- Create index on utm_link_id
CREATE INDEX IF NOT EXISTS idx_arc_link_events_utm_link_id 
  ON arc_link_events(utm_link_id) 
  WHERE utm_link_id IS NOT NULL;

-- Create index on clicked_at
CREATE INDEX IF NOT EXISTS idx_arc_link_events_clicked_at 
  ON arc_link_events(clicked_at DESC);
