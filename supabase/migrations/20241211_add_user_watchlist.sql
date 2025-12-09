-- =============================================================================
-- Migration: Add user watchlist table for Sentiment Terminal
-- =============================================================================
-- Allows users to star/favorite projects for quick access
-- =============================================================================

-- Create watchlist table
CREATE TABLE IF NOT EXISTS akari_user_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one watchlist entry per user per project
  UNIQUE(user_id, project_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON akari_user_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_project_id ON akari_user_watchlist(project_id);

-- Row Level Security (RLS)
ALTER TABLE akari_user_watchlist ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own watchlist entries
CREATE POLICY "Users can view their own watchlist"
  ON akari_user_watchlist
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Policy: Users can insert their own watchlist entries
CREATE POLICY "Users can insert their own watchlist"
  ON akari_user_watchlist
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Policy: Users can delete their own watchlist entries
CREATE POLICY "Users can delete their own watchlist"
  ON akari_user_watchlist
  FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- Note: RLS policies above use auth.uid() which works with Supabase Auth.
-- For portal API routes using session tokens, we'll validate in the API layer.

