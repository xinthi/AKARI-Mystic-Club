-- Migration: Add project_audience_geo table
-- Purpose: Store aggregated follower geo distribution per project
-- Date: 2024-12-12

-- =============================================================================
-- CREATE TABLE: project_audience_geo
-- =============================================================================
-- Stores aggregated follower geo distribution per project,
-- based on sampled followers from twitterapi.io.

CREATE TABLE IF NOT EXISTS project_audience_geo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_slug TEXT NOT NULL,
  x_user_id TEXT,                                -- X user id of the project
  sample_size INT NOT NULL,                      -- Number of followers sampled
  country_code TEXT,                             -- ISO country code, e.g. 'DE', 'PH' (nullable if only free text)
  country_name TEXT NOT NULL,                    -- Normalized country name, e.g. 'Germany'
  region_label TEXT,                             -- Optional free-form region (e.g. 'Europe', 'SEA')
  follower_count INT NOT NULL,                   -- Number of followers mapped to this country
  follower_share DECIMAL(5, 2) NOT NULL,         -- Percentage (0-100)
  computed_at TIMESTAMPTZ NOT NULL,              -- When this aggregation was computed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one row per project + country code
  UNIQUE (project_id, country_code)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for querying by project
CREATE INDEX IF NOT EXISTS idx_project_audience_geo_project_id 
ON project_audience_geo(project_id);

-- Index for finding latest snapshots
CREATE INDEX IF NOT EXISTS idx_project_audience_geo_computed_at 
ON project_audience_geo(computed_at DESC);

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_project_audience_geo_project_slug 
ON project_audience_geo(project_slug);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_project_audience_geo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_audience_geo_updated_at ON project_audience_geo;
CREATE TRIGGER trigger_project_audience_geo_updated_at
  BEFORE UPDATE ON project_audience_geo
  FOR EACH ROW
  EXECUTE FUNCTION update_project_audience_geo_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE project_audience_geo ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for cron jobs and backend)
CREATE POLICY "Service role full access on project_audience_geo"
ON project_audience_geo
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read (for API endpoints)
CREATE POLICY "Authenticated users can read project_audience_geo"
ON project_audience_geo
FOR SELECT
TO authenticated
USING (true);

-- Anon users can also read (public data)
CREATE POLICY "Anon users can read project_audience_geo"
ON project_audience_geo
FOR SELECT
TO anon
USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE project_audience_geo IS 'Aggregated follower geo distribution per project from twitterapi.io samples';
COMMENT ON COLUMN project_audience_geo.project_id IS 'FK to projects table';
COMMENT ON COLUMN project_audience_geo.project_slug IS 'Project slug for quick lookups';
COMMENT ON COLUMN project_audience_geo.x_user_id IS 'X/Twitter user ID of the project';
COMMENT ON COLUMN project_audience_geo.sample_size IS 'Number of followers sampled for this computation';
COMMENT ON COLUMN project_audience_geo.country_code IS 'ISO 3166-1 alpha-2 country code (e.g. US, DE, PH)';
COMMENT ON COLUMN project_audience_geo.country_name IS 'Human-readable country name';
COMMENT ON COLUMN project_audience_geo.region_label IS 'Optional broader region (e.g. Europe, SEA, LATAM)';
COMMENT ON COLUMN project_audience_geo.follower_count IS 'Number of sampled followers from this country';
COMMENT ON COLUMN project_audience_geo.follower_share IS 'Percentage of total mapped followers (0-100)';
COMMENT ON COLUMN project_audience_geo.computed_at IS 'When this geo snapshot was computed';

