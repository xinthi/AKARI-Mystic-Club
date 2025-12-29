-- =============================================================================
-- Migration: Add Project Mindshare Snapshots Table
-- Purpose: Store daily mindshare snapshots per window
-- Date: 2025-01-29
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- PROJECT_MINDSHARE_SNAPSHOTS TABLE
-- Daily snapshots of mindshare (BPS normalized) per window
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_mindshare_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  time_window TEXT NOT NULL CHECK (time_window IN ('24h', '48h', '7d', '30d')),
  mindshare_bps INT NOT NULL CHECK (mindshare_bps >= 0 AND mindshare_bps <= 10000),
  attention_value NUMERIC(12, 4) NOT NULL, -- Raw attention value before normalization
  as_of_date DATE NOT NULL,
  
  UNIQUE (project_id, time_window, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_project_mindshare_snapshots_project ON project_mindshare_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_project_mindshare_snapshots_time_window ON project_mindshare_snapshots(time_window);
CREATE INDEX IF NOT EXISTS idx_project_mindshare_snapshots_as_of_date ON project_mindshare_snapshots(as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_project_mindshare_snapshots_project_time_window_date ON project_mindshare_snapshots(project_id, time_window, as_of_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE project_mindshare_snapshots ENABLE ROW LEVEL SECURITY;

-- Create read-only policy for anon role (portal frontend)
CREATE POLICY "Allow public read on project_mindshare_snapshots" 
  ON project_mindshare_snapshots FOR SELECT 
  USING (true);

-- Service role can do everything (for cron jobs and API)
-- Note: Supabase service role bypasses RLS by default

-- =============================================================================
-- HELPER FUNCTION: Get Mindshare Delta
-- =============================================================================

CREATE OR REPLACE FUNCTION get_mindshare_delta(
  p_project_id UUID,
  p_time_window TEXT,
  p_days_ago INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_current_bps INT;
  v_previous_bps INT;
  v_previous_date DATE;
BEGIN
  -- Get current BPS
  SELECT mindshare_bps INTO v_current_bps
  FROM project_mindshare_snapshots
  WHERE project_id = p_project_id
    AND time_window = p_time_window
    AND as_of_date = CURRENT_DATE
  LIMIT 1;
  
  IF v_current_bps IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get previous BPS
  v_previous_date := CURRENT_DATE - (p_days_ago || ' days')::INTERVAL;
  
  SELECT mindshare_bps INTO v_previous_bps
  FROM project_mindshare_snapshots
  WHERE project_id = p_project_id
    AND time_window = p_time_window
    AND as_of_date = v_previous_date
  LIMIT 1;
  
  IF v_previous_bps IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN v_current_bps - v_previous_bps;
END;
$$;

