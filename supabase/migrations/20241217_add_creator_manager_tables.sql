-- Migration: Add Creator Manager v1 tables
-- Purpose: Enable projects to manage creators with deals, missions, and internal ranking
-- Date: 2024-12-17

-- =============================================================================
-- 1. CREATOR_MANAGER_PROGRAMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'hybrid')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_programs_project ON creator_manager_programs(project_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_programs_created_by ON creator_manager_programs(created_by);
CREATE INDEX IF NOT EXISTS idx_creator_manager_programs_status ON creator_manager_programs(status);
CREATE INDEX IF NOT EXISTS idx_creator_manager_programs_visibility ON creator_manager_programs(visibility);

-- =============================================================================
-- 2. CREATOR_MANAGER_DEALS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  internal_label TEXT NOT NULL, -- e.g. 'Deal 1', 'Deal 2', 'Deal 3'
  description TEXT, -- internal notes only, not shown to creators
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_deals_program ON creator_manager_deals(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_deals_default ON creator_manager_deals(program_id, is_default) WHERE is_default = true;

-- =============================================================================
-- 3. CREATOR_MANAGER_CREATORS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES creator_manager_deals(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  arc_points INT NOT NULL DEFAULT 0, -- ARC earned inside this Creator Manager only
  xp INT NOT NULL DEFAULT 0, -- XP for gamification later
  class TEXT, -- e.g. 'Vanguard', 'Analyst', 'Amplifier', 'Explorer'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, creator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_creators_program ON creator_manager_creators(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_creators_profile ON creator_manager_creators(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_creators_status ON creator_manager_creators(program_id, status);
CREATE INDEX IF NOT EXISTS idx_creator_manager_creators_deal ON creator_manager_creators(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creator_manager_creators_arc_points ON creator_manager_creators(program_id, arc_points DESC);

-- =============================================================================
-- 4. CREATOR_MANAGER_MISSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reward_arc_min INT DEFAULT 0,
  reward_arc_max INT DEFAULT 0,
  reward_xp INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_missions_program ON creator_manager_missions(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_missions_active ON creator_manager_missions(program_id, is_active, order_index) WHERE is_active = true;

-- =============================================================================
-- 5. CREATOR_MANAGER_MISSION_PROGRESS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS creator_manager_mission_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES creator_manager_missions(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES creator_manager_programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'approved', 'rejected')),
  last_update_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mission_id, creator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_mission ON creator_manager_mission_progress(mission_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_creator ON creator_manager_mission_progress(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_program ON creator_manager_mission_progress(program_id);
CREATE INDEX IF NOT EXISTS idx_creator_manager_mission_progress_status ON creator_manager_mission_progress(program_id, creator_profile_id, status);

-- =============================================================================
-- 6. TRIGGERS: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_creator_manager_programs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creator_manager_programs_updated_at ON creator_manager_programs;
CREATE TRIGGER trigger_creator_manager_programs_updated_at
  BEFORE UPDATE ON creator_manager_programs
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_manager_programs_updated_at();

CREATE OR REPLACE FUNCTION update_creator_manager_creators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creator_manager_creators_updated_at ON creator_manager_creators;
CREATE TRIGGER trigger_creator_manager_creators_updated_at
  BEFORE UPDATE ON creator_manager_creators
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_manager_creators_updated_at();

-- =============================================================================
-- 7. RLS POLICIES
-- =============================================================================

ALTER TABLE creator_manager_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_manager_mission_progress ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on creator_manager_programs"
ON creator_manager_programs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_deals"
ON creator_manager_deals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_creators"
ON creator_manager_creators
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_missions"
ON creator_manager_missions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on creator_manager_mission_progress"
ON creator_manager_mission_progress
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Public read access for programs (based on visibility)
-- Note: More granular policies can be added later for specific access control
CREATE POLICY "Allow public read on public creator_manager_programs"
ON creator_manager_programs
FOR SELECT
USING (visibility IN ('public', 'hybrid'));

-- =============================================================================
-- NOTES
-- =============================================================================
-- TODO: Add more granular RLS policies based on project_team_members roles
-- TODO: Add policies for creators to see their own data
-- TODO: Add policies for project admins/moderators to manage their programs

