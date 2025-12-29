-- =============================================================================
-- Migration: Add Smart Followers System Tables
-- Purpose: Enable graph-based Smart Followers calculation with PageRank
-- Date: 2025-01-29
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TRACKED_PROFILES TABLE
-- Tracks all profiles in our "universe" for Smart Followers calculation
-- =============================================================================

CREATE TABLE IF NOT EXISTS tracked_profiles (
  x_user_id TEXT PRIMARY KEY, -- Twitter/X user ID (string)
  username TEXT NOT NULL, -- Twitter username (lowercase, no @)
  followers_count INT DEFAULT 0,
  following_count INT DEFAULT 0,
  account_created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Index for lookups
  CONSTRAINT tracked_profiles_username_unique UNIQUE (username)
);

CREATE INDEX IF NOT EXISTS idx_tracked_profiles_username ON tracked_profiles(username);
CREATE INDEX IF NOT EXISTS idx_tracked_profiles_updated_at ON tracked_profiles(updated_at);

-- =============================================================================
-- 2. X_FOLLOW_EDGES TABLE
-- Directed graph edges: who follows whom
-- Only stores edges where both src and dst are in tracked_profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS x_follow_edges (
  src_user_id TEXT NOT NULL, -- Source user (follower)
  dst_user_id TEXT NOT NULL, -- Destination user (followed)
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (src_user_id, dst_user_id),
  FOREIGN KEY (src_user_id) REFERENCES tracked_profiles(x_user_id) ON DELETE CASCADE,
  FOREIGN KEY (dst_user_id) REFERENCES tracked_profiles(x_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_x_follow_edges_src ON x_follow_edges(src_user_id);
CREATE INDEX IF NOT EXISTS idx_x_follow_edges_dst ON x_follow_edges(dst_user_id);
CREATE INDEX IF NOT EXISTS idx_x_follow_edges_fetched_at ON x_follow_edges(fetched_at);

-- =============================================================================
-- 3. SMART_ACCOUNT_SCORES TABLE
-- Daily snapshots of PageRank, bot risk, and smart score per account
-- =============================================================================

CREATE TABLE IF NOT EXISTS smart_account_scores (
  x_user_id TEXT NOT NULL,
  pagerank NUMERIC(10, 6) DEFAULT 0, -- PageRank score (0-1 range, typically)
  bot_risk NUMERIC(5, 4) DEFAULT 0, -- Bot risk score (0-1, higher = more risky)
  smart_score NUMERIC(10, 6) DEFAULT 0, -- pagerank * (1 - bot_risk)
  is_smart BOOLEAN DEFAULT FALSE, -- Top N or top pct (configurable threshold)
  as_of_date DATE NOT NULL, -- Date of calculation
  
  PRIMARY KEY (x_user_id, as_of_date),
  FOREIGN KEY (x_user_id) REFERENCES tracked_profiles(x_user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_smart_account_scores_x_user_id ON smart_account_scores(x_user_id);
CREATE INDEX IF NOT EXISTS idx_smart_account_scores_as_of_date ON smart_account_scores(as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_smart_account_scores_is_smart ON smart_account_scores(is_smart) WHERE is_smart = TRUE;
CREATE INDEX IF NOT EXISTS idx_smart_account_scores_smart_score ON smart_account_scores(smart_score DESC);

-- =============================================================================
-- 4. SMART_FOLLOWERS_SNAPSHOTS TABLE
-- Daily snapshots of Smart Followers count and percentage per entity
-- Supports both projects and creators
-- =============================================================================

CREATE TABLE IF NOT EXISTS smart_followers_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'creator')),
  entity_id TEXT NOT NULL, -- project_id (UUID) or x_user_id (TEXT)
  x_user_id TEXT NOT NULL, -- The profile being measured
  smart_followers_count INT DEFAULT 0, -- Count of incoming smart edges
  smart_followers_pct NUMERIC(5, 2) DEFAULT 0, -- Percentage (0-100)
  as_of_date DATE NOT NULL,
  
  -- Track whether this is an estimate (fallback mode)
  is_estimate BOOLEAN DEFAULT FALSE,
  
  FOREIGN KEY (x_user_id) REFERENCES tracked_profiles(x_user_id) ON DELETE CASCADE,
  UNIQUE (entity_type, entity_id, x_user_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_smart_followers_snapshots_entity ON smart_followers_snapshots(entity_type, entity_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_smart_followers_snapshots_x_user_id ON smart_followers_snapshots(x_user_id);
CREATE INDEX IF NOT EXISTS idx_smart_followers_snapshots_as_of_date ON smart_followers_snapshots(as_of_date DESC);

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow read access for anon key (portal is read-only)
-- =============================================================================

ALTER TABLE tracked_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_follow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_account_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_followers_snapshots ENABLE ROW LEVEL SECURITY;

-- Create read-only policies for anon role (portal frontend)
CREATE POLICY "Allow public read on tracked_profiles" 
  ON tracked_profiles FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on x_follow_edges" 
  ON x_follow_edges FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on smart_account_scores" 
  ON smart_account_scores FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on smart_followers_snapshots" 
  ON smart_followers_snapshots FOR SELECT 
  USING (true);

-- Service role can do everything (for cron jobs and API)
-- Note: Supabase service role bypasses RLS by default, so no explicit policy needed

-- =============================================================================
-- 6. HELPER FUNCTION: Get Smart Followers Count
-- =============================================================================

CREATE OR REPLACE FUNCTION get_smart_followers_count(
  p_x_user_id TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO v_count
  FROM x_follow_edges e
  INNER JOIN smart_account_scores s
    ON e.src_user_id = s.x_user_id
    AND s.as_of_date = p_as_of_date
    AND s.is_smart = TRUE
  WHERE e.dst_user_id = p_x_user_id;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- =============================================================================
-- 7. HELPER FUNCTION: Get Smart Followers Percentage
-- =============================================================================

CREATE OR REPLACE FUNCTION get_smart_followers_pct(
  p_x_user_id TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC(5, 2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_smart_count INT;
  v_total_followers INT;
  v_pct NUMERIC(5, 2);
BEGIN
  -- Get smart followers count
  v_smart_count := get_smart_followers_count(p_x_user_id, p_as_of_date);
  
  -- Get total followers from tracked_profiles
  SELECT followers_count INTO v_total_followers
  FROM tracked_profiles
  WHERE x_user_id = p_x_user_id;
  
  -- Calculate percentage
  IF v_total_followers > 0 THEN
    v_pct := (v_smart_count::NUMERIC / v_total_followers::NUMERIC) * 100;
  ELSE
    -- Fallback: use incoming edge count from tracked universe
    SELECT COUNT(*)::INT INTO v_total_followers
    FROM x_follow_edges
    WHERE dst_user_id = p_x_user_id;
    
    IF v_total_followers > 0 THEN
      v_pct := (v_smart_count::NUMERIC / v_total_followers::NUMERIC) * 100;
    ELSE
      v_pct := 0;
    END IF;
  END IF;
  
  RETURN LEAST(100, GREATEST(0, v_pct));
END;
$$;

