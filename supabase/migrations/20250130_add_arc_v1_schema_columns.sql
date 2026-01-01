-- =============================================================================
-- Migration: Add ARC v1 Schema Columns
-- Purpose: Add missing columns required by ARC v1 APIs
-- Date: 2025-01-30
-- =============================================================================
-- 
-- This migration adds:
-- 1. product_type, start_at, end_at, notes to arc_leaderboard_requests
-- 2. Module enablement columns to arc_project_features (leaderboard, gamefi, crm)
-- =============================================================================

-- =============================================================================
-- 1. ARC_LEADERBOARD_REQUESTS: Add product type and date columns
-- =============================================================================

-- Add product_type column
ALTER TABLE arc_leaderboard_requests
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('ms', 'gamefi', 'crm'));

-- Add date columns
ALTER TABLE arc_leaderboard_requests
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

-- Add notes column (separate from existing justification field for backwards compatibility)
ALTER TABLE arc_leaderboard_requests
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index for product_type filtering
CREATE INDEX IF NOT EXISTS idx_arc_leaderboard_requests_product_type
  ON arc_leaderboard_requests(product_type)
  WHERE product_type IS NOT NULL;

-- =============================================================================
-- 2. ARC_PROJECT_FEATURES: Add module enablement columns
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
-- COMMENTS: Documentation
-- =============================================================================

COMMENT ON COLUMN arc_leaderboard_requests.product_type IS 
  'Product type requested: ms (Mindshare/Leaderboard), gamefi (Gamified), or crm (Creator Manager)';

COMMENT ON COLUMN arc_leaderboard_requests.start_at IS 
  'Start date/time for the requested product access period';

COMMENT ON COLUMN arc_leaderboard_requests.end_at IS 
  'End date/time for the requested product access period';

COMMENT ON COLUMN arc_leaderboard_requests.notes IS 
  'Additional notes from the requester (separate from justification for backwards compatibility)';

COMMENT ON COLUMN arc_project_features.leaderboard_enabled IS 
  'Whether Leaderboard module is enabled for this project';

COMMENT ON COLUMN arc_project_features.leaderboard_start_at IS 
  'Start date/time for Leaderboard module';

COMMENT ON COLUMN arc_project_features.leaderboard_end_at IS 
  'End date/time for Leaderboard module';

COMMENT ON COLUMN arc_project_features.gamefi_enabled IS 
  'Whether GameFi module is enabled for this project';

COMMENT ON COLUMN arc_project_features.gamefi_start_at IS 
  'Start date/time for GameFi module';

COMMENT ON COLUMN arc_project_features.gamefi_end_at IS 
  'End date/time for GameFi module';

COMMENT ON COLUMN arc_project_features.crm_enabled IS 
  'Whether CRM (Creator Manager) module is enabled for this project';

COMMENT ON COLUMN arc_project_features.crm_start_at IS 
  'Start date/time for CRM module';

COMMENT ON COLUMN arc_project_features.crm_end_at IS 
  'End date/time for CRM module';

COMMENT ON COLUMN arc_project_features.crm_visibility IS 
  'CRM leaderboard visibility: private, public, or hybrid';
