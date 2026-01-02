# ARC Arena Unique Constraint Fix

**Date:** 2025-02-01  
**Issue:** Approval fails with `duplicate key value violates unique constraint "uniq_ms_arena_per_project"`

---

## Problem

The `arc_admin_approve_leaderboard_request` RPC function was attempting to INSERT a new arena for ms/gamefi product types, but the `arenas` table has a unique constraint `uniq_ms_arena_per_project` that prevents multiple ms/legacy_ms arenas per project.

---

## Solution

Updated the RPC function to check for an existing arena before inserting:

1. **Check for existing arena:** Query for existing ms/legacy_ms arena for the project
2. **If exists:** UPDATE the existing arena instead of inserting
3. **If not exists:** INSERT new arena as before
4. **Add metadata:** Track whether arena was updated or inserted new

---

## Changes Made

### File: `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

#### 1. Added Variable Declaration
```sql
v_existing_arena_id UUID;
v_arena_mode TEXT; -- 'updated_existing' or 'inserted_new'
```

#### 2. Updated Step 6: Arena Creation Logic

**Before:** Always INSERT (caused unique constraint violation)

**After:**
- Check for existing arena: `SELECT id INTO v_existing_arena_id FROM arenas WHERE project_id = ... AND kind IN ('ms','legacy_ms') ORDER BY created_at DESC LIMIT 1;`
- If exists: UPDATE existing arena with new values
- If not: INSERT new arena
- Track mode: Set `v_arena_mode` to `'updated_existing'` or `'inserted_new'`

#### 3. Updated Return Value
Added `arenaMode` to the `created` object in the return value:
```sql
'created', jsonb_build_object(
  'arenaId', v_arena_id,
  'arenaMode', v_arena_mode
)
```

### File: `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts`

Updated audit log metadata to include `arenaMode`:
```typescript
metadata: {
  ...
  created: {
    ...(result.created?.arenaId && { arenaId: result.created.arenaId }),
    ...(result.created?.arenaMode && { arenaMode: result.created.arenaMode }),
  },
}
```

---

## Verification Steps

### 1. Apply Migration

Run the updated migration:
```bash
# The RPC function will be replaced with CREATE OR REPLACE
supabase/migrations/20250131_arc_admin_approve_rpc.sql
```

### 2. Test Approval Flow

#### A. Create Pending Request
```bash
POST /api/portal/arc/leaderboard-requests
{
  "project_id": "<test_project_id>",
  "product_type": "ms",
  "start_at": "2025-02-01T00:00:00Z",
  "end_at": "2025-12-31T23:59:59Z",
  "justification": "Test request"
}
```

#### B. Approve Request
```bash
PUT /api/portal/admin/arc/leaderboard-requests/<request_id>/approve
```

#### C. Verify Results

**Database Checks:**

1. **Request Status:**
```sql
SELECT status, decided_at
FROM arc_leaderboard_requests
WHERE id = '<request_id>';
```
**Expected:** `status = 'approved'`, `decided_at IS NOT NULL`

2. **Project Access:**
```sql
SELECT application_status, approved_at
FROM arc_project_access
WHERE project_id = '<project_id>'
ORDER BY updated_at DESC LIMIT 1;
```
**Expected:** `application_status = 'approved'`, `approved_at IS NOT NULL`

3. **Project Features:**
```sql
SELECT leaderboard_enabled, gamefi_enabled, crm_enabled, updated_at
FROM arc_project_features
WHERE project_id = '<project_id>';
```
**Expected:** Feature flags set correctly, `updated_at` is recent

4. **Arena Created/Updated:**
```sql
SELECT id, kind, status, name, created_at, updated_at
FROM arenas
WHERE project_id = '<project_id>' AND kind IN ('ms', 'legacy_ms')
ORDER BY updated_at DESC LIMIT 1;
```
**Expected:** Arena exists, `status = 'active'`, `kind = 'ms'`

5. **Audit Log:**
```sql
SELECT success, message, metadata
FROM arc_audit_log
WHERE project_id = '<project_id>' AND action = 'request_approved'
ORDER BY created_at DESC LIMIT 1;
```
**Expected:** `success = true`, metadata includes `arenaMode: 'updated_existing'` or `'inserted_new'`

6. **Campaigns API:**
```bash
GET /api/portal/arc/campaigns?projectId=<project_id>
```
**Expected:** Returns `{ ok: true, campaigns: [...] }` (NOT "ARC access not approved")

---

## Expected Behavior

### First Approval (New Arena)
- Existing arena: None found
- Action: INSERT new arena
- `arenaMode`: `'inserted_new'`
- Result: Arena created successfully

### Subsequent Approvals (Existing Arena)
- Existing arena: Found existing ms/legacy_ms arena
- Action: UPDATE existing arena
- `arenaMode`: `'updated_existing'`
- Result: Arena updated to active with new dates, no constraint violation

---

## Testing Checklist

- [ ] First approval: Arena inserted, `arenaMode = 'inserted_new'`
- [ ] Second approval: Arena updated, `arenaMode = 'updated_existing'`
- [ ] Request status becomes `approved`
- [ ] Project access becomes `approved`
- [ ] Project features flags set correctly
- [ ] `updated_at` refreshed on `arc_project_features`
- [ ] Audit log shows `success = true`
- [ ] Campaigns API no longer returns "ARC access not approved"
- [ ] No unique constraint violation errors

---

## Files Changed

1. `supabase/migrations/20250131_arc_admin_approve_rpc.sql` - Updated arena creation logic
2. `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts` - Added arenaMode to audit metadata

---

**Status:** ✅ Fix complete, ready for testing
