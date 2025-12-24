-- =============================================================================
-- Migration: Add Mindshare Auto-Attribution Support
-- Purpose: Enable auto-tracking of creators who generate signal for projects
-- Date: 2025-01-23
-- =============================================================================

-- =============================================================================
-- 1. ADD KEYWORDS FIELD TO PROJECTS (optional, for keyword matching)
-- =============================================================================

DO $$ 
BEGIN
  -- Add arc_keywords field to projects table (text array for keyword matching)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'arc_keywords') THEN
    ALTER TABLE projects ADD COLUMN arc_keywords TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;

-- Add index for keyword searches (if needed in future)
CREATE INDEX IF NOT EXISTS idx_projects_arc_keywords ON projects USING GIN(arc_keywords) WHERE arc_keywords IS NOT NULL AND array_length(arc_keywords, 1) > 0;

-- =============================================================================
-- 2. CREATE ARC_MINDSHARE_EVENTS TABLE (fallback for signal tracking)
-- =============================================================================
-- This table can be used if we need to track events separately from project_tweets
-- For v1, we'll primarily use project_tweets, but this provides a foundation for future expansion

CREATE TABLE IF NOT EXISTS arc_mindshare_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  twitter_username TEXT NOT NULL, -- Normalized (lowercase, no @)
  event_type TEXT NOT NULL CHECK (event_type IN ('mention', 'keyword', 'sentiment')),
  points INT NOT NULL DEFAULT 1,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_ref TEXT, -- Optional: tweet id, sentiment post id, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index for source_ref (only when source_ref IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS arc_mindshare_events_unique_source_ref
ON arc_mindshare_events(project_id, twitter_username, event_type, source_ref)
WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arc_mindshare_events_project_id 
  ON arc_mindshare_events(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_mindshare_events_twitter_username 
  ON arc_mindshare_events(twitter_username);
CREATE INDEX IF NOT EXISTS idx_arc_mindshare_events_project_username 
  ON arc_mindshare_events(project_id, twitter_username);
CREATE INDEX IF NOT EXISTS idx_arc_mindshare_events_event_at 
  ON arc_mindshare_events(event_at DESC);

-- Enable RLS
ALTER TABLE arc_mindshare_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on arc_mindshare_events"
ON arc_mindshare_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- No public read access (only through server endpoints)
-- This ensures we don't leak data through direct table access

-- =============================================================================
-- 3. ADD INDEXES TO PROJECT_TWEETS FOR MINDSHARE QUERIES
-- =============================================================================
-- Ensure we have indexes for efficient queries on author_handle and project_id

CREATE INDEX IF NOT EXISTS idx_project_tweets_project_author 
  ON project_tweets(project_id, author_handle) 
  WHERE is_official = false; -- Only non-official tweets (mentions)

CREATE INDEX IF NOT EXISTS idx_project_tweets_author_created 
  ON project_tweets(author_handle, created_at DESC) 
  WHERE is_official = false;

