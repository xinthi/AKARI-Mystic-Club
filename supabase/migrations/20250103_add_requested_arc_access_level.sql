-- Migration: Add requested_arc_access_level to arc_leaderboard_requests
-- Purpose: Allow users to specify which ARC access level they want (creator_manager, leaderboard, gamified)
-- Date: 2025-01-03

-- Add requested_arc_access_level column
ALTER TABLE arc_leaderboard_requests
ADD COLUMN IF NOT EXISTS requested_arc_access_level TEXT CHECK (requested_arc_access_level IN ('creator_manager', 'leaderboard', 'gamified'));

-- Add index for filtering by requested access level
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_requested_access_level
  ON arc_leaderboard_requests(requested_arc_access_level)
  WHERE requested_arc_access_level IS NOT NULL;

-- Add comment
COMMENT ON COLUMN arc_leaderboard_requests.requested_arc_access_level IS 'The ARC access level requested by the user (creator_manager, leaderboard, or gamified)';

