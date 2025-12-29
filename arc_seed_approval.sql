-- =============================================================================
-- ARC Approval Seed SQL for Local Dev
-- Project: mysticheros-main (a3256fab-bb9f-4f3a-ad60-bfc28e12dd46)
-- Purpose: Approve ARC access and unlock Option 2 (Normal Leaderboard)
-- =============================================================================

-- =============================================================================
-- TABLE SCHEMAS (from migrations)
-- =============================================================================

-- arc_project_access:
--   - id UUID PRIMARY KEY
--   - project_id UUID NOT NULL REFERENCES projects(id)
--   - applied_by_profile_id UUID REFERENCES profiles(id)
--   - applied_by_official_x BOOLEAN DEFAULT FALSE
--   - application_status TEXT NOT NULL DEFAULT 'pending' CHECK (IN ('pending', 'approved', 'rejected'))
--   - approved_by_profile_id UUID REFERENCES profiles(id)
--   - approved_at TIMESTAMPTZ
--   - notes TEXT
--   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   - updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- arc_project_features:
--   - id UUID PRIMARY KEY
--   - project_id UUID NOT NULL UNIQUE REFERENCES projects(id)
--   - option1_crm_unlocked BOOLEAN DEFAULT FALSE
--   - option2_normal_unlocked BOOLEAN DEFAULT FALSE
--   - option3_gamified_unlocked BOOLEAN DEFAULT FALSE
--   - unlocked_at TIMESTAMPTZ
--   - created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   - updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Project ID (PostgreSQL variable syntax - adjust for your SQL client)
-- For psql: \set project_id 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'
-- For other clients, replace :'project_id'::UUID with 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'::UUID

-- Project UUID constant (replace this with your project ID)
DO $$
DECLARE
  project_uuid UUID := 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'::UUID;
BEGIN
  -- 1. Insert/Update ARC Project Access (approve the project)
  -- First, try to update any existing row
  UPDATE arc_project_access
  SET
    application_status = 'approved',
    approved_at = COALESCE(approved_at, NOW()),
    updated_at = NOW(),
    notes = COALESCE(notes || E'\n' || 'Dev seed: Approved for local development', 'Dev seed: Approved for local development')
  WHERE project_id = project_uuid;

  -- If no row exists, insert a new one
  IF NOT EXISTS (SELECT 1 FROM arc_project_access WHERE project_id = project_uuid) THEN
    INSERT INTO arc_project_access (
      project_id,
      application_status,
      approved_at,
      notes
    )
    VALUES (
      project_uuid,
      'approved',
      NOW(),
      'Dev seed: Approved for local development'
    );
  END IF;

  -- 2. Insert/Update ARC Project Features (unlock Option 2)
  INSERT INTO arc_project_features (
    project_id,
    option2_normal_unlocked,
    unlocked_at
  )
  VALUES (
    project_uuid,
    TRUE,
    NOW()
  )
  ON CONFLICT (project_id)
  DO UPDATE SET
    option2_normal_unlocked = TRUE,
    unlocked_at = COALESCE(arc_project_features.unlocked_at, NOW()),
    updated_at = NOW();
END $$;

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================

-- Run this SELECT to confirm the seed worked:
SELECT 
  p.slug,
  p.id as project_id,
  apa.application_status as access_status,
  apa.approved_at,
  apf.option1_crm_unlocked,
  apf.option2_normal_unlocked,
  apf.option3_gamified_unlocked,
  apf.unlocked_at
FROM projects p
LEFT JOIN arc_project_access apa ON apa.project_id = p.id
LEFT JOIN arc_project_features apf ON apf.project_id = p.id
WHERE p.id = 'a3256fab-bb9f-4f3a-ad60-bfc28e12dd46'::UUID;

-- Expected result:
-- - slug: 'mysticheros-main'
-- - access_status: 'approved'
-- - option2_normal_unlocked: TRUE
-- - approved_at: current timestamp
-- - unlocked_at: current timestamp

