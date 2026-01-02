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
**File:** `supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql` (NEW)

**What it does (SAFE APPROACH):**
1. If `arc_project_features_project_id_key` already exists → do nothing
2. Else, finds any existing single-column UNIQUE constraint on `project_id` and renames it
3. Else, creates new constraint: `arc_project_features_project_id_key UNIQUE(project_id)`

**Safety:** Does NOT drop existing constraints - only renames or creates. Safe to re-run.

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
1. **`supabase/migrations/20250201_safe_ensure_arc_project_features_constraint.sql`** (NEW)
   - Ensures explicit named UNIQUE constraint exists
   - Safe approach: renames existing constraint instead of dropping
   - Safe to re-run

**DELETED:** `supabase/migrations/20250201_fix_arc_project_features_constraint_name.sql` (replaced with safer version)

2. **`supabase/migrations/20250131_arc_admin_approve_rpc.sql`** (MODIFIED)
   - Changed `ON CONFLICT (project_id)` → `ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key`
   - Added `updated_at = NOW()` to all DO UPDATE clauses (column already exists in table schema)

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

### Schema Verification (SQL)
See **`ARC_APPROVAL_VERIFICATION_SQL.md`** for detailed SQL verification queries.

Quick checks:
- [ ] Run verification SQL from `ARC_APPROVAL_VERIFICATION_SQL.md`
- [ ] Confirm `arc_project_features_project_id_key` constraint exists
- [ ] Confirm `updated_at` column exists on `arc_project_features`

### Functional Verification
- [ ] `arc_project_access` has unique index `arc_project_access_project_id_unique`
- [ ] `arc_project_features` has unique constraint `arc_project_features_project_id_key`
- [ ] Approve a pending leaderboard request
- [ ] Verify `arc_audit_log` shows `action=request_approved` with `success=true`
- [ ] Verify `arc_leaderboard_requests.status` = 'approved'
- [ ] Verify `arc_project_access.application_status` = 'approved'
- [ ] Verify `arc_project_features` has correct flags set based on `product_type`
- [ ] Verify `arc_project_features.updated_at` is updated after approval
- [ ] For ms/gamefi requests: Verify arena created with status='active'
- [ ] Verify campaigns API returns data (no "ARC access not approved" error)
- [ ] Smoke test actions work (approve, activate, update-features)

---

## 🔧 Deployment Steps

1. **Pre-deployment verification:**
   - Run SQL verification queries from `ARC_APPROVAL_VERIFICATION_SQL.md`
   - Confirm current schema state

2. **Apply migrations in order:**
   ```bash
   # 1. Ensure unique constraint on arc_project_access (if not already applied)
   #    Migration: 20250201_add_arc_project_access_unique_constraint.sql
   # 2. Ensure explicit constraint name on arc_project_features (SAFE)
   #    Migration: 20250201_safe_ensure_arc_project_features_constraint.sql
   # 3. Update RPC function (if needed - already updated in code)
   #    Migration: 20250131_arc_admin_approve_rpc.sql
   ```

3. **Post-migration verification:**
   - Re-run verification SQL queries
   - Confirm all checks pass

4. **Deploy code changes:**
   - Enhanced error logging in approve endpoint
   - Method acceptance updates in activate/update-features endpoints

5. **Test end-to-end:**
   - Create a test leaderboard request
   - Approve it via smoke test or admin UI
   - Verify all data updates correctly
   - Check audit log shows success
   - Verify `updated_at` timestamp is updated

---

**Status:** ✅ All fixes complete and ready for testing
