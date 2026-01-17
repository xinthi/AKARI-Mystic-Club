-- ARC Brand + Quest approvals (Superadmin)
-- Purpose: Require verification for brands and approval for quest launches
-- Date: 2026-01-17

-- Brand verification status
ALTER TABLE IF EXISTS brand_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Quest launch approval status
ALTER TABLE IF EXISTS brand_campaigns
  ADD COLUMN IF NOT EXISTS launch_status TEXT
    NOT NULL DEFAULT 'pending'
    CHECK (launch_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS launch_requested_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS launch_approved_at TIMESTAMPTZ;
