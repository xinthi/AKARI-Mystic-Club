# Fixing Admin Access for dev_user Account

## Problem
The `dev_user` account cannot see admin menu items in the local build.

## Root Cause
Admin menu items are only shown when `isSuperAdmin()` returns `true`, which checks if the user's `realRoles` array includes `'super_admin'`.

There are two possible scenarios:

### Scenario 1: Running in Development Mode (Auth Bypassed)
If you see a **yellow "DEV MODE" panel** in the top-right corner of the page:
- The app is using a mock user with roles stored in `localStorage`
- Check the role selector dropdown in that panel
- Make sure it's set to "⭐ Super Admin"
- If it's set to a different role, change it and refresh

### Scenario 2: Running with Real Authentication
If you DON'T see the "DEV MODE" panel:
- The app is fetching user data from the API/database
- The `dev_user` account in the database doesn't have the `super_admin` role
- You need to grant the role in the database

## Solution: Grant Super Admin Role in Database

### Step 1: Check Current Status
Run this SQL in your Supabase SQL Editor:
```sql
-- Check dev_user roles
SELECT 
  u.id AS user_id,
  u.display_name,
  i.username,
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
  AND LOWER(i.username) = 'dev_user';
```

### Step 2: Grant Super Admin Role
Run the script: `supabase/grant_dev_user_super_admin.sql`

Or run this SQL directly:
```sql
-- Find dev_user and grant super_admin role
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
```

### Step 3: Verify
Run the check query from Step 1 again - you should see "✅ Has Super Admin"

### Step 4: Refresh the App
- Clear your browser cache/localStorage (or just do a hard refresh: Ctrl+Shift+R)
- Check the browser console - you should see debug logs showing:
  ```
  [UserMenu] User roles check: {
    xUsername: "dev_user",
    realRoles: ["super_admin"],
    isSuperAdmin: true,
    ...
  }
  ```
- The admin menu items should now appear in the UserMenu dropdown

## Debugging

The `UserMenu` component now logs debug information to the browser console. Check the console for:
- `realRoles`: Should include `'super_admin'`
- `isSuperAdmin`: Should be `true`
- `isDevMode`: Tells you if running in development mode

## Alternative: Use Dev Mode Role Selector

If you're in development mode and see the yellow "DEV MODE" panel:
1. Look for the dropdown selector in that panel
2. Select "⭐ Super Admin"
3. The role change is automatically saved to localStorage
4. Admin menu items should appear immediately

