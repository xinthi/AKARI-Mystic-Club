-- =============================================================================
-- Migration: Add Mystic Identity Fields to akari_users
-- Date: 2024-12-09
-- 
-- Adds:
-- - persona_type: 'individual' or 'company' (default 'individual')
-- - persona_tag: specific tag based on persona type (default null)
-- - telegram_connected: boolean flag (default false)
-- =============================================================================

-- Add persona_type column with check constraint
ALTER TABLE akari_users 
ADD COLUMN IF NOT EXISTS persona_type TEXT DEFAULT 'individual' 
CHECK (persona_type IN ('individual', 'company'));

-- Add persona_tag column with check constraint for valid values
-- For individuals: 'creator', 'investigator', 'investor', 'trader', 'contributor'
-- For companies: 'project', 'venture_capital', 'marketing', 'defi', 'dex', 'cex', 'ai', 'infra', 'l1', 'l2'
ALTER TABLE akari_users 
ADD COLUMN IF NOT EXISTS persona_tag TEXT DEFAULT NULL
CHECK (
  persona_tag IS NULL 
  OR persona_tag IN (
    -- Individual tags
    'creator', 'investigator', 'investor', 'trader', 'contributor',
    -- Company tags
    'project', 'venture_capital', 'marketing', 'defi', 'dex', 'cex', 'ai', 'infra', 'l1', 'l2'
  )
);

-- Add telegram_connected column
ALTER TABLE akari_users 
ADD COLUMN IF NOT EXISTS telegram_connected BOOLEAN DEFAULT false NOT NULL;

-- Create index for filtering by persona type
CREATE INDEX IF NOT EXISTS idx_akari_users_persona_type 
ON akari_users (persona_type) 
WHERE persona_type IS NOT NULL;

-- Create index for filtering by persona tag
CREATE INDEX IF NOT EXISTS idx_akari_users_persona_tag 
ON akari_users (persona_tag) 
WHERE persona_tag IS NOT NULL;

-- Update the view to include new fields
CREATE OR REPLACE VIEW akari_users_with_roles AS
SELECT 
  u.id,
  u.display_name,
  u.avatar_url,
  u.is_active,
  u.created_at,
  u.persona_type,
  u.persona_tag,
  u.telegram_connected,
  COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY['user']::text[]) as roles,
  (SELECT username FROM akari_user_identities WHERE user_id = u.id AND provider = 'x' LIMIT 1) as x_username
FROM akari_users u
LEFT JOIN akari_user_roles r ON r.user_id = u.id
GROUP BY u.id;

-- =============================================================================
-- COMMENT: Run this migration with:
--   psql $DATABASE_URL -f supabase/migrations/20241209_add_mystic_identity_fields.sql
-- Or via Supabase Dashboard -> SQL Editor
-- =============================================================================

