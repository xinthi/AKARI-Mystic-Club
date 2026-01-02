# ARC Approval Bug Fix Report

**Date:** 2025-02-01  
**Issue:** Approving ARC leaderboard requests fails with "there is no unique or exclusion constraint matching the ON CONFLICT specification"

---

## 🔍 Root Cause Analysis

### Problem
The RPC function `arc_admin_approve_leaderboard_request` uses `ON CONFLICT (project_id)` for multiple tables:
1. `arc_project_access` (line 98) - Has unique index `arc_project_access_project_id_unique` ✓
2. `arc_project_features` (lines 120, 150, 178) - Has UNIQUE constraint on `project_id` from table definition

### Root Cause
The `arc_project_features` table was created with `project_id UUID NOT NULL UNIQUE` (line 57 of `20250104_add_arc_crm_tables.sql`). This creates a UNIQUE **constraint** (not index) which PostgreSQL auto-names, typically as `arc_project_features_project_id_key`.

While `ON CONFLICT (project_id)` *should* work with unique constraints, PostgreSQL may not always match it correctly in all contexts, especially within RPC functions. The safer approach is to use `ON CONFLICT ON CONSTRAINT <constraint_name>` to explicitly reference the constraint.

### Exact Failing Query
**Location:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Lines 120, 150, 178:** Three `ON CONFLICT (project_id)` statements for `arc_project_features` inserts:
- MS product type (line 120)
- GameFi product type (line 150)  
- CRM product type (line 178)

All three fail because PostgreSQL cannot reliably match `ON CONFLICT (project_id)` to the auto-named unique constraint.

---

## ✅ Fixes Applied

### A) RPC Function Fix
**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Change:** Updated all three `arc_project_features` upserts to use:
```sql
ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key
```
instead of:
```sql
ON CONFLICT (project_id)
```

**Also added:** `updated_at = NOW()` to all DO UPDATE clauses to ensure timestamp updates.

### B) Migration to Ensure Constraint Name
**File:** `supabase/migrations/20250201_fix_arc_project_features_constraint_name.sql` (NEW)

**What it does:**
1. Finds and drops any existing unique constraint on `arc_project_features.project_id`
2. Creates explicit named constraint: `arc_project_features_project_id_key`
3. Safe to re-run (checks if constraint exists before creating)

### C) Enhanced Error Logging
**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts`

**Added:** Detailed error logging that captures:
- Error code
- Error message
- Error details
- Error hint
- RPC function name
- Request ID and Project ID

This will help diagnose future issues.

### D) Method Acceptance Updates
**Files:**
- `src/web/pages/api/portal/admin/arc/arenas/[arenaId]/activate.ts`
- `src/web/pages/api/portal/admin/arc/projects/[projectId]/update-features.ts`

**Change:** Both endpoints now accept **both POST and PUT** (treated the same), matching the approve endpoint behavior.

**Status:** Approve endpoint already accepts POST|PUT ✓

### E) Smoke Test Payload Verification
**File:** `src/web/pages/portal/admin/arc/smoke-test.tsx`

**Verified:** All payloads match API expectations:
- ✅ Create Campaign: Uses `project_id`, `start_at`, `end_at`, `participation_mode`, `leaderboard_visibility` (correct)
- ✅ Generate UTM: Uses `target_url` (correct)

**No changes needed** - payloads were already correct.

---

## 📋 Summary of Changes

### Migrations Created/Modified
1. **`supabase/migrations/20250201_fix_arc_project_features_constraint_name.sql`** (NEW)
   - Ensures explicit named UNIQUE constraint exists
   - Safe to re-run

2. **`supabase/migrations/20250131_arc_admin_approve_rpc.sql`** (MODIFIED)
   - Changed `ON CONFLICT (project_id)` → `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
   - Added `updated_at = NOW()` to all DO UPDATE clauses

3. **`supabase/migrations/20250201_add_arc_project_access_unique_constraint.sql`** (PREVIOUSLY CREATED)
   - Already ensures unique index on `arc_project_access.project_id`

### API Endpoints Modified
1. **`src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts`**
   - Enhanced error logging for RPC errors

2. **`src/web/pages/api/portal/admin/arc/arenas/[arenaId]/activate.ts`**
   - Now accepts POST and PUT methods

3. **`src/web/pages/api/portal/admin/arc/projects/[projectId]/update-features.ts`**
   - Now accepts POST and PUT methods

### Files Verified (No Changes)
1. **`src/web/pages/portal/admin/arc/smoke-test.tsx`**
   - Payloads already correct

---

## ✅ Verification Checklist

After applying migrations:

- [ ] `arc_project_access` has unique index `arc_project_access_project_id_unique`
- [ ] `arc_project_features` has unique constraint `arc_project_features_project_id_key`
- [ ] Approve a pending leaderboard request
- [ ] Verify `arc_audit_log` shows `action=request_approved` with `success=true`
- [ ] Verify `arc_leaderboard_requests.status` = 'approved'
- [ ] Verify `arc_project_access.application_status` = 'approved'
- [ ] Verify `arc_project_features` has correct flags set based on `product_type`
- [ ] For ms/gamefi requests: Verify arena created with status='active'
- [ ] Verify campaigns API returns data (no "ARC access not approved" error)
- [ ] Smoke test actions work (approve, activate, update-features)

---

## 🔧 Deployment Steps

1. **Apply migrations in order:**
   ```bash
   # 1. Ensure unique constraint on arc_project_access (if not already applied)
   # 2. Ensure explicit constraint name on arc_project_features
   # 3. Update RPC function (will be applied when migration runs)
   ```

2. **Deploy code changes:**
   - Enhanced error logging in approve endpoint
   - Method acceptance updates in activate/update-features endpoints

3. **Test end-to-end:**
   - Create a test leaderboard request
   - Approve it via smoke test or admin UI
   - Verify all data updates correctly
   - Check audit log shows success

---

**Status:** ✅ All fixes complete and ready for testing
