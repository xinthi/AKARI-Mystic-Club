# ARC RLS Fix Migration Notes

**Date:** 2025-12-17  
**Migration File:** `supabase/migrations/20251217_arc_rls_fix.sql`

---

## What Changed

This migration fixes and cleans up Row Level Security (RLS) policies for all ARC tables. It does not modify table structures or data - only functions, RLS settings, and policies.

---

## Changes Made

### 1. Helper Functions (Recreated)

Three helper functions were recreated using `CREATE OR REPLACE`:

- **`get_current_user_profile_id()`**
  - Maps from `auth.uid()` to `profiles.id` via `akari_user_identities`
  - Used by all RLS policies to identify the current user's profile

- **`is_user_super_admin(profile_id UUID)`**
  - Checks if a profile has `super_admin` in `real_roles` array
  - Used to grant full access to super admins

- **`is_user_project_admin(profile_id UUID, project_id UUID)`**
  - Checks if a profile is admin/moderator/owner for a specific project via `project_team_members`
  - Used to grant project-level management permissions

### 2. RLS Enabled on All Tables

Ensured RLS is enabled on all 8 ARC tables:
- `arc_project_access`
- `arc_project_features`
- `arc_campaigns`
- `arc_campaign_participants`
- `arc_participant_links`
- `arc_link_events`
- `arc_external_submissions` ✅ (table name confirmed correct)
- `arc_leaderboard_requests`

### 3. Policies Cleaned Up

All existing policies were dropped and recreated cleanly using:
- `DROP POLICY IF EXISTS ...` to safely remove old policies
- `CREATE POLICY ...` to recreate with correct definitions

This ensures:
- No duplicate or conflicting policies
- All policies reference the correct table names
- All policies use the correct helper functions
- Consistent naming conventions

---

## Why This Was Needed

1. **Policy Conflicts**: Policies may have been created inconsistently across migrations
2. **Function Dependencies**: Helper functions needed to be guaranteed to exist with correct signatures
3. **Table Name Consistency**: Ensures `arc_external_submissions` (not any variant) is used throughout
4. **Safe Re-runs**: Migration can be run multiple times without errors

---

## Safety

- ✅ Safe to re-run: Uses `CREATE OR REPLACE` and `DROP POLICY IF EXISTS`
- ✅ No data changes: Only modifies RLS configuration
- ✅ No table structure changes: Only functions and policies
- ✅ Backward compatible: All existing functionality preserved

---

## Testing

After running this migration, verify:

1. RLS is enabled on all ARC tables:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename LIKE 'arc_%';
   ```

2. Helper functions exist:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name IN (
     'get_current_user_profile_id',
     'is_user_super_admin',
     'is_user_project_admin'
   );
   ```

3. Policies are applied:
   ```sql
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE tablename LIKE 'arc_%' 
   ORDER BY tablename, policyname;
   ```

---

## Tables Affected

- `arc_project_access` - 4 policies
- `arc_project_features` - 3 policies
- `arc_campaigns` - 4 policies
- `arc_campaign_participants` - 4 policies
- `arc_participant_links` - 3 policies
- `arc_link_events` - 3 policies
- `arc_external_submissions` - 4 policies
- `arc_leaderboard_requests` - 5 policies

**Total: 8 tables, 30 policies**





