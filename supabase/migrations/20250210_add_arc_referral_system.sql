-- =============================================================================
-- Migration: Add ARC Referral System
-- Purpose: Track creator referrals and reward referrers with % of ARC points
-- Date: 2025-02-10
-- =============================================================================
-- This migration creates:
-- - arc_referrals: Tracks who invited whom to AKARI/ARC
-- - arc_referral_rewards: Tracks rewards earned by referrers from their referrals' ARC points
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ARC_REFERRALS
-- Tracks creator referrals (who invited whom)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_method TEXT NOT NULL DEFAULT 'x_post'
    CHECK (referral_method IN ('x_post', 'direct_link', 'qr_code', 'manual')),
  referral_code TEXT, -- Optional referral code used
  x_post_url TEXT, -- URL to the X post if created via invite button
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'joined_arc', 'expired')),
  accepted_at TIMESTAMPTZ, -- When the referred creator accepted/joined
  joined_arc_at TIMESTAMPTZ, -- When the referred creator joined their first ARC arena
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure creator cannot refer themselves
  CONSTRAINT arc_referrals_no_self CHECK (referrer_profile_id != referred_profile_id),
  
  -- Unique constraint: one referral per referrer-referred pair
  UNIQUE(referrer_profile_id, referred_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_arc_referrals_referrer ON arc_referrals(referrer_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_arc_referrals_referred ON arc_referrals(referred_profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_referrals_status ON arc_referrals(status);
CREATE INDEX IF NOT EXISTS idx_arc_referrals_joined ON arc_referrals(referrer_profile_id, joined_arc_at) WHERE joined_arc_at IS NOT NULL;

-- =============================================================================
-- 2. ARC_REFERRAL_REWARDS
-- Tracks rewards earned by referrers from their referrals' ARC points
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES arc_referrals(id) ON DELETE CASCADE,
  referrer_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  arena_id UUID REFERENCES arenas(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  arc_points_earned INT NOT NULL, -- ARC points earned by the referred creator
  reward_percentage DECIMAL(5, 2) NOT NULL DEFAULT 5.00, -- % of points rewarded (default 5%)
  reward_points DECIMAL(10, 2) NOT NULL, -- Actual reward points (arc_points_earned * reward_percentage / 100)
  reward_type TEXT NOT NULL DEFAULT 'arc_points'
    CHECK (reward_type IN ('arc_points', 'bonus_points', 'multiplier')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'credited', 'cancelled')),
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure positive values
  CONSTRAINT arc_referral_rewards_positive_points CHECK (arc_points_earned >= 0),
  CONSTRAINT arc_referral_rewards_positive_reward CHECK (reward_points >= 0),
  CONSTRAINT arc_referral_rewards_valid_percentage CHECK (reward_percentage >= 0 AND reward_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_arc_referral_rewards_referrer ON arc_referral_rewards(referrer_profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arc_referral_rewards_referred ON arc_referral_rewards(referred_profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_referral_rewards_referral ON arc_referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_arc_referral_rewards_arena ON arc_referral_rewards(arena_id) WHERE arena_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arc_referral_rewards_status ON arc_referral_rewards(status);

-- =============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE arc_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_referral_rewards ENABLE ROW LEVEL SECURITY;

-- Service role: Full access
CREATE POLICY "Service role full access on arc_referrals"
ON arc_referrals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_referral_rewards"
ON arc_referral_rewards FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own referrals (as referrer or referred)
CREATE POLICY "Users can view their referrals"
ON arc_referrals FOR SELECT
TO authenticated
USING (
  referrer_profile_id = (SELECT get_current_user_profile_id())
  OR referred_profile_id = (SELECT get_current_user_profile_id())
);

-- Users can create referrals (invite others)
CREATE POLICY "Users can create referrals"
ON arc_referrals FOR INSERT
TO authenticated
WITH CHECK (
  referrer_profile_id = (SELECT get_current_user_profile_id())
);

-- Users can view their own rewards
CREATE POLICY "Users can view their rewards"
ON arc_referral_rewards FOR SELECT
TO authenticated
USING (
  referrer_profile_id = (SELECT get_current_user_profile_id())
);

-- Super admins: Full access
CREATE POLICY "Super admins full access on arc_referrals"
ON arc_referrals FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT get_current_user_profile_id())
    AND 'super_admin' = ANY(p.real_roles)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT get_current_user_profile_id())
    AND 'super_admin' = ANY(p.real_roles)
  )
);

CREATE POLICY "Super admins full access on arc_referral_rewards"
ON arc_referral_rewards FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT get_current_user_profile_id())
    AND 'super_admin' = ANY(p.real_roles)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT get_current_user_profile_id())
    AND 'super_admin' = ANY(p.real_roles)
  )
);

-- =============================================================================
-- 4. FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_arc_referral_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_arc_referrals_updated_at
BEFORE UPDATE ON arc_referrals
FOR EACH ROW
EXECUTE FUNCTION update_arc_referral_updated_at();

CREATE TRIGGER update_arc_referral_rewards_updated_at
BEFORE UPDATE ON arc_referral_rewards
FOR EACH ROW
EXECUTE FUNCTION update_arc_referral_updated_at();

-- Function to calculate and create referral rewards when a referred creator earns ARC points
CREATE OR REPLACE FUNCTION calculate_arc_referral_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_referral_id UUID;
  v_referrer_profile_id UUID;
  v_reward_percentage DECIMAL(5, 2) := 5.00; -- Default 5%
  v_reward_points DECIMAL(10, 2);
  v_creator_profile_id UUID;
BEGIN
  -- Only process if points increased (not decreased)
  IF NEW.arc_points <= OLD.arc_points THEN
    RETURN NEW;
  END IF;

  -- Get the creator's profile_id from arena_creators
  SELECT profile_id INTO v_creator_profile_id
  FROM arena_creators
  WHERE id = NEW.id
  LIMIT 1;

  IF v_creator_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find active referral for this creator
  SELECT id, referrer_profile_id
  INTO v_referral_id, v_referrer_profile_id
  FROM arc_referrals
  WHERE referred_profile_id = v_creator_profile_id
    AND status IN ('accepted', 'joined_arc')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no referral found, skip
  IF v_referral_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate reward points (only for the increase)
  v_reward_points := (NEW.arc_points - OLD.arc_points) * v_reward_percentage / 100.0;

  -- Only create reward if it's significant (> 0.01 points)
  IF v_reward_points < 0.01 THEN
    RETURN NEW;
  END IF;

  -- Create reward record
  INSERT INTO arc_referral_rewards (
    referral_id,
    referrer_profile_id,
    referred_profile_id,
    arena_id,
    project_id,
    arc_points_earned,
    reward_percentage,
    reward_points,
    reward_type,
    status
  )
  VALUES (
    v_referral_id,
    v_referrer_profile_id,
    v_creator_profile_id,
    NEW.arena_id,
    (SELECT project_id FROM arenas WHERE id = NEW.arena_id),
    NEW.arc_points - OLD.arc_points,
    v_reward_percentage,
    v_reward_points,
    'arc_points',
    'pending'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: When arena_creators.arc_points increases, calculate referral rewards
CREATE TRIGGER trigger_calculate_arc_referral_reward
AFTER UPDATE OF arc_points ON arena_creators
FOR EACH ROW
WHEN (NEW.arc_points > OLD.arc_points)
EXECUTE FUNCTION calculate_arc_referral_reward();

-- =============================================================================
-- 5. COMMENTS
-- =============================================================================

COMMENT ON TABLE arc_referrals IS 'Tracks creator referrals (who invited whom to AKARI/ARC)';
COMMENT ON TABLE arc_referral_rewards IS 'Tracks rewards earned by referrers from their referrals ARC points';
