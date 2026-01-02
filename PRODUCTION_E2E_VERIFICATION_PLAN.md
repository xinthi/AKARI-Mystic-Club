# Production E2E Approval Verification Plan

**Date:** 2025-02-01  
**Purpose:** Verify approval fix is working correctly in production

---

## Pre-Deployment Verification

### Step 1: Check Constraint Exists

Run in Supabase SQL Editor:
```sql
-- See verify_constraint_and_rpc.sql for full query
SELECT 
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';
```

**Expected:** One row with `conname = 'arc_project_features_project_id_key'`

**If Missing:** Apply migration:
```bash
# In Supabase dashboard or via CLI
# Apply: supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql
```

---

### Step 2: Verify RPC Function Uses Correct Constraint

Run in Supabase SQL Editor:
```sql
-- See verify_constraint_and_rpc.sql for full query
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) = 3
    THEN '✓ CORRECT'
    ELSE '✗ NEEDS UPDATE'
  END AS status
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected:** `status = '✓ CORRECT'` with 3 constraint references (one per product type: ms, gamefi, crm)

**If Wrong:** RPC migration should already be applied. Check that `20250131_arc_admin_approve_rpc.sql` has been applied.

---

### Step 3: Verify RPC Updates updated_at

Run in Supabase SQL Editor:
```sql
-- See verify_constraint_and_rpc.sql for full query
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%updated_at = NOW()%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'updated_at = NOW\(\)', 'g')) >= 3
    THEN '✓ CORRECT'
    ELSE '✗ NEEDS UPDATE'
  END AS status
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected:** `status = '✓ CORRECT'` with at least 3 `updated_at = NOW()` references

---

## E2E Approval Test

### Step 1: Create Test Pending Request

**Option A: Via API**
```bash
POST /api/portal/arc/leaderboard-requests
{
  "project_id": "<test_project_id>",
  "product_type": "ms",  # or "gamefi" or "crm"
  "start_at": "2025-02-01T00:00:00Z",
  "end_at": "2025-12-31T23:59:59Z",
  "justification": "E2E test request"
}
```

**Option B: Via SQL (for testing only)**
```sql
-- Get a test project_id first
SELECT id, name, slug FROM projects WHERE slug IS NOT NULL LIMIT 1;

-- Insert test request (replace <project_id> with actual)
INSERT INTO arc_leaderboard_requests (
  project_id,
  product_type,
  start_at,
  end_at,
  justification,
  status
) VALUES (
  '<project_id>',  -- Replace with actual project_id
  'ms',  -- or 'gamefi' or 'crm'
  NOW() + INTERVAL '1 day',
  NOW() + INTERVAL '365 days',
  'E2E test request',
  'pending'
) RETURNING id AS request_id;
```

**Note the `request_id` and `project_id` for verification.**

---

### Step 2: Approve Request via API

```bash
PUT /api/portal/admin/arc/leaderboard-requests/<request_id>/approve
Headers:
  Cookie: akari_session=<your_session_token>
```

**Or use the smoke test page:**
1. Navigate to `/portal/admin/arc/smoke-test`
2. Click "Approve Request" button
3. Verify green "Approval OK" status appears

---

### Step 3: Run Verification Queries

**Run all queries from `e2e_approval_test_queries.sql`**, replacing:
- `<request_id>` with actual request ID
- `<project_id>` with actual project ID

**Or use the comprehensive check:**

```sql
-- Replace placeholders
WITH request_check AS (
  SELECT status, decided_at, product_type
  FROM arc_leaderboard_requests
  WHERE id = '<request_id>'
),
access_check AS (
  SELECT application_status, approved_at
  FROM arc_project_access
  WHERE project_id = '<project_id>'
  ORDER BY updated_at DESC LIMIT 1
),
features_check AS (
  SELECT leaderboard_enabled, gamefi_enabled, crm_enabled, updated_at
  FROM arc_project_features
  WHERE project_id = '<project_id>'
),
arena_check AS (
  SELECT id, status FROM arenas
  WHERE project_id = '<project_id>' AND kind IN ('ms', 'legacy_ms')
  ORDER BY created_at DESC LIMIT 1
),
audit_check AS (
  SELECT success FROM arc_audit_log
  WHERE project_id = '<project_id>' AND action = 'request_approved'
  ORDER BY created_at DESC LIMIT 1
)
SELECT 
  (SELECT status FROM request_check) AS request_status,
  (SELECT application_status FROM access_check) AS access_status,
  (SELECT updated_at FROM features_check) AS features_updated_at,
  (SELECT id FROM arena_check) AS arena_id,
  (SELECT success FROM audit_check) AS audit_success,
  CASE 
    WHEN (SELECT status FROM request_check) = 'approved'
      AND (SELECT application_status FROM access_check) = 'approved'
      AND (SELECT updated_at FROM features_check) > NOW() - INTERVAL '5 minutes'
      AND (SELECT success FROM audit_check) = true
    THEN '✓ ALL CHECKS PASS'
    ELSE '✗ SOME CHECKS FAILED'
  END AS overall_status;
```

**Expected Results:**
- `request_status` = `'approved'`
- `access_status` = `'approved'`
- `features_updated_at` IS recent (within last 5 minutes)
- `arena_id` IS NOT NULL (if product_type was 'ms' or 'gamefi')
- `audit_success` = `true`
- `overall_status` = `'✓ ALL CHECKS PASS'`

---

### Step 4: Verify Campaigns API No Longer Returns "ARC access not approved"

```bash
GET /api/portal/arc/campaigns?projectId=<project_id>
```

**Expected:** 
- Status 200
- Response contains `{ ok: true, campaigns: [...] }`
- **NOT** `{ ok: false, error: "ARC access not approved" }`

---

## Migrations Applied

### Required Migrations (in order):

1. **`20250201_add_arc_project_access_unique_constraint.sql`**
   - Ensures unique index on `arc_project_access.project_id`
   - **Status:** Should already be applied

2. **`20250201_safe_ensure_arc_project_features_constraint.sql`**
   - Ensures constraint `arc_project_features_project_id_key` exists
   - **Status:** Apply if constraint check fails

3. **`20250131_arc_admin_approve_rpc.sql`**
   - Updates RPC to use `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
   - Updates all three product types (ms, gamefi, crm)
   - Adds `updated_at = NOW()` to all DO UPDATE clauses
   - **Status:** Should already be applied, verify with Step 2 above

---

## Verification Output Template

After running all checks, fill in:

### Pre-Deployment
- [ ] Constraint exists: `arc_project_features_project_id_key` ✓/✗
- [ ] RPC uses correct constraint syntax: ✓/✗
- [ ] RPC updates `updated_at`: ✓/✗

### E2E Test
- [ ] Test request created: Request ID = `<request_id>`
- [ ] Approval API called: Status = `<status_code>`, Response = `<response_json>`
- [ ] Request status verified: `arc_leaderboard_requests.status` = `approved` ✓/✗
- [ ] Project access verified: `arc_project_access.application_status` = `approved` ✓/✗
- [ ] Project features verified: Flags set correctly, `updated_at` refreshed ✓/✗
- [ ] Arena created (if ms/gamefi): Arena ID = `<arena_id>`, Status = `active` ✓/✗
- [ ] Audit log verified: `arc_audit_log.success` = `true` ✓/✗
- [ ] Campaigns API verified: No longer returns "ARC access not approved" ✓/✗

### RPC Errors (if any)
If approval fails, capture:
```json
{
  "code": "<error_code>",
  "message": "<error_message>",
  "details": "<error_details>",
  "hint": "<error_hint>"
}
```

---

## Files Reference

- **Verification Queries:** `verify_constraint_and_rpc.sql`
- **E2E Test Queries:** `e2e_approval_test_queries.sql`
- **Migration:** `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`
- **RPC Migration:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

---

**Status:** Ready for execution
