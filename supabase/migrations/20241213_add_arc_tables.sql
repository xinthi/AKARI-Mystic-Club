-- Migration: Add ARC (creator arenas) tables
-- Purpose: Add project ARC settings, account managers, arenas, and arena creators
-- Date: 2024-12-13

-- =============================================================================
-- CREATE TABLE: project_arc_settings
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_arc_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  is_arc_enabled BOOLEAN NOT NULL DEFAULT false,
  tier TEXT NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic', 'pro', 'event_host')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'suspended')),
  security_status TEXT NOT NULL DEFAULT 'normal' CHECK (security_status IN ('normal', 'alert', 'clear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- CREATE TABLE: project_account_managers
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_account_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  role_label TEXT NOT NULL DEFAULT 'Account Manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, is_primary) WHERE is_primary = true
);

-- =============================================================================
-- CREATE TABLE: arenas
-- =============================================================================

CREATE TABLE IF NOT EXISTS arenas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'cancelled')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  reward_depth INTEGER NOT NULL DEFAULT 100,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- CREATE TABLE: arena_creators
-- =============================================================================

CREATE TABLE IF NOT EXISTS arena_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id UUID NOT NULL REFERENCES arenas(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  twitter_username TEXT NOT NULL,
  arc_points NUMERIC(18,4) NOT NULL DEFAULT 0,
  ring TEXT NOT NULL DEFAULT 'discovery' CHECK (ring IN ('core', 'momentum', 'discovery')),
  style TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arena_id, twitter_username)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_arenas_project_id ON arenas(project_id);
CREATE INDEX IF NOT EXISTS idx_arena_creators_arena_id ON arena_creators(arena_id);
CREATE INDEX IF NOT EXISTS idx_arena_creators_profile_id ON arena_creators(profile_id);

-- =============================================================================
-- TRIGGERS: Auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_project_arc_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_arc_settings_updated_at ON project_arc_settings;
CREATE TRIGGER trigger_project_arc_settings_updated_at
  BEFORE UPDATE ON project_arc_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_project_arc_settings_updated_at();

CREATE OR REPLACE FUNCTION update_project_account_managers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_account_managers_updated_at ON project_account_managers;
CREATE TRIGGER trigger_project_account_managers_updated_at
  BEFORE UPDATE ON project_account_managers
  FOR EACH ROW
  EXECUTE FUNCTION update_project_account_managers_updated_at();

CREATE OR REPLACE FUNCTION update_arenas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_arenas_updated_at ON arenas;
CREATE TRIGGER trigger_arenas_updated_at
  BEFORE UPDATE ON arenas
  FOR EACH ROW
  EXECUTE FUNCTION update_arenas_updated_at();

CREATE OR REPLACE FUNCTION update_arena_creators_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_arena_creators_updated_at ON arena_creators;
CREATE TRIGGER trigger_arena_creators_updated_at
  BEFORE UPDATE ON arena_creators
  FOR EACH ROW
  EXECUTE FUNCTION update_arena_creators_updated_at();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE project_arc_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_account_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE arenas ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_creators ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access on project_arc_settings"
ON project_arc_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on project_account_managers"
ON project_account_managers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arenas"
ON arenas
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access on arena_creators"
ON arena_creators
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
