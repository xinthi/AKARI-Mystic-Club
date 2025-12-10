-- =============================================================================
-- Migration: Add updated_at column to metrics_daily for data freshness tracking
-- =============================================================================
-- This allows us to track when each metrics row was last updated by the sentiment engine
-- =============================================================================

-- Add updated_at column if it doesn't exist
ALTER TABLE metrics_daily
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster queries on updated_at
CREATE INDEX IF NOT EXISTS idx_metrics_daily_updated_at ON metrics_daily(updated_at DESC);

-- Update existing rows to set updated_at = created_at if updated_at is null
UPDATE metrics_daily
SET updated_at = created_at
WHERE updated_at IS NULL;

