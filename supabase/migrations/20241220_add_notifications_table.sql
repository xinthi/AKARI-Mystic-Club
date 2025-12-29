-- Migration: Add notifications table for Creator Manager
-- Purpose: In-app notifications for Creator Manager actions
-- Date: 2024-12-20

-- =============================================================================
-- CREATE notifications TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'creator_invited',
    'creator_approved',
    'creator_rejected',
    'mission_submitted',
    'mission_approved',
    'mission_rejected'
  )),
  context JSONB NULL, -- Store programId, missionId, projectId, creatorProfileId, etc.
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_profile ON notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_read ON notifications(profile_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on notifications"
ON notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Note: RLS policies for regular users will be added when auth.uid() is available
-- For now, notifications are accessed via API routes with server-side permission checks
-- Users can only read/update their own notifications through the API endpoints

-- Note: Notifications are created server-side only, so no INSERT policy needed for regular users

