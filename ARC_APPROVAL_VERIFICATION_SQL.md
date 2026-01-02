# ARC Approval Fix - Verification SQL Checklist

Run these SQL queries in Supabase SQL Editor to verify the fix is properly applied.

---

## 1. Verify Constraint Name on arc_project_features

```sql
-- Show all constraints on arc_project_features table
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND contype = 'u'  -- unique constraints only
ORDER BY conname;
```

**Expected Result:**
- Should show at least one row with `constraint_name = 'arc_project_features_project_id_key'`
- `constraint_type` should be `'u'` (unique)
- `constraint_definition` should include `UNIQUE (project_id)`

---

## 2. Confirm Unique Constraint Exists (Specific Check)

```sql
-- Check if the exact constraint name exists
SELECT 
  EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'arc_project_features_project_id_key' 
    AND conrelid = 'arc_project_features'::regclass
    AND contype = 'u'
  ) AS constraint_exists;
```

**Expected Result:**
- `constraint_exists` should be `true`

---

## 3. Confirm updated_at Column Exists

```sql
-- Check if updated_at column exists and its properties
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'arc_project_features'
  AND column_name = 'updated_at';
```

**Expected Result:**
- Should return one row with:
  - `column_name = 'updated_at'`
  - `data_type = 'timestamp with time zone'` (or `timestamptz`)
  - `is_nullable = 'NO'` (NOT NULL)
  - `column_default` should contain `now()` or similar

---

## 4. Verify RPC Function Uses Correct Constraint Name

```sql
-- Check the RPC function definition for ON CONFLICT clauses
SELECT 
  proname AS function_name,
  pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- Look in `function_definition` for `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
- Should appear three times (once for each product_type: ms, gamefi, crm)

**Alternative Check (Pattern Search):**

```sql
-- Search for ON CONFLICT patterns in the function
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
    THEN 'CORRECT - Uses named constraint'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT (project_id)%' 
    THEN 'WARNING - Uses column list (may fail)'
    ELSE 'UNKNOWN - Check manually'
  END AS conflict_clause_status
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- `conflict_clause_status` should be `'CORRECT - Uses named constraint'`

---

## 5. Verify Table Schema (Complete Check)

```sql
-- Show full table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'arc_project_features'
ORDER BY ordinal_position;
```

**Expected Result:**
- Should include `updated_at` column
- Should show all feature flags (option1_crm_unlocked, option2_normal_unlocked, etc.)
- Should show module enablement columns if they exist (leaderboard_enabled, gamefi_enabled, crm_enabled, etc.)

---

## 6. Test Constraint Name in ON CONFLICT (Dry Run)

```sql
-- Try to create a test upsert that references the constraint
-- This will validate the constraint name without modifying data
DO $$
BEGIN
  -- This will fail if constraint doesn't exist, but won't insert data
  -- because we're in a DO block
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'arc_project_features_project_id_key'
  ) THEN
    RAISE NOTICE 'SUCCESS: Constraint arc_project_features_project_id_key exists and can be referenced';
  ELSE
    RAISE EXCEPTION 'ERROR: Constraint arc_project_features_project_id_key does not exist';
  END IF;
END $$;
```

**Expected Result:**
- Should print: `SUCCESS: Constraint arc_project_features_project_id_key exists and can be referenced`

---

## Quick Verification Summary

Run all checks at once:

```sql
-- COMPLETE VERIFICATION QUERY
SELECT 
  'Constraint Name Check' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'arc_project_features_project_id_key' 
      AND conrelid = 'arc_project_features'::regclass
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS status
UNION ALL
SELECT 
  'updated_at Column Check' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'arc_project_features' 
      AND column_name = 'updated_at'
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS status
UNION ALL
SELECT 
  'RPC Uses Named Constraint' AS check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE proname = 'arc_admin_approve_leaderboard_request'
      AND pg_get_functiondef(p.oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%'
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS status;
```

**Expected Result:**
- All three rows should show `'✓ PASS'`

---

## Post-Verification: Test Approval Flow

After verification, test the actual approval:

1. Find a pending leaderboard request:
```sql
SELECT id, project_id, product_type, status 
FROM arc_leaderboard_requests 
WHERE status = 'pending' 
LIMIT 1;
```

2. Note the `id` and `project_id`

3. Test the RPC function directly (if you have admin access):
```sql
-- Replace <request_id> and <admin_profile_id> with actual values
SELECT arc_admin_approve_leaderboard_request(
  '<request_id>'::uuid,
  '<admin_profile_id>'::uuid
);
```

4. Verify the result:
```sql
-- Check request status
SELECT status, decided_at 
FROM arc_leaderboard_requests 
WHERE id = '<request_id>';

-- Check project access
SELECT application_status, approved_at 
FROM arc_project_access 
WHERE project_id = '<project_id>';

-- Check project features
SELECT 
  leaderboard_enabled,
  gamefi_enabled,
  crm_enabled,
  updated_at
FROM arc_project_features 
WHERE project_id = '<project_id>';
```

All should show the expected values after successful approval.
