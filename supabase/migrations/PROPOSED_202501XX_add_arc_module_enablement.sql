-- =============================================================================
-- Migration: Add ARC Module Enablement to arc_project_features
-- Purpose: Support combinable modules (Leaderboard, GameFi, CRM) with date ranges
-- Date: 2025-01-XX (PROPOSED - DO NOT APPLY WITHOUT APPROVAL)
-- Status: PROPOSAL
-- =============================================================================
--
-- IMPORTANT: This migration is a PROPOSAL for Task 1.
-- DO NOT apply until:
-- 1. Specification is reviewed and approved
-- 2. Migration plan is approved
-- 3. Backward compatibility strategy is confirmed
--
-- This migration adds module enablement columns to arc_project_features table,
-- allowing multiple modules to be enabled simultaneously with independent date ranges.
--
-- =============================================================================
-- BACKWARD COMPATIBILITY
-- =============================================================================
--
-- This migration does NOT break existing code:
-- - All new columns have default values (all modules disabled)
-- - Existing code continues to use projects.arc_access_level during migration
-- - New code should prefer arc_project_features for module enablement
-- - Migration path: Projects with arc_access_level != 'none' should have
--   corresponding modules enabled in arc_project_features (migration script TBD)
--
-- =============================================================================
-- CHANGES
-- =============================================================================

-- Add Leaderboard module columns
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leaderboard_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leaderboard_end_at TIMESTAMPTZ;

-- Add GameFi module columns
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS gamefi_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gamefi_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gamefi_end_at TIMESTAMPTZ;

-- Add CRM module columns (including visibility)
ALTER TABLE arc_project_features
  ADD COLUMN IF NOT EXISTS crm_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crm_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (crm_visibility IN ('private', 'public', 'hybrid'));

-- =============================================================================
-- CONSTRAINTS: Date Validation
-- =============================================================================
--
-- Rule: If {module}_enabled = true, then {module}_start_at and {module}_end_at must be NOT NULL
-- Rule: {module}_end_at > {module}_start_at

-- Leaderboard constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_leaderboard_dates_valid
    CHECK (
      (leaderboard_enabled = false) OR
      (leaderboard_start_at IS NOT NULL AND 
       leaderboard_end_at IS NOT NULL AND 
       leaderboard_end_at > leaderboard_start_at)
    );

-- GameFi constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_gamefi_dates_valid
    CHECK (
      (gamefi_enabled = false) OR
      (gamefi_start_at IS NOT NULL AND 
       gamefi_end_at IS NOT NULL AND 
       gamefi_end_at > gamefi_start_at)
    );

-- CRM constraint
ALTER TABLE arc_project_features
  ADD CONSTRAINT chk_crm_dates_valid
    CHECK (
      (crm_enabled = false) OR
      (crm_start_at IS NOT NULL AND 
       crm_end_at IS NOT NULL AND 
       crm_end_at > crm_start_at)
    );

-- =============================================================================
-- INDEXES: Query Performance
-- =============================================================================
--
-- Indexes for efficient queries filtering by enabled modules and date ranges

CREATE INDEX IF NOT EXISTS idx_arc_project_features_leaderboard_enabled 
  ON arc_project_features(leaderboard_enabled, leaderboard_start_at, leaderboard_end_at) 
  WHERE leaderboard_enabled = true;

CREATE INDEX IF NOT EXISTS idx_arc_project_features_gamefi_enabled 
  ON arc_project_features(gamefi_enabled, gamefi_start_at, gamefi_end_at) 
  WHERE gamefi_enabled = true;

CREATE INDEX IF NOT EXISTS idx_arc_project_features_crm_enabled 
  ON arc_project_features(crm_enabled, crm_start_at, crm_end_at) 
  WHERE crm_enabled = true;

-- =============================================================================
-- COMMENTS: Documentation
-- =============================================================================

COMMENT ON COLUMN arc_project_features.leaderboard_enabled IS 
  'Whether Leaderboard module is enabled for this project';

COMMENT ON COLUMN arc_project_features.leaderboard_start_at IS 
  'Start date/time for Leaderboard module. Required if leaderboard_enabled = true';

COMMENT ON COLUMN arc_project_features.leaderboard_end_at IS 
  'End date/time for Leaderboard module. Must be > leaderboard_start_at. Required if leaderboard_enabled = true';

COMMENT ON COLUMN arc_project_features.gamefi_enabled IS 
  'Whether GameFi module is enabled for this project';

COMMENT ON COLUMN arc_project_features.gamefi_start_at IS 
  'Start date/time for GameFi module. Required if gamefi_enabled = true';

COMMENT ON COLUMN arc_project_features.gamefi_end_at IS 
  'End date/time for GameFi module. Must be > gamefi_start_at. Required if gamefi_enabled = true';

COMMENT ON COLUMN arc_project_features.crm_enabled IS 
  'Whether CRM (Creator Manager) module is enabled for this project';

COMMENT ON COLUMN arc_project_features.crm_start_at IS 
  'Start date/time for CRM module. Required if crm_enabled = true';

COMMENT ON COLUMN arc_project_features.crm_end_at IS 
  'End date/time for CRM module. Must be > crm_start_at. Required if crm_enabled = true';

COMMENT ON COLUMN arc_project_features.crm_visibility IS 
  'CRM visibility mode: private (only participants+admins), public (creators can apply), hybrid (public ranks, private metrics)';

-- =============================================================================
-- ROLLBACK SCRIPT (For Reference - DO NOT RUN UNLESS ROLLBACK NEEDED)
-- =============================================================================
--
-- If rollback is needed, run the following in reverse order:
--
-- DROP INDEX IF EXISTS idx_arc_project_features_crm_enabled;
-- DROP INDEX IF EXISTS idx_arc_project_features_gamefi_enabled;
-- DROP INDEX IF EXISTS idx_arc_project_features_leaderboard_enabled;
--
-- ALTER TABLE arc_project_features DROP CONSTRAINT IF EXISTS chk_crm_dates_valid;
-- ALTER TABLE arc_project_features DROP CONSTRAINT IF EXISTS chk_gamefi_dates_valid;
-- ALTER TABLE arc_project_features DROP CONSTRAINT IF EXISTS chk_leaderboard_dates_valid;
--
-- ALTER TABLE arc_project_features
--   DROP COLUMN IF EXISTS crm_visibility,
--   DROP COLUMN IF EXISTS crm_end_at,
--   DROP COLUMN IF EXISTS crm_start_at,
--   DROP COLUMN IF EXISTS crm_enabled,
--   DROP COLUMN IF EXISTS gamefi_end_at,
--   DROP COLUMN IF EXISTS gamefi_start_at,
--   DROP COLUMN IF EXISTS gamefi_enabled,
--   DROP COLUMN IF EXISTS leaderboard_end_at,
--   DROP COLUMN IF EXISTS leaderboard_start_at,
--   DROP COLUMN IF EXISTS leaderboard_enabled;
--
-- =============================================================================
-- END OF MIGRATION
-- =============================================================================

