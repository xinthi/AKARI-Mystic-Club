-- Migration: Add leaderboard_request_approved and leaderboard_request_rejected notification types
-- Purpose: Support notifications for ARC leaderboard request approvals/rejections
-- Date: 2025-01-03

-- =============================================================================
-- UPDATE notifications TABLE
-- =============================================================================

-- Drop the existing check constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint with additional notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'creator_invited',
  'creator_approved',
  'creator_rejected',
  'mission_submitted',
  'mission_approved',
  'mission_rejected',
  'leaderboard_request_approved',
  'leaderboard_request_rejected'
));

