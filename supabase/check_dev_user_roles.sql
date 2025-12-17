-- =============================================================================
-- Check dev_user Roles and Permissions
-- Run this to see the current state of dev_user account
-- =============================================================================

-- Check if dev_user exists and their roles
SELECT 
  u.id AS user_id,
  u.display_name,
  u.is_active,
  u.created_at,
  i.username,
  i.provider,
  r.role,
  CASE 
    WHEN r.role = 'super_admin' THEN '✅ Has Super Admin'
    WHEN r.role IS NULL THEN '❌ No Roles'
    ELSE '⚠️ Has Role: ' || r.role
  END AS status
FROM akari_user_identities i
LEFT JOIN akari_users u ON u.id = i.user_id
LEFT JOIN akari_user_roles r ON r.user_id = u.id
WHERE i.provider = 'x' 
  AND LOWER(i.username) = 'dev_user'
ORDER BY r.role NULLS LAST;

-- If no results, dev_user doesn't exist yet
-- Run the grant_dev_user_super_admin.sql script to create it

