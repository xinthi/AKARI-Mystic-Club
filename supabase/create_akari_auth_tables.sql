-- =============================================================================
-- AKARI Mystic Club - Authentication Tables
-- Run this in Supabase SQL Editor to create the required tables
-- =============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS akari_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  display_name TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true
);

-- User identities (X, Telegram, etc.)
CREATE TABLE IF NOT EXISTS akari_user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('x', 'telegram')),
  provider_user_id TEXT NOT NULL,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

-- User roles
CREATE TABLE IF NOT EXISTS akari_user_roles (
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'analyst', 'admin', 'super_admin')),
  PRIMARY KEY (user_id, role)
);

-- Feature grants (for temporary or special access)
CREATE TABLE IF NOT EXISTS akari_user_feature_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES akari_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions (for website authentication)
CREATE TABLE IF NOT EXISTS akari_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES akari_users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_akari_user_identities_user_id ON akari_user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_akari_user_identities_provider ON akari_user_identities(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_akari_user_roles_user_id ON akari_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_akari_user_feature_grants_user_id ON akari_user_feature_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_akari_user_sessions_user_id ON akari_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_akari_user_sessions_token ON akari_user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_akari_user_sessions_expires ON akari_user_sessions(expires_at);

-- Clean up expired sessions (run periodically)
-- DELETE FROM akari_user_sessions WHERE expires_at < NOW();

-- =============================================================================
-- Example: Grant Super Admin to a user (replace USER_ID with actual UUID)
-- =============================================================================
-- INSERT INTO akari_user_roles (user_id, role)
-- VALUES ('USER_ID_HERE', 'super_admin')
-- ON CONFLICT (user_id, role) DO NOTHING;

