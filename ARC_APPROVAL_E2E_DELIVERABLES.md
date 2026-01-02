# ARC Approval E2E Verification - Deliverables

**Date:** 2025-02-01  
**Status:** ✅ Complete

---

## Files Changed

### 1. New Files Created

#### A. Verification API Endpoint
**File:** `src/web/pages/api/portal/admin/arc/verify-approval.ts`

**Purpose:** Admin-only endpoint that takes a `projectId`, finds the latest pending request, approves it via RPC, and returns comprehensive verification data.

**Features:**
- SuperAdmin authentication required
- Finds latest pending `arc_leaderboard_requests` for project
- Calls RPC `arc_admin_approve_leaderboard_request` directly
- Returns:
  - RPC result
  - Request status (`arc_leaderboard_requests.status`)
  - Project access status (`arc_project_access.application_status`, `approved_at`)
  - Project features flags (`arc_project_features.*`, `updated_at`)
  - Newest arena for project (if ms/gamefi)

#### B. Verification SQL Documentation
**File:** `ARC_APPROVAL_E2E_VERIFICATION_SQL.md`

**Purpose:** Comprehensive SQL verification queries to run in Supabase to confirm the fix.

**Contents:**
- Pre-approval check (find pending request)
- Post-approval verification queries for:
  - Request status
  - Project access
  - Project features
  - Arena creation
  - Audit log
- Constraint verification
- RPC function verification
- Comprehensive single-query verification

### 2. Files Modified

#### A. Approve Endpoint Enhanced
**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[requestId]/approve.ts`

**Changes:**
- Enhanced error response to include full RPC error details (`code`, `message`, `details`, `hint`)
- Updated response type to include `rpcError` field
- Returns 200 + `{ ok: true }` on success
- Returns detailed RPC error fields on failure

**Before:**
```typescript
return res.status(500).json({
  ok: false,
  error: errorMessage,
});
```

**After:**
```typescript
return res.status(500).json({
  ok: false,
  error: errorMessage,
  rpcError: {
    code: rpcError.code,
    message: rpcError.message,
    details: rpcError.details,
    hint: rpcError.hint,
  },
});
```

#### B. Smoke Test Page Enhanced
**File:** `src/web/pages/portal/admin/arc/smoke-test.tsx`

**Changes:**
1. **Added ApprovalVerification interface** for typed verification data
2. **Added state:** `approvalVerification` to store verification results
3. **Enhanced `handleApproveRequest`:**
   - Uses latest pending `requestId` (already implemented)
   - Calls approve endpoint with `PUT` method (already implemented)
   - After success:
     - Re-runs `GET /api/portal/arc/campaigns?projectId=...`
     - Re-runs `GET /api/portal/arc/projects`
     - Calls `/api/portal/admin/arc/verify-approval` to get comprehensive verification
     - Sets `approvalVerification` state
   - Shows detailed RPC error on failure (includes `code`, `message`, `details`, `hint`)
4. **Added UI component:** Green "Approval OK" status display showing:
   - Request status and decided_at
   - Project access status and approved_at
   - Project features flags (leaderboard/gamefi/crm) and updated_at
   - Arena details (if created)
   - Expandable RPC result details

**New UI Section:**
```tsx
{approvalVerification && (
  <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-2 h-2 rounded-full bg-green-500"></div>
      <h3 className="text-sm font-semibold text-green-400">✓ Approval OK</h3>
    </div>
    {/* Detailed verification data display */}
  </div>
)}
```

---

## Verification SQL Queries

### Quick Verification Checklist

Run these in Supabase SQL Editor:

#### 1. Find Pending Request
```sql
SELECT lr.id AS request_id, lr.project_id, lr.product_type, lr.status
FROM arc_leaderboard_requests lr
WHERE lr.status = 'pending'
ORDER BY lr.created_at DESC
LIMIT 1;
```

#### 2. Verify Request Approved
```sql
-- Replace <request_id> with actual ID
SELECT id, status, decided_at, decided_by
FROM arc_leaderboard_requests
WHERE id = '<request_id>' AND status = 'approved';
```

#### 3. Verify Project Access
```sql
-- Replace <project_id> with actual ID
SELECT application_status, approved_at, approved_by_profile_id
FROM arc_project_access
WHERE project_id = '<project_id>'
ORDER BY updated_at DESC
LIMIT 1;
```

#### 4. Verify Project Features
```sql
-- Replace <project_id> with actual ID
SELECT 
  leaderboard_enabled,
  gamefi_enabled,
  crm_enabled,
  updated_at
FROM arc_project_features
WHERE project_id = '<project_id>';
```

#### 5. Verify Arena (if ms/gamefi)
```sql
-- Replace <project_id> with actual ID
SELECT id, kind, status, name
FROM arenas
WHERE project_id = '<project_id>'
  AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC
LIMIT 1;
```

#### 6. Verify Constraint Exists
```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'arc_project_features'::regclass
  AND conname = 'arc_project_features_project_id_key';
```

#### 7. Verify updated_at Column
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'arc_project_features'
  AND column_name = 'updated_at';
```

#### 8. Verify RPC Uses Correct Constraint
```sql
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) LIKE '%ON CONFLICT ON CONSTRAINT arc_project_features_project_id_key%' 
    THEN '✓ CORRECT'
    ELSE '✗ WRONG'
  END AS status
FROM pg_proc
WHERE proname = 'arc_admin_approve_leaderboard_request';
```

**See `ARC_APPROVAL_E2E_VERIFICATION_SQL.md` for detailed queries and expected results.**

---

## Testing Workflow

### 1. Pre-Deployment
- [ ] Run pre-approval SQL queries to find a test request
- [ ] Verify constraint exists: `arc_project_features_project_id_key`
- [ ] Verify `updated_at` column exists on `arc_project_features`
- [ ] Verify RPC uses `ON CONFLICT ON CONSTRAINT`

### 2. Deploy Changes
- [ ] Deploy verification API endpoint
- [ ] Deploy enhanced approve endpoint
- [ ] Deploy enhanced smoke test page

### 3. Post-Deployment Verification
- [ ] Navigate to `/portal/admin/arc/smoke-test`
- [ ] Click "Approve Request" button
- [ ] Verify green "Approval OK" status appears
- [ ] Verify all verification fields are populated:
  - Request status = 'approved'
  - Project access status = 'approved'
  - Project features flags set correctly
  - Arena created (if ms/gamefi)
- [ ] Run post-approval SQL queries to confirm database state

### 4. Error Handling Test
- [ ] Test approval with invalid requestId (should show RPC error details)
- [ ] Test approval with already-approved request (should show detailed error)
- [ ] Verify error messages include `code`, `message`, `details`, `hint`

---

## Summary

✅ **Verification API Endpoint:** Created  
✅ **Enhanced Approve Endpoint:** Returns full RPC error details  
✅ **Enhanced Smoke Test:** Shows comprehensive approval verification  
✅ **Verification SQL:** Complete query set for Supabase validation  

All deliverables complete and ready for testing!
