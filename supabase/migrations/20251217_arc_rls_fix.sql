-- =============================================================================
-- Migration: ARC RLS Fix
-- Purpose: Fix and clean up RLS policies for all ARC tables
-- Date: 2025-12-17
-- 
-- This migration:
-- 1. Recreates helper functions used in RLS policies
-- 2. Ensures RLS is enabled on all ARC tables
-- 3. Drops and recreates all RLS policies cleanly
-- 
-- Safe to re-run: Uses CREATE OR REPLACE and DROP POLICY IF EXISTS
-- =============================================================================

-- =============================================================================
-- 1. HELPER FUNCTIONS
-- =============================================================================

-- Helper function to get current user's profile ID from auth.uid()
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

-- =============================================================================
-- 2. ENABLE RLS ON ALL ARC TABLES
-- =============================================================================

ALTER TABLE IF EXISTS arc_project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_project_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_campaign_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_participant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_external_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS arc_leaderboard_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. DROP AND RECREATE RLS POLICIES FOR ARC_PROJECT_ACCESS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_project_access" ON arc_project_access;
DROP POLICY IF EXISTS "Users can read own arc_project_access requests" ON arc_project_access;
DROP POLICY IF EXISTS "Users can insert own arc_project_access requests" ON arc_project_access;
DROP POLICY IF EXISTS "Super admins can update arc_project_access" ON arc_project_access;

CREATE POLICY "Service role full access on arc_project_access"
ON arc_project_access FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read own arc_project_access requests"
ON arc_project_access FOR SELECT
USING (
  applied_by_profile_id = get_current_user_profile_id()
  OR is_user_super_admin(get_current_user_profile_id())
);

CREATE POLICY "Users can insert own arc_project_access requests"
ON arc_project_access FOR INSERT
WITH CHECK (
  applied_by_profile_id = get_current_user_profile_id()
);

CREATE POLICY "Super admins can update arc_project_access"
ON arc_project_access FOR UPDATE
USING (is_user_super_admin(get_current_user_profile_id()))
WITH CHECK (is_user_super_admin(get_current_user_profile_id()));

-- =============================================================================
-- 4. DROP AND RECREATE RLS POLICIES FOR ARC_PROJECT_FEATURES
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_project_features" ON arc_project_features;
DROP POLICY IF EXISTS "Anyone can read arc_project_features" ON arc_project_features;
DROP POLICY IF EXISTS "Super admins can update arc_project_features" ON arc_project_features;

CREATE POLICY "Service role full access on arc_project_features"
ON arc_project_features FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can read arc_project_features"
ON arc_project_features FOR SELECT
USING (true);

CREATE POLICY "Super admins can update arc_project_features"
ON arc_project_features FOR UPDATE
USING (is_user_super_admin(get_current_user_profile_id()))
WITH CHECK (is_user_super_admin(get_current_user_profile_id()));

-- =============================================================================
-- 5. DROP AND RECREATE RLS POLICIES FOR ARC_CAMPAIGNS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_campaigns" ON arc_campaigns;
DROP POLICY IF EXISTS "Users can read arc_campaigns" ON arc_campaigns;
DROP POLICY IF EXISTS "Project admins can insert arc_campaigns" ON arc_campaigns;
DROP POLICY IF EXISTS "Project admins can update arc_campaigns" ON arc_campaigns;

CREATE POLICY "Service role full access on arc_campaigns"
ON arc_campaigns FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can read arc_campaigns"
ON arc_campaigns FOR SELECT
USING (
  is_user_super_admin(get_current_user_profile_id())
  OR leaderboard_visibility = 'public'
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
);

CREATE POLICY "Project admins can insert arc_campaigns"
ON arc_campaigns FOR INSERT
WITH CHECK (
  is_user_super_admin(get_current_user_profile_id())
  OR is_user_project_admin(get_current_user_profile_id(), project_id)
);

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
-- 6. DROP AND RECREATE RLS POLICIES FOR ARC_CAMPAIGN_PARTICIPANTS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_campaign_participants" ON arc_campaign_participants;
DROP POLICY IF EXISTS "Users can read arc_campaign_participants" ON arc_campaign_participants;
DROP POLICY IF EXISTS "Project admins can insert arc_campaign_participants" ON arc_campaign_participants;
DROP POLICY IF EXISTS "Users can update arc_campaign_participants" ON arc_campaign_participants;

CREATE POLICY "Service role full access on arc_campaign_participants"
ON arc_campaign_participants FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

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
-- 7. DROP AND RECREATE RLS POLICIES FOR ARC_PARTICIPANT_LINKS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_participant_links" ON arc_participant_links;
DROP POLICY IF EXISTS "Users can read arc_participant_links" ON arc_participant_links;
DROP POLICY IF EXISTS "Project admins can insert arc_participant_links" ON arc_participant_links;

CREATE POLICY "Service role full access on arc_participant_links"
ON arc_participant_links FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

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
-- 8. DROP AND RECREATE RLS POLICIES FOR ARC_LINK_EVENTS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_link_events" ON arc_link_events;
DROP POLICY IF EXISTS "Users can read arc_link_events" ON arc_link_events;
DROP POLICY IF EXISTS "Anyone can insert arc_link_events" ON arc_link_events;

CREATE POLICY "Service role full access on arc_link_events"
ON arc_link_events FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

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

CREATE POLICY "Anyone can insert arc_link_events"
ON arc_link_events FOR INSERT
WITH CHECK (true);

-- =============================================================================
-- 9. DROP AND RECREATE RLS POLICIES FOR ARC_EXTERNAL_SUBMISSIONS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_external_submissions" ON arc_external_submissions;
DROP POLICY IF EXISTS "Users can read arc_external_submissions" ON arc_external_submissions;
DROP POLICY IF EXISTS "Participants can insert arc_external_submissions" ON arc_external_submissions;
DROP POLICY IF EXISTS "Project admins can update arc_external_submissions" ON arc_external_submissions;

CREATE POLICY "Service role full access on arc_external_submissions"
ON arc_external_submissions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

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

CREATE POLICY "Participants can insert arc_external_submissions"
ON arc_external_submissions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM arc_campaign_participants
    WHERE arc_campaign_participants.id = arc_external_submissions.participant_id
    AND arc_campaign_participants.profile_id = get_current_user_profile_id()
  )
);

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

-- =============================================================================
-- 10. DROP AND RECREATE RLS POLICIES FOR ARC_LEADERBOARD_REQUESTS
-- =============================================================================

DROP POLICY IF EXISTS "Service role full access on arc_leaderboard_requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Requester can insert own requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Requester can read own requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Super admin can read all requests" ON arc_leaderboard_requests;
DROP POLICY IF EXISTS "Super admin can update all requests" ON arc_leaderboard_requests;

CREATE POLICY "Service role full access on arc_leaderboard_requests"
ON arc_leaderboard_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Requester can insert own requests"
ON arc_leaderboard_requests FOR INSERT
WITH CHECK (
  requested_by = get_current_user_profile_id()
);

CREATE POLICY "Requester can read own requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  requested_by = get_current_user_profile_id()
);

CREATE POLICY "Super admin can read all requests"
ON arc_leaderboard_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);

CREATE POLICY "Super admin can update all requests"
ON arc_leaderboard_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = get_current_user_profile_id()
    AND real_roles @> ARRAY['super_admin']::text[]
  )
);


