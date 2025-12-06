-- =============================================================================
-- AKARI Social Sentiment Terminal V2 - Bloomberg-Style Schema
-- =============================================================================
-- This migration extends the existing schema with:
--   - Profiles table (enhanced influencers with detailed scoring)
--   - Inner Circle tables (global + per-project)
--   - Extended project_tweets for chart markers
--   - Extended projects table with new scoring fields
--   - Extended metrics_daily with inner circle metrics
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROFILES TABLE (replaces/extends influencers for all tracked Twitter profiles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  twitter_id TEXT UNIQUE,                    -- Twitter's user ID
  username TEXT NOT NULL,                    -- @handle without @
  name TEXT,                                 -- Display name
  profile_image_url TEXT,                    -- Avatar URL from Twitter
  bio TEXT,
  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  tweet_count INT DEFAULT 0,
  is_blue_verified BOOLEAN DEFAULT FALSE,
  verified_type TEXT,                        -- 'blue', 'business', 'government', etc.
  created_at_twitter TIMESTAMPTZ,            -- When the Twitter account was created
  
  -- AKARI Scoring Fields (0-1000 or 0-100 as noted)
  akari_profile_score INT CHECK (akari_profile_score >= 0 AND akari_profile_score <= 1000),
  authenticity_score INT CHECK (authenticity_score >= 0 AND authenticity_score <= 100),
  influence_score INT CHECK (influence_score >= 0 AND influence_score <= 100),
  signal_density_score INT CHECK (signal_density_score >= 0 AND signal_density_score <= 100),
  farm_risk_score INT CHECK (farm_risk_score >= 0 AND farm_risk_score <= 100),
  
  -- Metadata
  last_scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_twitter_id ON profiles(twitter_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_akari_score ON profiles(akari_profile_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_profiles_influence ON profiles(influence_score DESC NULLS LAST);

-- =============================================================================
-- 2. EXTEND PROJECTS TABLE with new fields
-- =============================================================================
-- Add new columns to existing projects table (safe ALTER commands)
DO $$ 
BEGIN
  -- Twitter profile fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'twitter_id') THEN
    ALTER TABLE projects ADD COLUMN twitter_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'twitter_username') THEN
    ALTER TABLE projects ADD COLUMN twitter_username TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'twitter_profile_image_url') THEN
    ALTER TABLE projects ADD COLUMN twitter_profile_image_url TEXT;
  END IF;
  
  -- Scoring fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'akari_project_score') THEN
    ALTER TABLE projects ADD COLUMN akari_project_score INT CHECK (akari_project_score >= 0 AND akari_project_score <= 1000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'inner_circle_count') THEN
    ALTER TABLE projects ADD COLUMN inner_circle_count INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'inner_circle_power') THEN
    ALTER TABLE projects ADD COLUMN inner_circle_power INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'quality_follower_ratio') THEN
    ALTER TABLE projects ADD COLUMN quality_follower_ratio NUMERIC(5,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'last_scored_at') THEN
    ALTER TABLE projects ADD COLUMN last_scored_at TIMESTAMPTZ;
  END IF;
END $$;

-- Sync twitter_username with x_handle for existing rows
UPDATE projects SET twitter_username = x_handle WHERE twitter_username IS NULL;

-- =============================================================================
-- 3. EXTEND METRICS_DAILY TABLE with new fields
-- =============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'metrics_daily' AND column_name = 'followers_delta') THEN
    ALTER TABLE metrics_daily ADD COLUMN followers_delta INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'metrics_daily' AND column_name = 'inner_circle_count') THEN
    ALTER TABLE metrics_daily ADD COLUMN inner_circle_count INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'metrics_daily' AND column_name = 'quality_follower_ratio') THEN
    ALTER TABLE metrics_daily ADD COLUMN quality_follower_ratio NUMERIC(5,4);
  END IF;
END $$;

-- =============================================================================
-- 4. INNER_CIRCLE_MEMBERS TABLE (Global Inner Circle of top CT profiles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inner_circle_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  akari_profile_score INT,                   -- Cached score at time of membership
  influence_score INT,
  segment TEXT,                              -- Optional: 'defi', 'nft', 'gaming', 'infrastructure', etc.
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id)
);

CREATE INDEX IF NOT EXISTS idx_inner_circle_profile ON inner_circle_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_inner_circle_score ON inner_circle_members(akari_profile_score DESC);

-- =============================================================================
-- 5. PROJECT_INNER_CIRCLE TABLE (Per-project circle of engaged profiles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_inner_circle (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_follower BOOLEAN DEFAULT FALSE,         -- Follows project account
  is_author BOOLEAN DEFAULT FALSE,           -- Has tweeted about project
  weight NUMERIC(10,4),                      -- Based on profile score and engagement
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_inner_circle_project ON project_inner_circle(project_id);
CREATE INDEX IF NOT EXISTS idx_project_inner_circle_profile ON project_inner_circle(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_inner_circle_weight ON project_inner_circle(project_id, weight DESC);

-- =============================================================================
-- 6. EXTEND PROJECT_TWEETS TABLE with new fields for chart markers
-- =============================================================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'tweet_url') THEN
    ALTER TABLE project_tweets ADD COLUMN tweet_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'author_twitter_id') THEN
    ALTER TABLE project_tweets ADD COLUMN author_twitter_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'author_name') THEN
    ALTER TABLE project_tweets ADD COLUMN author_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'author_profile_image_url') THEN
    ALTER TABLE project_tweets ADD COLUMN author_profile_image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'engagement_score') THEN
    ALTER TABLE project_tweets ADD COLUMN engagement_score NUMERIC(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'is_kol') THEN
    ALTER TABLE project_tweets ADD COLUMN is_kol BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_tweets' AND column_name = 'is_official') THEN
    ALTER TABLE project_tweets ADD COLUMN is_official BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Rename author_handle to author_username for consistency (if needed)
-- Note: We'll keep author_handle for backwards compatibility

-- =============================================================================
-- 7. PROJECT_COMPETITORS TABLE (Similar projects based on inner circle overlap)
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  common_inner_circle_count INT DEFAULT 0,
  common_inner_circle_power INT DEFAULT 0,
  similarity_score NUMERIC(5,4),             -- 0-1 overlap ratio
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, competitor_id)
);

CREATE INDEX IF NOT EXISTS idx_project_competitors_project ON project_competitors(project_id);

-- =============================================================================
-- 8. ROW LEVEL SECURITY for new tables
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inner_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_inner_circle ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_competitors ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Allow public read on profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow public read on inner_circle_members" ON inner_circle_members FOR SELECT USING (true);
CREATE POLICY "Allow public read on project_inner_circle" ON project_inner_circle FOR SELECT USING (true);
CREATE POLICY "Allow public read on project_competitors" ON project_competitors FOR SELECT USING (true);

-- Service role full access
CREATE POLICY "Allow service_role on profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role on inner_circle_members" ON inner_circle_members FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role on project_inner_circle" ON project_inner_circle FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role on project_competitors" ON project_competitors FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- 9. HELPER VIEW: Project with inner circle stats
-- =============================================================================
CREATE OR REPLACE VIEW project_with_circles AS
SELECT 
  p.*,
  (SELECT COUNT(*) FROM project_inner_circle pic WHERE pic.project_id = p.id) AS computed_inner_circle_count,
  (SELECT COALESCE(SUM(pr.influence_score), 0)::INT 
   FROM project_inner_circle pic 
   JOIN profiles pr ON pic.profile_id = pr.id 
   WHERE pic.project_id = p.id) AS computed_inner_circle_power
FROM projects p;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('profiles', 'inner_circle_members', 'project_inner_circle', 'project_competitors');

