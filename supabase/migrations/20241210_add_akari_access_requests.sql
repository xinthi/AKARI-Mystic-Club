-- =============================================================================
-- Migration: Add akari_access_requests table for feature access requests
-- Date: 2024-12-10
-- 
-- Allows users to request access to premium features like Deep Explorer
-- and Institutional Plus. Super admins can approve or reject requests.
-- =============================================================================

-- Create the akari_access_requests table
CREATE TABLE IF NOT EXISTS akari_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  requested_plan TEXT,               -- e.g. "institutional", "institutional_plus"
  justification TEXT,                -- user can explain why they need it
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES akari_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_akari_access_requests_user
  ON akari_access_requests (user_id);

-- Index for fast lookups by status
CREATE INDEX IF NOT EXISTS idx_akari_access_requests_status
  ON akari_access_requests (status);

-- Index for fast lookups by feature_key
CREATE INDEX IF NOT EXISTS idx_akari_access_requests_feature_key
  ON akari_access_requests (feature_key);

-- Enable RLS
ALTER TABLE akari_access_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything. We will add more fine grained policies later.
CREATE POLICY "Service role full access on akari_access_requests"
ON akari_access_requests FOR ALL
USING (true)
WITH CHECK (true);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_akari_access_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS akari_access_requests_updated_at ON akari_access_requests;
CREATE TRIGGER akari_access_requests_updated_at
  BEFORE UPDATE ON akari_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_akari_access_requests_updated_at();

-- =============================================================================
-- COMMENT: Run this migration with:
--   psql $DATABASE_URL -f supabase/migrations/20241210_add_akari_access_requests.sql
-- Or via Supabase Dashboard -> SQL Editor
-- =============================================================================

