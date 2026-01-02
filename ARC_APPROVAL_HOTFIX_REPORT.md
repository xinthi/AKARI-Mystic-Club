# ARC Approval Hotfix + Smoke Test Cleanup Report

**Date:** 2025-02-01  
**Status:** ✅ Complete

---

## Summary

Fixed approval failures by ensuring constraint name matches RPC references, and verified smoke test only tests GET endpoints.

---

## Files Changed

### 1. Migrations (Verified Correct)

#### A. Constraint Migration
**File:** `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`

**Status:** ✅ Already exists and correct

**What it does:**
- Checks if `arc_project_features_project_id_key` exists → does nothing if present
- Else, finds any existing single-column UNIQUE constraint on `project_id` → renames it
- Else, creates new constraint `arc_project_features_project_id_key UNIQUE(project_id)`

**Safety:** Does NOT drop existing constraints - only renames or creates.

#### B. RPC Migration
**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Status:** ✅ Already correct

**Verified:**
- ✅ Line 123 (MS product type): Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key` + `updated_at = NOW()`
- ✅ Line 154 (GameFi product type): Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key` + `updated_at = NOW()`
- ✅ Line 183 (CRM product type): Uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key` + `updated_at = NOW()`

All three product types correctly use named constraint and update `updated_at`.

---

### 2. Verification SQL Documentation

**File:** `ARC_APPROVAL_E2E_VERIFICATION_SQL.md`

**Changes:** Added production verification queries at the top:
- Step 1: Verify constraint exists by name
- Step 2: Verify RPC function uses `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key` (all 3 product types)
- Step 3: Verify RPC updates `updated_at = NOW()` for all product types

**Status:** ✅ Updated

---

### 3. Smoke Test Page

**File:** `src/web/pages/portal/admin/arc/smoke-test.tsx`

**Status:** ✅ Already correct (added clarifying comment)

**Verification:**
- API checklist (lines 199-213) contains **only GET endpoints** ✓
- POST/PUT-only endpoints are **NOT** in API checklist:
  - `/api/portal/admin/arc/leaderboard-requests/[id]/approve` - Only in action button ✓
  - `/api/portal/admin/arc/arenas/[id]/activate` - Only in action button ✓
  - `/api/portal/admin/arc/projects/[id]/update-features` - Only in action button ✓

**Action:** Added comment clarifying that POST/PUT endpoints should only be tested via action buttons.

---

## Migrations to Apply (if needed)

### Check Constraint Exists

Run in Supabase SQL Editor:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';
```

**If missing:** Apply `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`

### Check RPC Uses Correct Constraint

Run in Supabase SQL Editor:
```sql
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

**If wrong:** Apply `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

---

## E2E Verification Steps

### Step 1: Create Pending Request

**Via API:**
```bash
POST /api/portal/arc/leaderboard-requests
{
  "project_id": "<test_project_id>",
  "product_type": "ms",
  "start_at": "2025-02-01T00:00:00Z",
  "end_at": "2025-12-31T23:59:59Z",
  "justification": "E2E test"
}
```

**Or via SQL:**
```sql
INSERT INTO arc_leaderboard_requests (
  project_id, product_type, start_at, end_at, justification, status
) VALUES (
  '<project_id>', 'ms', NOW() + INTERVAL '1 day', NOW() + INTERVAL '365 days', 'E2E test', 'pending'
) RETURNING id AS request_id;
```

**Note:** Save `request_id` and `project_id` for verification.

---

### Step 2: Approve Request

**Via API:**
```bash
PUT /api/portal/admin/arc/leaderboard-requests/<request_id>/approve
```

**Or via Smoke Test:**
1. Navigate to `/portal/admin/arc/smoke-test`
2. Click "Approve Request" button
3. Verify green "Approval OK" status appears

**Expected Response:**
```json
{
  "ok": true,
  "requestId": "<request_id>",
  "projectId": "<project_id>",
  "productType": "ms"
}
```

---

### Step 3: Verify Approval Changes

**Run verification queries (see `ARC_APPROVAL_E2E_VERIFICATION_SQL.md`):**

#### A. Request Status
```sql
SELECT status, decided_at, decided_by
FROM arc_leaderboard_requests
WHERE id = '<request_id>';
```
**Expected:** `status = 'approved'`, `decided_at IS NOT NULL`

#### B. Project Access
```sql
SELECT application_status, approved_at, approved_by_profile_id
FROM arc_project_access
WHERE project_id = '<project_id>'
ORDER BY updated_at DESC LIMIT 1;
```
**Expected:** `application_status = 'approved'`, `approved_at IS NOT NULL`

#### C. Project Features
```sql
SELECT leaderboard_enabled, gamefi_enabled, crm_enabled, updated_at
FROM arc_project_features
WHERE project_id = '<project_id>';
```
**Expected:** Feature flags set correctly based on `product_type`, `updated_at` is recent (within last 5 minutes)

#### D. Arena Created (if ms/gamefi)
```sql
SELECT id, kind, status, name
FROM arenas
WHERE project_id = '<project_id>' AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC LIMIT 1;
```
**Expected (if product_type was 'ms' or 'gamefi'):** Row exists, `status = 'active'`

#### E. Audit Log
```sql
SELECT success, message, created_at
FROM arc_audit_log
WHERE project_id = '<project_id>' AND action = 'request_approved'
ORDER BY created_at DESC LIMIT 1;
```
**Expected:** `success = true`, `message` contains product type

---

### Step 4: Verify Campaigns API

```bash
GET /api/portal/arc/campaigns?projectId=<project_id>
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

## Verification Checklist

### Pre-Deployment
- [ ] Constraint exists: `arc_project_features_project_id_key` ✓/✗
- [ ] RPC uses correct constraint (all 3 product types) ✓/✗
- [ ] RPC updates `updated_at` (all 3 product types) ✓/✗

### Post-Deployment E2E Test
- [ ] Created pending request: Request ID = `<request_id>`
- [ ] Approved request: Status = `<200>`, Response = `<ok: true>`
- [ ] Request status verified: `arc_leaderboard_requests.status` = `approved` ✓/✗
- [ ] Project access verified: `arc_project_access.application_status` = `approved` ✓/✗
- [ ] Project features verified: Flags set correctly, `updated_at` refreshed ✓/✗
- [ ] Arena created (if ms/gamefi): Arena ID = `<arena_id>`, Status = `active` ✓/✗
- [ ] Audit log verified: `arc_audit_log.success` = `true` ✓/✗
- [ ] Campaigns API verified: No longer returns "ARC access not approved" ✓/✗

---

## Files Reference

- **Verification SQL:** `ARC_APPROVAL_E2E_VERIFICATION_SQL.md`
- **Constraint Migration:** `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`
- **RPC Migration:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`
- **Smoke Test:** `src/web/pages/portal/admin/arc/smoke-test.tsx`

---

## Summary

✅ **Migrations:** Already correct and ready to apply  
✅ **Verification SQL:** Added production verification queries  
✅ **Smoke Test:** Already correct (POST/PUT endpoints only in action buttons)  

All fixes complete. Ready for production deployment and E2E testing.
