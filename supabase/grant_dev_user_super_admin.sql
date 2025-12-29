-- =============================================================================
-- Grant Super Admin Role to dev_user
-- Run this in Supabase SQL Editor to give dev_user admin access
-- =============================================================================

-- Find the user_id for dev_user by their X identity username
WITH dev_user_id AS (
  SELECT user_id 
  FROM akari_user_identities 
  WHERE provider = 'x' 
    AND LOWER(username) = 'dev_user'
  LIMIT 1
)
-- Grant super_admin role to dev_user
INSERT INTO akari_user_roles (user_id, role)
SELECT user_id, 'super_admin'
FROM dev_user_id
ON CONFLICT (user_id, role) DO NOTHING;

-- If the above doesn't work (no identity exists yet), you can also try:
-- First, create/find the user and identity, then grant the role
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to find existing user by identity
  SELECT user_id INTO v_user_id
  FROM akari_user_identities
  WHERE provider = 'x' 
    AND LOWER(username) = 'dev_user'
  LIMIT 1;

  -- If no user found, create one
  IF v_user_id IS NULL THEN
    INSERT INTO akari_users (display_name, is_active)
    VALUES ('Dev User', true)
    RETURNING id INTO v_user_id;

    -- Create the identity
    INSERT INTO akari_user_identities (user_id, provider, provider_user_id, username)
    VALUES (v_user_id, 'x', 'dev_user_' || v_user_id::text, 'dev_user')
    ON CONFLICT (provider, provider_user_id) DO NOTHING;
  END IF;

  -- Grant super_admin role
  INSERT INTO akari_user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Granted super_admin role to dev_user (user_id: %)', v_user_id;
END $$;

-- Verify the role was granted
SELECT 
  u.id,
  u.display_name,
  i.username,
  r.role
FROM akari_users u
LEFT JOIN akari_user_identities i ON i.user_id = u.id AND i.provider = 'x'
LEFT JOIN akari_user_roles r ON r.user_id = u.id
WHERE LOWER(i.username) = 'dev_user' OR i.username IS NULL
ORDER BY u.created_at DESC
LIMIT 5;

