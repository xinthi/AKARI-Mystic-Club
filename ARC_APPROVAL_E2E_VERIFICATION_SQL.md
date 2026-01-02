# ARC Approval E2E Verification SQL

Run these SQL queries in Supabase SQL Editor to verify the approval fix is working correctly.

---

## Production Verification Queries

### Step 1: Verify Constraint Exists

```sql
-- Check if constraint arc_project_features_project_id_key exists
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';
```

**Expected Result:**
- One row with `constraint_name = 'arc_project_features_project_id_key'`
- `constraint_type = 'u'` (unique)
- `constraint_definition` contains `UNIQUE (project_id)`

**If Missing:** Apply migration `20250201_safe_ensure_arc_project_features_constraint.sql`

---

### Step 2: Verify RPC Function Uses Correct Constraint

```sql
-- Check RPC function uses ON CONFLICT ON CONSTRAINT for all product types
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) = 3
    THEN '✓ CORRECT (all 3 product types: ms, gamefi, crm)'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%'
    THEN '⚠ PARTIAL (some product types may not use named constraint)'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT (project_id)%'
    THEN '✗ WRONG (uses column list - will fail)'
    ELSE '? UNKNOWN'
  END AS constraint_usage_status,
  (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) AS constraint_references_count
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- `constraint_usage_status = '✓ CORRECT (all 3 product types: ms, gamefi, crm)'`
- `constraint_references_count = 3`

**If Wrong:** Apply migration `20250131_arc_admin_approve_rpc.sql`

---

### Step 3: Verify RPC Updates updated_at

```sql
-- Check RPC function updates updated_at for all product types
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%updated_at = NOW()%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'updated_at = NOW\(\)', 'g')) >= 3
    THEN '✓ CORRECT (all product types update updated_at)'
    WHEN pg_get_functiondef(oid) LIKE '%updated_at = NOW()%'
    THEN '⚠ PARTIAL (some product types may not update updated_at)'
    ELSE '✗ MISSING (updated_at not updated)'
  END AS updated_at_status,
  (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'updated_at = NOW\(\)', 'g')) AS updated_at_references_count
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- `updated_at_status = '✓ CORRECT (all product types update updated_at)'`
- `updated_at_references_count >= 3`

---

## Pre-Approval Check

### 4. Find a Pending Request

```sql
-- Find a pending leaderboard request with its project info
SELECT 
  lr.id AS request_id,
  lr.project_id,
  lr.product_type,
  lr.status,
  lr.start_at,
  lr.end_at,
  p.name AS project_name,
  p.slug AS project_slug
FROM arc_leaderboard_requests lr
JOIN projects p ON p.id = lr.project_id
WHERE lr.status = 'pending'
ORDER BY lr.created_at DESC
LIMIT 1;
```

**Note the `request_id` and `project_id` for testing.**

---

## Post-Approval Verification

### 2. Verify Request Status Updated

```sql
-- Replace <request_id> with actual request ID from step 1
SELECT 
  id,
  status,
  decided_at,
  decided_by,
  product_type
FROM arc_leaderboard_requests
WHERE id = '<request_id>'
  AND status = 'approved';
```

**Expected Result:**
- `status` = `'approved'`
- `decided_at` IS NOT NULL (recent timestamp)
- `decided_by` IS NOT NULL (admin profile ID)

---

### 3. Verify Project Access Approved

```sql
-- Replace <project_id> with actual project ID from step 1
SELECT 
  id,
  project_id,
  application_status,
  approved_at,
  approved_by_profile_id,
  created_at,
  updated_at
FROM arc_project_access
WHERE project_id = '<project_id>'
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected Result:**
- `application_status` = `'approved'`
- `approved_at` IS NOT NULL (recent timestamp)
- `approved_by_profile_id` IS NOT NULL
- Should be the most recent record for this project

---

### 4. Verify Project Features Updated

```sql
-- Replace <project_id> with actual project ID from step 1
SELECT 
  id,
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  gamefi_enabled,
  gamefi_start_at,
  gamefi_end_at,
  crm_enabled,
  crm_start_at,
  crm_end_at,
  option1_crm_unlocked,
  option2_normal_unlocked,
  option3_gamified_unlocked,
  updated_at,
  created_at
FROM arc_project_features
WHERE project_id = '<project_id>';
```

**Expected Results (depends on product_type):**

**For `product_type = 'ms'`:**
- `leaderboard_enabled` = `true`
- `leaderboard_start_at` IS NOT NULL (matches request start_at)
- `leaderboard_end_at` IS NOT NULL (matches request end_at)
- `option2_normal_unlocked` = `true`
- `updated_at` IS NOT NULL (recent timestamp)

**For `product_type = 'gamefi'`:**
- `gamefi_enabled` = `true`
- `gamefi_start_at` IS NOT NULL
- `gamefi_end_at` IS NOT NULL
- `leaderboard_enabled` = `true`
- `leaderboard_start_at` IS NOT NULL
- `leaderboard_end_at` IS NOT NULL
- `option2_normal_unlocked` = `true`
- `option3_gamified_unlocked` = `true`
- `updated_at` IS NOT NULL (recent timestamp)

**For `product_type = 'crm'`:**
- `crm_enabled` = `true`
- `crm_start_at` IS NOT NULL
- `crm_end_at` IS NOT NULL
- `option1_crm_unlocked` = `true`
- `updated_at` IS NOT NULL (recent timestamp)

---

### 5. Verify Arena Created (for ms/gamefi only)

```sql
-- Replace <project_id> with actual project ID from step 1
SELECT 
  id,
  project_id,
  kind,
  status,
  name,
  slug,
  starts_at,
  ends_at,
  created_at,
  updated_at
FROM arenas
WHERE project_id = '<project_id>'
  AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result (if product_type was 'ms' or 'gamefi'):**
- Row exists
- `kind` = `'ms'` or `'legacy_ms'`
- `status` = `'active'`
- `name` IS NOT NULL (contains "Mindshare")
- `slug` IS NOT NULL
- `starts_at` matches request start_at
- `ends_at` matches request end_at
- `created_at` IS recent (within last few minutes)

---

### 6. Verify Audit Log Entry

```sql
-- Replace <project_id> with actual project ID from step 1
SELECT 
  id,
  actor_profile_id,
  project_id,
  entity_type,
  entity_id,
  action,
  success,
  message,
  metadata,
  created_at
FROM arc_audit_log
WHERE project_id = '<project_id>'
  AND action = 'request_approved'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
- `action` = `'request_approved'`
- `success` = `true`
- `message` contains product type (e.g., "Leaderboard request approved for ms")
- `metadata` contains product_type, start_at, end_at
- `created_at` IS recent (within last few minutes)

---

## Comprehensive Verification Query

Run this single query to verify all aspects at once:

```sql
-- Replace <request_id> and <project_id> with actual values from step 1
WITH request_data AS (
  SELECT id, project_id, product_type, status, decided_at, decided_by
  FROM arc_leaderboard_requests
  WHERE id = '<request_id>'
),
access_data AS (
  SELECT application_status, approved_at, approved_by_profile_id
  FROM arc_project_access
  WHERE project_id = '<project_id>'
  ORDER BY updated_at DESC
  LIMIT 1
),
features_data AS (
  SELECT 
    leaderboard_enabled,
    gamefi_enabled,
    crm_enabled,
    updated_at
  FROM arc_project_features
  WHERE project_id = '<project_id>'
),
arena_data AS (
  SELECT id, kind, status, name
  FROM arenas
  WHERE project_id = '<project_id>'
    AND kind IN ('ms', 'legacy_ms')
  ORDER BY created_at DESC
  LIMIT 1
),
audit_data AS (
  SELECT success, message, created_at
  FROM arc_audit_log
  WHERE project_id = '<project_id>'
    AND action = 'request_approved'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  -- Request verification
  (SELECT status FROM request_data) AS request_status,
  (SELECT decided_at FROM request_data) AS request_decided_at,
  -- Access verification
  (SELECT application_status FROM access_data) AS access_status,
  (SELECT approved_at FROM access_data) AS access_approved_at,
  -- Features verification
  (SELECT leaderboard_enabled FROM features_data) AS features_leaderboard,
  (SELECT gamefi_enabled FROM features_data) AS features_gamefi,
  (SELECT crm_enabled FROM features_data) AS features_crm,
  (SELECT updated_at FROM features_data) AS features_updated_at,
  -- Arena verification
  (SELECT id FROM arena_data) AS arena_id,
  (SELECT status FROM arena_data) AS arena_status,
  -- Audit verification
  (SELECT success FROM audit_data) AS audit_success,
  (SELECT message FROM audit_data) AS audit_message;
```

**Expected Results:**
- `request_status` = `'approved'`
- `request_decided_at` IS NOT NULL
- `access_status` = `'approved'`
- `access_approved_at` IS NOT NULL
- `features_leaderboard`, `features_gamefi`, or `features_crm` = `true` (based on product_type)
- `features_updated_at` IS NOT NULL (recent)
- `arena_id` IS NOT NULL (if product_type was 'ms' or 'gamefi')
- `arena_status` = `'active'` (if arena exists)
- `audit_success` = `true`
- `audit_message` IS NOT NULL

---

## Constraint Verification

### 7. Verify Unique Constraint Exists

```sql
-- Verify arc_project_features has the required constraint
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';
```

**Expected Result:**
- One row with `constraint_name = 'arc_project_features_project_id_key'`
- `constraint_type` = `'u'` (unique)
- `constraint_definition` contains `UNIQUE (project_id)`

---

### 8. Verify updated_at Column Exists

```sql
-- Verify updated_at column exists and has correct properties
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
- One row with:
  - `column_name = 'updated_at'`
  - `data_type` = `'timestamp with time zone'` or `'timestamptz'`
  - `is_nullable = 'NO'`
  - `column_default` contains `now()` or similar

---

## RPC Function Verification

### 9. Verify RPC Uses Correct Constraint

```sql
-- Check RPC function uses ON CONFLICT ON CONSTRAINT
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
    THEN '✓ CORRECT'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT (project_id)%' 
    THEN '✗ WRONG - Uses column list'
    ELSE '? UNKNOWN'
  END AS constraint_usage
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- `constraint_usage` = `'✓ CORRECT'`

---

## Summary Checklist

After running all queries, verify:

- [ ] Request status is `'approved'`
- [ ] Request `decided_at` is set
- [ ] Project access `application_status` = `'approved'`
- [ ] Project access `approved_at` is set
- [ ] Project features have correct flags enabled (based on product_type)
- [ ] Project features `updated_at` is recent
- [ ] Arena created (if product_type was 'ms' or 'gamefi')
- [ ] Arena status is `'active'` (if arena exists)
- [ ] Audit log shows `success = true`
- [ ] Constraint `arc_project_features_project_id_key` exists
- [ ] Column `updated_at` exists on `arc_project_features`
- [ ] RPC function uses `ON CONFLICT ON CONSTRAINT`

All checks should pass for a successful approval! ✓
