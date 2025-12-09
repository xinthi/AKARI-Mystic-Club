-- =============================================================================
-- Add Discount Columns to Feature Grants
-- =============================================================================
-- This migration adds discount_percent and discount_note columns to
-- akari_user_feature_grants table for super admin control of pricing.
-- =============================================================================

-- Add discount_percent column (0-100, default 0)
ALTER TABLE akari_user_feature_grants
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0 
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

-- Add discount_note column (optional text field for internal notes)
ALTER TABLE akari_user_feature_grants
  ADD COLUMN IF NOT EXISTS discount_note TEXT;

-- Add comment for documentation
COMMENT ON COLUMN akari_user_feature_grants.discount_percent IS 'Discount percentage (0-100) for this feature grant. 0 = no discount, 100 = free.';
COMMENT ON COLUMN akari_user_feature_grants.discount_note IS 'Internal note explaining why this discount exists (optional).';

