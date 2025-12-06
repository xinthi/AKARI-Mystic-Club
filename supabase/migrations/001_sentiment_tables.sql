-- =============================================================================
-- AKARI Social Sentiment Terminal - Database Schema
-- =============================================================================
-- Run this migration in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- This creates 5 tables for tracking project sentiment and influencer data.
-- Does NOT modify any existing tables.
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROJECTS TABLE
-- Stores tracked crypto projects with their X/Twitter handles
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,              -- URL-friendly identifier e.g. "akari", "bitcoin"
  x_handle TEXT UNIQUE NOT NULL,          -- Twitter/X handle e.g. "akari_portal"
  name TEXT NOT NULL,                     -- Display name e.g. "Akari Mystic Club"
  bio TEXT,                               -- Project description
  avatar_url TEXT,                        -- Profile image URL
  first_tracked_at TIMESTAMPTZ DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE          -- Whether to include in daily updates
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_x_handle ON projects(x_handle);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- 2. METRICS_DAILY TABLE
-- Daily sentiment and engagement metrics per project
-- =============================================================================
CREATE TABLE IF NOT EXISTS metrics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,                     -- The date these metrics are for
  sentiment_score INT CHECK (sentiment_score >= 0 AND sentiment_score <= 100),  -- 0-100
  ct_heat_score INT CHECK (ct_heat_score >= 0 AND ct_heat_score <= 100),        -- 0-100 (Crypto Twitter heat)
  tweet_count INT DEFAULT 0,              -- Number of tweets/mentions
  followers INT DEFAULT 0,                -- Follower count at snapshot
  akari_score INT CHECK (akari_score >= 0 AND akari_score <= 1000),             -- 0-1000 composite score
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one row per project per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrics_daily_project_date 
  ON metrics_daily(project_id, date);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_metrics_daily_date ON metrics_daily(date DESC);

-- =============================================================================
-- 3. INFLUENCERS TABLE
-- Tracked influencer accounts with credibility scores
-- =============================================================================
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  x_handle TEXT UNIQUE NOT NULL,          -- Twitter/X handle
  name TEXT,                              -- Display name
  bio TEXT,                               -- Bio description
  avatar_url TEXT,                        -- Profile image URL
  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  akari_score INT CHECK (akari_score >= 0 AND akari_score <= 1000),             -- 0-1000
  credibility_score INT CHECK (credibility_score >= 0 AND credibility_score <= 100), -- 0-100
  last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_influencers_x_handle ON influencers(x_handle);
CREATE INDEX IF NOT EXISTS idx_influencers_akari_score ON influencers(akari_score DESC);

-- =============================================================================
-- 4. PROJECT_INFLUENCERS TABLE
-- Many-to-many relationship: which influencers engage with which projects
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  is_follower BOOLEAN DEFAULT FALSE,      -- Does the influencer follow this project?
  last_mention_at TIMESTAMPTZ,            -- When did they last mention the project?
  avg_sentiment_30d INT CHECK (avg_sentiment_30d >= 0 AND avg_sentiment_30d <= 100) -- 0-100
);

-- Unique constraint: one relationship per influencer per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_influencers_unique 
  ON project_influencers(project_id, influencer_id);

-- Index for fast project lookups
CREATE INDEX IF NOT EXISTS idx_project_influencers_project 
  ON project_influencers(project_id);

-- =============================================================================
-- 5. PROJECT_TWEETS TABLE
-- Individual tweet records for detailed analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_tweets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tweet_id TEXT NOT NULL,                 -- Twitter's tweet ID
  author_handle TEXT NOT NULL,            -- Who wrote the tweet
  created_at TIMESTAMPTZ NOT NULL,        -- When the tweet was posted
  text TEXT,                              -- Tweet content
  likes INT DEFAULT 0,
  replies INT DEFAULT 0,
  retweets INT DEFAULT 0,
  sentiment_score INT CHECK (sentiment_score >= 0 AND sentiment_score <= 100) -- 0-100
);

-- Unique constraint: one record per tweet
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tweets_tweet_id 
  ON project_tweets(tweet_id);

-- Index for time-series and project lookups
CREATE INDEX IF NOT EXISTS idx_project_tweets_project_created 
  ON project_tweets(project_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS but allow read access for anon key (portal is read-only)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tweets ENABLE ROW LEVEL SECURITY;

-- Create read-only policies for anon role (portal frontend)
CREATE POLICY "Allow public read on projects" 
  ON projects FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on metrics_daily" 
  ON metrics_daily FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on influencers" 
  ON influencers FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on project_influencers" 
  ON project_influencers FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on project_tweets" 
  ON project_tweets FOR SELECT 
  USING (true);

-- Create full-access policies for service_role (background scripts)
-- Note: service_role bypasses RLS by default, but explicit policies are good practice
CREATE POLICY "Allow service_role full access on projects" 
  ON projects FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on metrics_daily" 
  ON metrics_daily FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on influencers" 
  ON influencers FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on project_influencers" 
  ON project_influencers FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service_role full access on project_tweets" 
  ON project_tweets FOR ALL 
  USING (auth.role() = 'service_role');

-- =============================================================================
-- SAMPLE DATA (Optional - uncomment to seed initial project)
-- =============================================================================
/*
INSERT INTO projects (slug, x_handle, name, bio, is_active)
VALUES (
  'akari',
  'akari_portal',
  'Akari Mystic Club',
  'Community-driven prediction-native market intelligence platform.',
  true
)
ON CONFLICT (slug) DO NOTHING;
*/

-- =============================================================================
-- VERIFICATION QUERY
-- Run this to verify tables were created successfully:
-- =============================================================================
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('projects', 'metrics_daily', 'influencers', 'project_influencers', 'project_tweets');

