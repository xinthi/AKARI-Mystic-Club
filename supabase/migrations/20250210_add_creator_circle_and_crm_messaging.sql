-- =============================================================================
-- Migration: Add Creator Circle and CRM Messaging System
-- Purpose: Enable creators to build networks and projects to message creators
-- Date: 2025-02-10
-- =============================================================================
-- This migration creates:
-- - creator_circles: Bidirectional connections between creators
-- - crm_messages: Messages from projects to creators
-- - crm_proposals: Deal proposals with prices and counter-offers
-- - project_preferred_creators: Projects' preferred creator lists
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. CREATOR_CIRCLES
-- Bidirectional connections between creators (mutual circles)
-- =============================================================================
CREATE TABLE IF NOT EXISTS creator_circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  circle_member_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'removed')),
  initiated_by_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure creator cannot add themselves
  CONSTRAINT creator_circles_no_self CHECK (creator_profile_id != circle_member_profile_id),
  
  -- Unique constraint: one connection per pair (order-independent)
  -- Use a unique index instead to handle bidirectional uniqueness
  UNIQUE(creator_profile_id, circle_member_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_circles_creator ON creator_circles(creator_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_circles_member ON creator_circles(circle_member_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_circles_initiated_by ON creator_circles(initiated_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_creator_circles_pending ON creator_circles(creator_profile_id, status) WHERE status = 'pending';

-- Function to find bidirectional connection (if A->B exists, check B->A)
CREATE OR REPLACE FUNCTION get_creator_circle_status(
  p_creator_id UUID,
  p_member_id UUID
) RETURNS TABLE (
  id UUID,
  status TEXT,
  initiated_by_profile_id UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT cc.id, cc.status, cc.initiated_by_profile_id, cc.created_at
  FROM creator_circles cc
  WHERE (cc.creator_profile_id = p_creator_id AND cc.circle_member_profile_id = p_member_id)
     OR (cc.creator_profile_id = p_member_id AND cc.circle_member_profile_id = p_creator_id)
  ORDER BY cc.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. CRM_MESSAGES
-- Messages from projects to creators (promotional requests)
-- =============================================================================
CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message_body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'promotional'
    CHECK (message_type IN ('promotional', 'invitation', 'announcement')),
  has_proposal BOOLEAN DEFAULT FALSE, -- True if this message includes a proposal
  proposal_id UUID, -- Reference to crm_proposals if has_proposal = true
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  sent_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  
  -- Note: Validation that recipient is a creator (profile_type = 'personal' or NULL)
  -- is enforced at the application level in the API endpoints
);

CREATE INDEX IF NOT EXISTS idx_crm_messages_project ON crm_messages(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_creator ON crm_messages(creator_profile_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_unread ON crm_messages(creator_profile_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_crm_messages_proposal ON crm_messages(proposal_id) WHERE proposal_id IS NOT NULL;

-- =============================================================================
-- 3. CRM_PROPOSALS
-- Deal proposals with prices (can be accepted or countered)
-- =============================================================================
CREATE TABLE IF NOT EXISTS crm_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES crm_messages(id) ON DELETE SET NULL,
  proposal_type TEXT NOT NULL DEFAULT 'marketing'
    CHECK (proposal_type IN ('marketing', 'partnership', 'ambassador', 'content')),
  initial_price_amount DECIMAL(18, 2) NOT NULL,
  initial_price_currency TEXT NOT NULL DEFAULT 'USD',
  proposed_price_amount DECIMAL(18, 2), -- Counter-offer from creator
  proposed_price_currency TEXT, -- Counter-offer currency
  campaign_id UUID REFERENCES arc_campaigns(id) ON DELETE SET NULL, -- Link to CRM campaign if accepted
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'countered', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  notes TEXT, -- Additional terms/details
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure positive price amounts
  CONSTRAINT crm_proposals_positive_price CHECK (initial_price_amount > 0),
  CONSTRAINT crm_proposals_counter_positive CHECK (proposed_price_amount IS NULL OR proposed_price_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_project ON crm_proposals(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_creator ON crm_proposals(creator_profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_pending ON crm_proposals(creator_profile_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_proposals_campaign ON crm_proposals(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_proposals_expires ON crm_proposals(expires_at) WHERE expires_at IS NOT NULL;

-- =============================================================================
-- 4. PROJECT_PREFERRED_CREATORS
-- Projects' preferred creator lists for bulk messaging
-- =============================================================================
CREATE TABLE IF NOT EXISTS project_preferred_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  list_name TEXT, -- Optional: organize creators into lists (e.g., "Tier 1", "Micro-influencers")
  notes TEXT, -- Internal notes about why this creator is preferred
  added_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique: one entry per project-creator pair
  UNIQUE(project_id, creator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_preferred_creators_project ON project_preferred_creators(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_preferred_creators_creator ON project_preferred_creators(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_project_preferred_creators_list ON project_preferred_creators(project_id, list_name) WHERE list_name IS NOT NULL;

-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE creator_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_preferred_creators ENABLE ROW LEVEL SECURITY;

-- Service role: Full access (for API routes)
CREATE POLICY "Service role full access on creator_circles"
ON creator_circles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on crm_messages"
ON crm_messages FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on crm_proposals"
ON crm_proposals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on project_preferred_creators"
ON project_preferred_creators FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Creator Circles: Creators can view their own connections
CREATE POLICY "Creators can view their circles"
ON creator_circles FOR SELECT
TO authenticated
USING (
  creator_profile_id = (SELECT get_current_user_profile_id())
  OR circle_member_profile_id = (SELECT get_current_user_profile_id())
);

-- Creator Circles: Creators can create connections (send requests)
CREATE POLICY "Creators can create circle requests"
ON creator_circles FOR INSERT
TO authenticated
WITH CHECK (
  initiated_by_profile_id = (SELECT get_current_user_profile_id())
  AND (
    creator_profile_id = (SELECT get_current_user_profile_id())
    OR circle_member_profile_id = (SELECT get_current_user_profile_id())
  )
);

-- Creator Circles: Recipients can accept/reject requests
CREATE POLICY "Creators can update pending requests"
ON creator_circles FOR UPDATE
TO authenticated
USING (
  circle_member_profile_id = (SELECT get_current_user_profile_id())
  AND status = 'pending'
)
WITH CHECK (
  circle_member_profile_id = (SELECT get_current_user_profile_id())
);

-- Creator Circles: Creators can remove their own connections
CREATE POLICY "Creators can remove their connections"
ON creator_circles FOR DELETE
TO authenticated
USING (
  creator_profile_id = (SELECT get_current_user_profile_id())
  OR circle_member_profile_id = (SELECT get_current_user_profile_id())
);

-- CRM Messages: Creators can view their messages
CREATE POLICY "Creators can view their messages"
ON crm_messages FOR SELECT
TO authenticated
USING (
  creator_profile_id = (SELECT get_current_user_profile_id())
);

-- CRM Messages: Projects can send messages (project admins/moderators)
CREATE POLICY "Project admins can send messages"
ON crm_messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = crm_messages.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
);

-- CRM Messages: Projects can update their sent messages
CREATE POLICY "Project admins can update their messages"
ON crm_messages FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = crm_messages.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
);

-- CRM Messages: Creators can mark as read
CREATE POLICY "Creators can mark messages as read"
ON crm_messages FOR UPDATE
TO authenticated
USING (creator_profile_id = (SELECT get_current_user_profile_id()))
WITH CHECK (creator_profile_id = (SELECT get_current_user_profile_id()));

-- CRM Proposals: Creators can view their proposals
CREATE POLICY "Creators can view their proposals"
ON crm_proposals FOR SELECT
TO authenticated
USING (
  creator_profile_id = (SELECT get_current_user_profile_id())
);

-- CRM Proposals: Projects can view their sent proposals
CREATE POLICY "Projects can view their proposals"
ON crm_proposals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = crm_proposals.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
);

-- CRM Proposals: Projects can create proposals
CREATE POLICY "Project admins can create proposals"
ON crm_proposals FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = crm_proposals.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
  AND EXISTS (
    SELECT 1 FROM arc_project_features apf
    WHERE apf.project_id = crm_proposals.project_id
    AND apf.option1_crm_unlocked = true
  )
);

-- CRM Proposals: Creators can accept/counter/reject proposals
CREATE POLICY "Creators can update their proposals"
ON crm_proposals FOR UPDATE
TO authenticated
USING (creator_profile_id = (SELECT get_current_user_profile_id()))
WITH CHECK (creator_profile_id = (SELECT get_current_user_profile_id()));

-- Project Preferred Creators: Projects can view their lists
CREATE POLICY "Project admins can view preferred creators"
ON project_preferred_creators FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = project_preferred_creators.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
);

-- Project Preferred Creators: Projects can manage their lists
CREATE POLICY "Project admins can manage preferred creators"
ON project_preferred_creators FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = project_preferred_creators.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM project_team_members ptm
    WHERE ptm.project_id = project_preferred_creators.project_id
    AND ptm.profile_id = (SELECT get_current_user_profile_id())
    AND ptm.role IN ('admin', 'moderator')
  )
  AND EXISTS (
    SELECT 1 FROM arc_project_features apf
    WHERE apf.project_id = project_preferred_creators.project_id
    AND apf.option1_crm_unlocked = true
  )
);

-- Super admins: Full access to all
CREATE POLICY "Super admins full access on creator_circles"
ON creator_circles FOR ALL
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

CREATE POLICY "Super admins full access on crm_messages"
ON crm_messages FOR ALL
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

CREATE POLICY "Super admins full access on crm_proposals"
ON crm_proposals FOR ALL
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

CREATE POLICY "Super admins full access on project_preferred_creators"
ON project_preferred_creators FOR ALL
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
-- 6. FUNCTIONS & TRIGGERS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_creator_circles_updated_at
BEFORE UPDATE ON creator_circles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_messages_updated_at
BEFORE UPDATE ON crm_messages
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crm_proposals_updated_at
BEFORE UPDATE ON crm_proposals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_preferred_creators_updated_at
BEFORE UPDATE ON project_preferred_creators
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger: When proposal is accepted, link creator to campaign if specified
CREATE OR REPLACE FUNCTION handle_proposal_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    NEW.accepted_at = NOW();
    
    -- If campaign_id is set, add creator as participant
    IF NEW.campaign_id IS NOT NULL THEN
      INSERT INTO arc_campaign_participants (
        campaign_id,
        profile_id,
        status,
        joined_at
      )
      VALUES (
        NEW.campaign_id,
        NEW.creator_profile_id,
        'active',
        NOW()
      )
      ON CONFLICT (campaign_id, profile_id) DO UPDATE
      SET status = 'active',
          joined_at = NOW();
    END IF;
  END IF;
  
  IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    NEW.rejected_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_proposal_acceptance
BEFORE UPDATE ON crm_proposals
FOR EACH ROW
EXECUTE FUNCTION handle_proposal_acceptance();

-- Trigger: When message is marked as read
CREATE OR REPLACE FUNCTION handle_message_read()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
    NEW.read_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_message_read
BEFORE UPDATE ON crm_messages
FOR EACH ROW
EXECUTE FUNCTION handle_message_read();

-- =============================================================================
-- 7. COMMENTS
-- =============================================================================

COMMENT ON TABLE creator_circles IS 'Bidirectional connections between creators (mutual circles)';
COMMENT ON TABLE crm_messages IS 'Messages from projects to creators (promotional requests)';
COMMENT ON TABLE crm_proposals IS 'Deal proposals with prices (can be accepted or countered)';
COMMENT ON TABLE project_preferred_creators IS 'Projects preferred creator lists for bulk messaging';
