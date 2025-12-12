-- Migration: Add project_refresh_state table
-- Purpose: Smart Refresh System - tracks project interest and refresh scheduling
-- Date: 2024-12-12

-- =============================================================================
-- CREATE TABLE: project_refresh_state
-- =============================================================================
-- Tracks user interest and refresh scheduling for each project.
-- Used by the smart refresh cron to determine which projects need refreshing.

CREATE TABLE IF NOT EXISTS project_refresh_state (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  
  -- User interaction timestamps
  last_manual_view_at TIMESTAMPTZ,  -- When a user opened /portal/sentiment/[slug]
  last_searched_at TIMESTAMPTZ,     -- When a user searched for this project
  last_cron_refreshed_at TIMESTAMPTZ, -- When the cron last refreshed this project
  
  -- Computed metrics
  inactivity_days INT DEFAULT 0,    -- Days since any user interaction
  interest_score INT DEFAULT 0,     -- Computed interest score (views=+2, search=+1, inactivity=-1/5days)
  
  -- Refresh scheduling
  refresh_frequency TEXT DEFAULT 'daily' CHECK (refresh_frequency IN ('daily', '3_days', 'weekly')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Index for finding projects due for refresh
CREATE INDEX IF NOT EXISTS idx_project_refresh_state_frequency 
ON project_refresh_state(refresh_frequency);

-- Index for sorting by interest
CREATE INDEX IF NOT EXISTS idx_project_refresh_state_interest 
ON project_refresh_state(interest_score DESC);

-- Index for finding stale projects
CREATE INDEX IF NOT EXISTS idx_project_refresh_state_last_cron 
ON project_refresh_state(last_cron_refreshed_at);

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_project_refresh_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_refresh_state_updated_at ON project_refresh_state;
CREATE TRIGGER trigger_project_refresh_state_updated_at
  BEFORE UPDATE ON project_refresh_state
  FOR EACH ROW
  EXECUTE FUNCTION update_project_refresh_state_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE project_refresh_state ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for cron jobs and backend)
CREATE POLICY "Service role full access on project_refresh_state"
ON project_refresh_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Anon/authenticated users can read (for debugging, optional)
CREATE POLICY "Authenticated users can read project_refresh_state"
ON project_refresh_state
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE project_refresh_state IS 'Tracks project interest and smart refresh scheduling';
COMMENT ON COLUMN project_refresh_state.last_manual_view_at IS 'Timestamp when a user last viewed the project detail page';
COMMENT ON COLUMN project_refresh_state.last_searched_at IS 'Timestamp when a user last searched for this project';
COMMENT ON COLUMN project_refresh_state.last_cron_refreshed_at IS 'Timestamp when the smart cron last refreshed this project';
COMMENT ON COLUMN project_refresh_state.inactivity_days IS 'Number of days since any user interaction';
COMMENT ON COLUMN project_refresh_state.interest_score IS 'Computed score: views(+2) + searches(+1) - inactivity(-1 per 5 days)';
COMMENT ON COLUMN project_refresh_state.refresh_frequency IS 'Scheduled refresh frequency: daily (score>=5), 3_days (1-4), weekly (<1)';

