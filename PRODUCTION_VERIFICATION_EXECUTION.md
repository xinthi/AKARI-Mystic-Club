# Production Verification Execution Guide

**Date:** 2025-02-01  
**Task:** Verify approval fix is working correctly in production

---

## ✅ Confirmed: Code is Ready

### RPC Function Verification ✓
The RPC function `arc_admin_approve_leaderboard_request` in migration `20250131_arc_admin_approve_rpc.sql` is **correctly configured**:

- ✅ **MS product type (line 123):** Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
- ✅ **GameFi product type (line 154):** Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
- ✅ **CRM product type (line 183):** Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
- ✅ All three include `updated_at = NOW()` in DO UPDATE clauses (lines 129, 164, 190)

---

## Step 1: Verify Constraint Exists

**Run in Supabase SQL Editor:**

```sql
-- Check if constraint exists
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

**If Missing:** Apply migration:
```bash
supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql
```

---

## Step 2: Verify RPC Uses Correct Constraint

**Run in Supabase SQL Editor:**

```sql
-- Check RPC function uses correct constraint syntax
SELECT 
  proname AS function_name,
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
      AND (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) = 3
    THEN '✓ CORRECT (all 3 product types)'
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%'
    THEN '⚠ PARTIAL'
    ELSE '✗ WRONG'
  END AS status,
  (SELECT COUNT(*) FROM regexp_matches(pg_get_functiondef(oid), 'ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key', 'g')) AS constraint_count
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**Expected Result:**
- `status = '✓ CORRECT (all 3 product types)'`
- `constraint_count = 3`

---

## Step 3: E2E Approval Test

### 3.1 Create Test Pending Request

**Option A: Via API (recommended)**
```bash
POST /api/portal/arc/leaderboard-requests
Content-Type: application/json
Cookie: akari_session=<your_session_token>

{
  "project_id": "<test_project_id>",
  "product_type": "ms",
  "start_at": "2025-02-01T00:00:00Z",
  "end_at": "2025-12-31T23:59:59Z",
  "justification": "E2E test request"
}
```

**Option B: Via SQL (for testing only)**
```sql
-- Get a test project_id
SELECT id, name, slug FROM projects WHERE slug IS NOT NULL LIMIT 1;

-- Insert test request (replace <project_id>)
INSERT INTO arc_leaderboard_requests (
  project_id,
  product_type,
  start_at,
  end_at,
  justification,
  status
) VALUES (
  '<project_id>',
  'ms',
  NOW() + INTERVAL '1 day',
  NOW() + INTERVAL '365 days',
  'E2E test request',
  'pending'
) RETURNING id AS request_id, project_id;
```

**Note:** Save the `request_id` and `project_id` for verification.

---

### 3.2 Approve Request

**Option A: Via API**
```bash
PUT /api/portal/admin/arc/leaderboard-requests/<request_id>/approve
Content-Type: application/json
Cookie: akari_session=<your_session_token>
```

**Option B: Via Smoke Test Page**
1. Navigate to `/portal/admin/arc/smoke-test`
2. Click "Approve Request" button
3. Verify green "Approval OK" status appears

**Expected Response:**
```json
{
  "ok": true,
  "requestId": "<request_id>",
  "projectId": "<project_id>",
  "productType": "ms",
  "created": {
    "arenaId": "<arena_id>"  // if ms/gamefi
  }
}
```

**If Error:** Capture full error response including `rpcError` field:
```json
{
  "ok": false,
  "error": "...",
  "rpcError": {
    "code": "...",
    "message": "...",
    "details": "...",
    "hint": "..."
  }
}
```

---

### 3.3 Run Verification Queries

**Replace `<request_id>` and `<project_id>` with actual values.**

#### A. Verify Request Status
```sql
SELECT 
  id,
  status,
  decided_at,
  decided_by,
  product_type,
  CASE 
    WHEN status = 'approved' AND decided_at IS NOT NULL THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS check_status
FROM arc_leaderboard_requests
WHERE id = '<request_id>';
```

**Expected:** `status = 'approved'`, `decided_at IS NOT NULL`, `check_status = '✓ PASS'`

#### B. Verify Project Access
```sql
SELECT 
  id,
  project_id,
  application_status,
  approved_at,
  approved_by_profile_id,
  CASE 
    WHEN application_status = 'approved' 
      AND approved_at IS NOT NULL 
      AND approved_by_profile_id IS NOT NULL 
    THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS check_status
FROM arc_project_access
WHERE project_id = '<project_id>'
ORDER BY updated_at DESC
LIMIT 1;
```

**Expected:** `application_status = 'approved'`, `approved_at IS NOT NULL`, `check_status = '✓ PASS'`

#### C. Verify Project Features
```sql
SELECT 
  project_id,
  leaderboard_enabled,
  gamefi_enabled,
  crm_enabled,
  updated_at,
  CASE 
    WHEN updated_at > NOW() - INTERVAL '5 minutes' THEN '✓ updated_at refreshed'
    ELSE '⚠ updated_at may not be recent'
  END AS check_status
FROM arc_project_features
WHERE project_id = '<project_id>';
```

**Expected:** 
- Feature flags set correctly based on `product_type` (leaderboard_enabled=true for 'ms')
- `updated_at` is recent (within last 5 minutes)
- `check_status = '✓ updated_at refreshed'`

#### D. Verify Arena Created (if ms/gamefi)
```sql
SELECT 
  id,
  project_id,
  kind,
  status,
  name,
  created_at,
  CASE 
    WHEN id IS NOT NULL AND status = 'active' THEN '✓ PASS'
    ELSE '✗ FAIL or N/A'
  END AS check_status
FROM arenas
WHERE project_id = '<project_id>'
  AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC
LIMIT 1;
```

**Expected (if product_type was 'ms' or 'gamefi'):** 
- Row exists
- `status = 'active'`
- `check_status = '✓ PASS'`

#### E. Verify Audit Log
```sql
SELECT 
  id,
  actor_profile_id,
  project_id,
  action,
  success,
  message,
  created_at,
  CASE 
    WHEN action = 'request_approved' 
      AND success = true 
    THEN '✓ PASS'
    ELSE '✗ FAIL'
  END AS check_status
FROM arc_audit_log
WHERE project_id = '<project_id>'
  AND action = 'request_approved'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:** `success = true`, `action = 'request_approved'`, `check_status = '✓ PASS'`

#### F. Comprehensive Check (Single Query)
```sql
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
  'Comprehensive Check' AS check_type,
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

**Expected:** `overall_status = '✓ ALL CHECKS PASS'`

---

### 3.4 Verify Campaigns API

```bash
GET /api/portal/arc/campaigns?projectId=<project_id>
Cookie: akari_session=<your_session_token>
```

**Expected Response:**
```json
{
  "ok": true,
  "campaigns": [...]
}
```

**Should NOT return:**
```json
{
  "ok": false,
  "error": "ARC access not approved"
}
```

---

## Migrations Applied Checklist

### Required Migrations:

1. ✅ **`20250131_arc_admin_approve_rpc.sql`**
   - **Purpose:** Updates RPC to use `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
   - **Status:** Should already be applied
   - **Verify:** Run Step 2 above

2. ⚠️ **`20250201_safe_ensure_arc_project_features_constraint.sql`**
   - **Purpose:** Ensures constraint `arc_project_features_project_id_key` exists
   - **Status:** Apply if constraint check (Step 1) fails
   - **Action:** Run migration if constraint is missing

3. ✅ **`20250201_add_arc_project_access_unique_constraint.sql`**
   - **Purpose:** Ensures unique index on `arc_project_access.project_id`
   - **Status:** Should already be applied

---

## Verification Results Template

Fill in after execution:

### Pre-Deployment
- [ ] Constraint exists: `arc_project_features_project_id_key` ✓/✗
  - **SQL Output:** `<paste_constraint_check_result>`
- [ ] RPC uses correct constraint: ✓/✗
  - **SQL Output:** `<paste_rpc_check_result>`
- [ ] RPC updates `updated_at`: ✓/✗
  - **Count:** `<number_of_updated_at_references>`

### E2E Test
- [ ] Test request created
  - **Request ID:** `<request_id>`
  - **Project ID:** `<project_id>`
  - **Product Type:** `<ms|gamefi|crm>`
- [ ] Approval API called
  - **Status Code:** `<200|400|500>`
  - **Response:** `<paste_json_response>`
- [ ] Request status verified
  - **Status:** `<approved|pending|rejected>`
  - **Decided At:** `<timestamp>`
- [ ] Project access verified
  - **Application Status:** `<approved|pending|rejected>`
  - **Approved At:** `<timestamp>`
- [ ] Project features verified
  - **Leaderboard Enabled:** `<true|false|null>`
  - **GameFi Enabled:** `<true|false|null>`
  - **CRM Enabled:** `<true|false|null>`
  - **Updated At:** `<timestamp>`
- [ ] Arena created (if ms/gamefi)
  - **Arena ID:** `<arena_id|N/A>`
  - **Status:** `<active|ended|N/A>`
- [ ] Audit log verified
  - **Success:** `<true|false>`
  - **Message:** `<audit_message>`
- [ ] Campaigns API verified
  - **Returns "ARC access not approved":** `<yes|no>`
  - **Response:** `<paste_json_response>`

### RPC Errors (if any)
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
- **Execution Plan:** `PRODUCTION_E2E_VERIFICATION_PLAN.md`
- **Migration:** `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`

---

**Status:** Ready for execution in production
