-- =============================================================================
-- Migration: Add Analyst Social Boost Promo Table
-- 
-- Creates a table to track the "Analyst Social Boost" promotional quest.
-- Seer users can earn 3 days of Analyst access by:
-- 1) Following @MysticHeros on X
-- 2) Posting a tweet mentioning akarimystic.club and tagging @MysticHeros
-- =============================================================================

-- Create the promo tracking table
CREATE TABLE IF NOT EXISTS analyst_social_boost_promo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'never_seen' CHECK (status IN ('never_seen', 'accepted', 'declined_recently', 'declined_long_term', 'completed')),
  times_declined INT NOT NULL DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  next_show_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can only have one promo record
  CONSTRAINT analyst_social_boost_promo_user_unique UNIQUE (user_id)
);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_analyst_social_boost_promo_status 
  ON analyst_social_boost_promo (status);

-- Index for querying by next_show_at (for deciding when to show modal)
CREATE INDEX IF NOT EXISTS idx_analyst_social_boost_promo_next_show_at 
  ON analyst_social_boost_promo (next_show_at);

-- Index for finding completed promos that have expired
CREATE INDEX IF NOT EXISTS idx_analyst_social_boost_promo_expires_at 
  ON analyst_social_boost_promo (expires_at) 
  WHERE status = 'completed';

-- Enable RLS
ALTER TABLE analyst_social_boost_promo ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
CREATE POLICY "Service role full access on analyst_social_boost_promo" 
  ON analyst_social_boost_promo FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE analyst_social_boost_promo IS 'Tracks user state for the Analyst Social Boost promotional quest';
COMMENT ON COLUMN analyst_social_boost_promo.status IS 'Current promo state: never_seen, accepted, declined_recently, declined_long_term, completed';
COMMENT ON COLUMN analyst_social_boost_promo.times_declined IS 'Number of times user has clicked "Not now"';
COMMENT ON COLUMN analyst_social_boost_promo.next_show_at IS 'When to show the promo modal again (null = show immediately, only if eligible)';
COMMENT ON COLUMN analyst_social_boost_promo.activated_at IS 'When the user successfully verified and activated the promo';
COMMENT ON COLUMN analyst_social_boost_promo.expires_at IS 'When the 3-day Analyst access expires';

