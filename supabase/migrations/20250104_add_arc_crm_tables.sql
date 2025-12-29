-- =============================================================================
-- Migration: Add ARC CRM Tables (Option 1: KOL/Creator Manager)
-- Purpose: Full schema for ARC CRM system with foundations for Options 2 & 3
-- Date: 2025-01-04
-- =============================================================================
-- This migration creates all tables needed for ARC system:
-- - arc_project_access: Approval requests and decisions
-- - arc_project_features: Feature unlock status per project
-- - arc_campaigns: CRM campaigns (Option 1)
-- - arc_campaign_participants: Participants in campaigns
-- - arc_participant_links: UTM tracking links per participant
-- - arc_link_events: Click tracking for UTM links
-- - arc_external_submissions: External proof submissions (YouTube, TikTok, etc.)
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ARC_PROJECT_ACCESS
-- Stores approval requests and decisions for ARC access
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  applied_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  applied_by_official_x BOOLEAN DEFAULT FALSE,
  application_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (application_status IN ('pending', 'approved', 'rejected')),
  approved_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure only one pending request per project (enforced via unique index below)
);

CREATE INDEX IF NOT EXISTS idx_arc_project_access_project_id 
  ON arc_project_access(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_project_access_status 
  ON arc_project_access(application_status);
CREATE INDEX IF NOT EXISTS idx_arc_project_access_applied_by 
  ON arc_project_access(applied_by_profile_id);

-- Unique index to ensure only one pending request per project
CREATE UNIQUE INDEX IF NOT EXISTS idx_arc_project_access_unique_pending
  ON arc_project_access(project_id)
  WHERE application_status = 'pending';

-- =============================================================================
-- 2. ARC_PROJECT_FEATURES
-- Stores feature unlock status per project (Option 1, 2, 3)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_project_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  option1_crm_unlocked BOOLEAN DEFAULT FALSE,
  option2_normal_unlocked BOOLEAN DEFAULT FALSE,
  option3_gamified_unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arc_project_features_project_id 
  ON arc_project_features(project_id);

-- =============================================================================
-- 3. ARC_CAMPAIGNS
-- CRM campaigns (Option 1: KOL/Creator Manager)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'crm' 
    CHECK (type IN ('crm', 'normal', 'gamified')),
  participation_mode TEXT NOT NULL DEFAULT 'invite_only'
    CHECK (participation_mode IN ('invite_only', 'public', 'hybrid')),
  leaderboard_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (leaderboard_visibility IN ('public', 'private')),
  name TEXT NOT NULL,
  brief_objective TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  website_url TEXT,
  docs_url TEXT,
  reward_pool_text TEXT,
  winners_count INT DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'paused', 'ended')),
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure end_at > start_at
  CONSTRAINT arc_campaigns_valid_dates CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_arc_campaigns_project_id 
  ON arc_campaigns(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_campaigns_status 
  ON arc_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_arc_campaigns_type 
  ON arc_campaigns(type);
CREATE INDEX IF NOT EXISTS idx_arc_campaigns_dates 
  ON arc_campaigns(start_at, end_at);

-- =============================================================================
-- 4. ARC_CAMPAIGN_PARTICIPANTS
-- Participants in campaigns (can be invited or public join)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_campaign_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES arc_campaigns(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  twitter_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'declined', 'tracked')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One participant per campaign per twitter_username
  CONSTRAINT arc_campaign_participants_unique 
    UNIQUE (campaign_id, twitter_username)
);

CREATE INDEX IF NOT EXISTS idx_arc_campaign_participants_campaign_id 
  ON arc_campaign_participants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_arc_campaign_participants_profile_id 
  ON arc_campaign_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_arc_campaign_participants_status 
  ON arc_campaign_participants(status);
CREATE INDEX IF NOT EXISTS idx_arc_campaign_participants_twitter_username 
  ON arc_campaign_participants(twitter_username);

-- =============================================================================
-- 5. ARC_PARTICIPANT_LINKS
-- UTM tracking links per participant per campaign
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_participant_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES arc_campaigns(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES arc_campaign_participants(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One link per participant per campaign
  CONSTRAINT arc_participant_links_unique 
    UNIQUE (campaign_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_arc_participant_links_code 
  ON arc_participant_links(code);
CREATE INDEX IF NOT EXISTS idx_arc_participant_links_campaign_id 
  ON arc_participant_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_arc_participant_links_participant_id 
  ON arc_participant_links(participant_id);

-- =============================================================================
-- 6. ARC_LINK_EVENTS
-- Click tracking for UTM links
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES arc_campaigns(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES arc_campaign_participants(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT,
  user_agent_hash TEXT,
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_arc_link_events_campaign_id 
  ON arc_link_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_arc_link_events_participant_id 
  ON arc_link_events(participant_id);
CREATE INDEX IF NOT EXISTS idx_arc_link_events_ts 
  ON arc_link_events(ts DESC);

-- =============================================================================
-- 7. ARC_EXTERNAL_SUBMISSIONS
-- External proof submissions (YouTube, TikTok, Telegram, Other)
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_external_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES arc_campaigns(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES arc_campaign_participants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL 
    CHECK (platform IN ('youtube', 'tiktok', 'telegram', 'other')),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'rejected')),
  reviewed_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arc_external_submissions_campaign_id 
  ON arc_external_submissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_arc_external_submissions_participant_id 
  ON arc_external_submissions(participant_id);
CREATE INDEX IF NOT EXISTS idx_arc_external_submissions_status 
  ON arc_external_submissions(status);
CREATE INDEX IF NOT EXISTS idx_arc_external_submissions_platform 
  ON arc_external_submissions(platform);

-- =============================================================================
-- TRIGGERS: Update updated_at timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION update_arc_project_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_arc_project_access_updated_at
  BEFORE UPDATE ON arc_project_access
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_project_access_updated_at();

CREATE OR REPLACE FUNCTION update_arc_project_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_arc_project_features_updated_at
  BEFORE UPDATE ON arc_project_features
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_project_features_updated_at();

CREATE OR REPLACE FUNCTION update_arc_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_arc_campaigns_updated_at
  BEFORE UPDATE ON arc_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_campaigns_updated_at();

CREATE OR REPLACE FUNCTION update_arc_campaign_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_arc_campaign_participants_updated_at
  BEFORE UPDATE ON arc_campaign_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_campaign_participants_updated_at();

CREATE OR REPLACE FUNCTION update_arc_external_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_arc_external_submissions_updated_at
  BEFORE UPDATE ON arc_external_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_arc_external_submissions_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE arc_project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_project_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_campaign_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_participant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_external_submissions ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's profile ID from auth.uid()
-- (Reusing existing function if it exists, otherwise creating it)
CREATE OR REPLACE FUNCTION get_current_user_profile_id()
RETURNS UUID AS $$
DECLARE
  profile_id UUID;
BEGIN
  SELECT p.id INTO profile_id
  FROM profiles p
  INNER JOIN akari_user_identities aui ON aui.username = p.username
  WHERE aui.user_id = auth.uid()::text::uuid
    AND aui.provider = 'x'
  LIMIT 1;
  
  RETURN profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is super admin (via profiles.real_roles)
CREATE OR REPLACE FUNCTION is_user_super_admin(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = profile_id
    AND real_roles @> ARRAY['super_admin']::text[]
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is project admin/moderator
CREATE OR REPLACE FUNCTION is_user_project_admin(profile_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check project_team_members for admin/moderator role
  RETURN EXISTS (
    SELECT 1 FROM project_team_members
    WHERE project_team_members.profile_id = is_user_project_admin.profile_id
    AND project_team_members.project_id = is_user_project_admin.project_id
    AND project_team_members.role IN ('admin', 'moderator', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service role has full access (for API routes using service key)
CREATE POLICY "Service role full access on arc_project_access"
ON arc_project_access FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_project_features"
ON arc_project_features FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_campaigns"
ON arc_campaigns FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_campaign_participants"
ON arc_campaign_participants FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_participant_links"
ON arc_participant_links FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_link_events"
ON arc_link_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arc_external_submissions"
ON arc_external_submissions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =============================================================================
-- RLS POLICIES FOR ARC_PROJECT_ACCESS
-- =============================================================================

-- Users can read their own requests
CREATE POLICY "Users can read own arc_project_access requests"
ON arc_project_access FOR SELECT
USING (
  applied_by_profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
);

-- Users can insert their own requests
CREATE POLICY "Users can insert own arc_project_access requests"
ON arc_project_access FOR INSERT
WITH CHECK (
  applied_by_profile_id = get_current_user_profile_id()
);

-- Super admins can update all requests
CREATE POLICY "Super admins can update arc_project_access"
ON arc_project_access FOR UPDATE
USING (is_user_super_admin(get_current_user_profile_id()))
WITH CHECK (is_user_super_admin(get_current_user_profile_id()));

-- =============================================================================
-- RLS POLICIES FOR ARC_PROJECT_FEATURES
-- =============================================================================

-- Anyone can read features (for checking unlock status)
CREATE POLICY "Anyone can read arc_project_features"
ON arc_project_features FOR SELECT
USING (true);

-- Only super admins can update features
CREATE POLICY "Super admins can update arc_project_features"
ON arc_project_features FOR UPDATE
USING (is_user_super_admin(get_current_user_profile_id()))
WITH CHECK (is_user_super_admin(get_current_user_profile_id()));

-- =============================================================================
-- RLS POLICIES FOR ARC_CAMPAIGNS
-- =============================================================================

-- Users can read campaigns if:
-- 1. They are project admin/moderator for the campaign's project
-- 2. Campaign leaderboard_visibility is 'public'
-- 3. They are super admin
CREATE POLICY "Users can read arc_campaigns"
ON arc_campaigns FOR SELECT
USING (
  is_user_super_admin(get_current_user_profile_id())
  OR leaderboard_visibility = 'public'
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Project admins/moderators and super admins can insert campaigns
CREATE POLICY "Project admins can insert arc_campaigns"
ON arc_campaigns FOR INSERT
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- Project admins/moderators and super admins can update campaigns
CREATE POLICY "Project admins can update arc_campaigns"
ON arc_campaigns FOR UPDATE
USING (
  is_user_super_admin(get_current_user_profile_id())
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
)
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
);

-- =============================================================================
-- RLS POLICIES FOR ARC_CAMPAIGN_PARTICIPANTS
-- =============================================================================

-- Users can read participants if:
-- 1. They are participant themselves (their profile_id matches)
-- 2. They are project admin/moderator for the campaign's project
-- 3. Campaign leaderboard_visibility is 'public'
-- 4. They are super admin
CREATE POLICY "Users can read arc_campaign_participants"
ON arc_campaign_participants FOR SELECT
USING (
  profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaigns
    WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
    AND (
      arc_campaigns.leaderboard_visibility = 'public'
      OR is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
    )
  )
);

-- Project admins/moderators and super admins can insert participants
CREATE POLICY "Project admins can insert arc_campaign_participants"
ON arc_campaign_participants FOR INSERT
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaigns
    WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
    AND is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
  )
);

-- Participants can update their own status (accept/decline)
-- Project admins/moderators and super admins can update any participant
CREATE POLICY "Users can update arc_campaign_participants"
ON arc_campaign_participants FOR UPDATE
USING (
  profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaigns
    WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
    AND is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
  )
)
WITH CHECK (
  profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaigns
    WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
    AND is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
  )
);

-- =============================================================================
-- RLS POLICIES FOR ARC_PARTICIPANT_LINKS
-- =============================================================================

-- Users can read links if they can read the participant
CREATE POLICY "Users can read arc_participant_links"
ON arc_participant_links FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM arc_campaign_participants
    WHERE arc_campaign_participants.id = arc_participant_links.participant_id
    AND (
      arc_campaign_participants.profile_id = get_current_user_profile_id()
      OR is_user_super_admin(get_current_user_profile_id())
      OR EXISTS (
        SELECT 1 FROM arc_campaigns
        WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
        AND (
          arc_campaigns.leaderboard_visibility = 'public'
          OR is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
        )
      )
    )
  )
);

-- Project admins/moderators and super admins can insert links
CREATE POLICY "Project admins can insert arc_participant_links"
ON arc_participant_links FOR INSERT
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaign_participants acp
    INNER JOIN arc_campaigns ac ON ac.id = acp.campaign_id
    WHERE acp.id = arc_participant_links.participant_id
    AND is_user_project_admin(get_current_user_profile_id(), ac.project_id)
  )
);

-- =============================================================================
-- RLS POLICIES FOR ARC_LINK_EVENTS
-- =============================================================================

-- Project admins/moderators and super admins can read events
-- Participants can read their own events
CREATE POLICY "Users can read arc_link_events"
ON arc_link_events FOR SELECT
USING (
  is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaign_participants
    WHERE arc_campaign_participants.id = arc_link_events.participant_id
    AND (
      arc_campaign_participants.profile_id = get_current_user_profile_id()
      OR EXISTS (
        SELECT 1 FROM arc_campaigns
        WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
        AND is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
      )
    )
  )
);

-- Anyone can insert events (for tracking clicks)
CREATE POLICY "Anyone can insert arc_link_events"
ON arc_link_events FOR INSERT
WITH CHECK (true);

-- =============================================================================
-- RLS POLICIES FOR ARC_EXTERNAL_SUBMISSIONS
-- =============================================================================

-- Users can read submissions if:
-- 1. They are the participant who submitted
-- 2. They are project admin/moderator for the campaign's project
-- 3. They are super admin
CREATE POLICY "Users can read arc_external_submissions"
ON arc_external_submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM arc_campaign_participants
    WHERE arc_campaign_participants.id = arc_external_submissions.participant_id
    AND (
      arc_campaign_participants.profile_id = get_current_user_profile_id()
      OR is_user_super_admin(get_current_user_profile_id())
      OR EXISTS (
        SELECT 1 FROM arc_campaigns
        WHERE arc_campaigns.id = arc_campaign_participants.campaign_id
        AND is_user_project_admin(get_current_user_profile_id(), arc_campaigns.project_id)
      )
    )
  )
);

-- Participants can insert their own submissions
CREATE POLICY "Participants can insert arc_external_submissions"
ON arc_external_submissions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM arc_campaign_participants
    WHERE arc_campaign_participants.id = arc_external_submissions.participant_id
    AND arc_campaign_participants.profile_id = get_current_user_profile_id()
  )
);

-- Project admins/moderators and super admins can update submissions (review/approve/reject)
CREATE POLICY "Project admins can update arc_external_submissions"
ON arc_external_submissions FOR UPDATE
USING (
  is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaign_participants acp
    INNER JOIN arc_campaigns ac ON ac.id = acp.campaign_id
    WHERE acp.id = arc_external_submissions.participant_id
    AND is_user_project_admin(get_current_user_profile_id(), ac.project_id)
  )
)
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR EXISTS (
    SELECT 1 FROM arc_campaign_participants acp
    INNER JOIN arc_campaigns ac ON ac.id = acp.campaign_id
    WHERE acp.id = arc_external_submissions.participant_id
    AND is_user_project_admin(get_current_user_profile_id(), ac.project_id)
  )
);

