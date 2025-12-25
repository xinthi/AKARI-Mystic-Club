-- =============================================================================
-- Migration: Add ARC Pricing and Billing Tables
-- Purpose: Track pricing for ARC leaderboard approvals and billing
-- Date: 2025-01-26
-- =============================================================================

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ARC_PRICING
-- Stores pricing configuration for different ARC access levels
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_level TEXT NOT NULL UNIQUE CHECK (access_level IN ('creator_manager', 'leaderboard', 'gamified')),
  base_price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Insert default pricing
INSERT INTO arc_pricing (access_level, base_price_usd, description) VALUES
  ('creator_manager', 0.00, 'CRM/Creator Manager access'),
  ('leaderboard', 0.00, 'Normal Leaderboard access'),
  ('gamified', 0.00, 'Gamified Leaderboard access')
ON CONFLICT (access_level) DO NOTHING;

-- =============================================================================
-- 2. ARC_BILLING_RECORDS
-- Tracks billing for approved ARC requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS arc_billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES arc_leaderboard_requests(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL CHECK (access_level IN ('creator_manager', 'leaderboard', 'gamified')),
  base_price_usd NUMERIC(10, 2) NOT NULL,
  discount_percent INTEGER DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  final_price_usd NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'waived', 'refunded')),
  payment_method TEXT,
  payment_reference TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_arc_pricing_access_level ON arc_pricing(access_level);
CREATE INDEX IF NOT EXISTS idx_arc_pricing_active ON arc_pricing(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_arc_billing_request_id ON arc_billing_records(request_id);
CREATE INDEX IF NOT EXISTS idx_arc_billing_project_id ON arc_billing_records(project_id);
CREATE INDEX IF NOT EXISTS idx_arc_billing_payment_status ON arc_billing_records(payment_status);
CREATE INDEX IF NOT EXISTS idx_arc_billing_created_at ON arc_billing_records(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE arc_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE arc_billing_records ENABLE ROW LEVEL SECURITY;

-- Pricing: Only super admins can read/write
CREATE POLICY "Super admins can manage pricing"
  ON arc_pricing
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.real_roles @> ARRAY['super_admin']::text[] OR EXISTS (
        SELECT 1 FROM akari_user_roles aur
        WHERE aur.user_id = (SELECT user_id FROM akari_user_identities WHERE username = p.username LIMIT 1)
        AND aur.role = 'super_admin'
      ))
    )
  );

-- Billing records: Super admins can read all, project owners can read their own
CREATE POLICY "Super admins can manage all billing records"
  ON arc_billing_records
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (p.real_roles @> ARRAY['super_admin']::text[] OR EXISTS (
        SELECT 1 FROM akari_user_roles aur
        WHERE aur.user_id = (SELECT user_id FROM akari_user_identities WHERE username = p.username LIMIT 1)
        AND aur.role = 'super_admin'
      ))
    )
  );

CREATE POLICY "Project owners can view their billing records"
  ON arc_billing_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      WHERE pr.id = arc_billing_records.project_id
      AND pr.claimed_by = auth.uid()
    )
  );

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to get current pricing for an access level
CREATE OR REPLACE FUNCTION get_arc_pricing(p_access_level TEXT)
RETURNS TABLE (
  base_price_usd NUMERIC(10, 2),
  currency TEXT,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ap.base_price_usd,
    ap.currency,
    ap.description
  FROM arc_pricing ap
  WHERE ap.access_level = p_access_level
  AND ap.is_active = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate final price with discount
CREATE OR REPLACE FUNCTION calculate_arc_price(
  p_base_price NUMERIC(10, 2),
  p_discount_percent INTEGER DEFAULT 0
)
RETURNS NUMERIC(10, 2) AS $$
BEGIN
  RETURN p_base_price * (1 - (p_discount_percent::NUMERIC / 100));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

