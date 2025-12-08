-- =============================================================================
-- AKARI Mystic Club - Authentication & Authorization Schema
-- 
-- This creates the tables needed for the auth system:
-- - akari_users: Core user records
-- - akari_user_identities: Links to OAuth providers (X, Telegram)
-- - akari_user_roles: Role assignments
-- - akari_user_feature_grants: Time-limited feature access
-- - akari_user_sessions: Session management
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- AKARI_USERS - Core user table
-- =============================================================================
CREATE TABLE IF NOT EXISTS akari_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_name TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_akari_users_active 
  ON akari_users (is_active) 
  WHERE is_active = true;

-- =============================================================================
-- AKARI_USER_IDENTITIES - OAuth provider links
-- =============================================================================
CREATE TABLE IF NOT EXISTS akari_user_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('x', 'telegram')),
  provider_user_id TEXT NOT NULL,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each provider/user_id combination must be unique
  CONSTRAINT akari_user_identities_provider_unique UNIQUE (provider, provider_user_id)
);

-- Index for fast lookup by provider + user_id
CREATE INDEX IF NOT EXISTS idx_akari_user_identities_provider 
  ON akari_user_identities (provider, provider_user_id);

-- Index for finding all identities of a user
CREATE INDEX IF NOT EXISTS idx_akari_user_identities_user 
  ON akari_user_identities (user_id);

-- =============================================================================
-- AKARI_USER_ROLES - Role assignments
-- =============================================================================
CREATE TABLE IF NOT EXISTS akari_user_roles (
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'analyst', 'admin', 'super_admin')),
  
  -- A user can have the same role only once
  PRIMARY KEY (user_id, role)
);

-- Index for finding users with specific roles
CREATE INDEX IF NOT EXISTS idx_akari_user_roles_role 
  ON akari_user_roles (role);

-- =============================================================================
-- AKARI_USER_FEATURE_GRANTS - Time-limited feature access
-- =============================================================================
CREATE TABLE IF NOT EXISTS akari_user_feature_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES akari_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding grants by user
CREATE INDEX IF NOT EXISTS idx_akari_user_feature_grants_user 
  ON akari_user_feature_grants (user_id);

-- Index for finding active grants
CREATE INDEX IF NOT EXISTS idx_akari_user_feature_grants_active 
  ON akari_user_feature_grants (user_id, feature_key) 
  WHERE (starts_at IS NULL OR starts_at <= NOW()) 
    AND (ends_at IS NULL OR ends_at >= NOW());

-- =============================================================================
-- AKARI_USER_SESSIONS - Session management
-- =============================================================================
CREATE TABLE IF NOT EXISTS akari_user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_akari_user_sessions_token 
  ON akari_user_sessions (session_token);

-- Index for cleaning up expired sessions
CREATE INDEX IF NOT EXISTS idx_akari_user_sessions_expires 
  ON akari_user_sessions (expires_at);

-- =============================================================================
-- HELPFUL VIEWS
-- =============================================================================

-- View: Users with their roles
CREATE OR REPLACE VIEW akari_users_with_roles AS
SELECT 
  u.id,
  u.display_name,
  u.avatar_url,
  u.is_active,
  u.created_at,
  COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), ARRAY['user']::text[]) as roles,
  (SELECT username FROM akari_user_identities WHERE user_id = u.id AND provider = 'x' LIMIT 1) as x_username
FROM akari_users u
LEFT JOIN akari_user_roles r ON r.user_id = u.id
GROUP BY u.id;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE akari_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE akari_user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE akari_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE akari_user_feature_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE akari_user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (used by backend)
-- Note: These policies allow the service role to bypass RLS
CREATE POLICY "Service role full access on akari_users" 
  ON akari_users FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role full access on akari_user_identities" 
  ON akari_user_identities FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role full access on akari_user_roles" 
  ON akari_user_roles FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role full access on akari_user_feature_grants" 
  ON akari_user_feature_grants FOR ALL 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Service role full access on akari_user_sessions" 
  ON akari_user_sessions FOR ALL 
  USING (true) 
  WITH CHECK (true);

-- =============================================================================
-- SAMPLE DATA - Uncomment to create test users
-- =============================================================================

-- Create a super admin user (replace with your X user ID)
-- INSERT INTO akari_users (display_name, avatar_url, is_active)
-- VALUES ('Muaz', 'https://pbs.twimg.com/profile_images/...', true)
-- ON CONFLICT DO NOTHING
-- RETURNING id;

-- Assign super_admin role (use the returned ID from above)
-- INSERT INTO akari_user_roles (user_id, role)
-- VALUES ('YOUR-USER-UUID-HERE', 'super_admin')
-- ON CONFLICT DO NOTHING;

