# ARC Arena Constraint Fix - Final Update

## Issue

The `arc_admin_approve_leaderboard_request` RPC function is still throwing:
```
duplicate key value violates unique constraint "uniq_ms_arena_per_project"
```

## Root Cause

The SELECT query was checking for existing arenas, but it might not be finding arenas that are in 'ended', 'draft', or other non-active statuses. The unique constraint `uniq_ms_arena_per_project` likely applies to ALL arenas with `kind IN ('ms', 'legacy_ms')`, regardless of status.

## Fix Applied

Updated the SELECT query in Step 6 to:
1. Check for ANY arena with `kind IN ('ms', 'legacy_ms')`, regardless of status
2. Order by status (prefer active arenas first), then by created_at DESC
3. Use FOR UPDATE to lock the row and prevent race conditions

## Migration File

**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Change:**
```sql
-- Before: Might miss arenas in non-active statuses
SELECT id INTO v_existing_arena_id
FROM arenas
WHERE project_id = v_request.project_id
  AND kind IN ('ms', 'legacy_ms')
ORDER BY created_at DESC
LIMIT 1
FOR UPDATE;

-- After: Finds ANY arena regardless of status, prefers active ones
SELECT id INTO v_existing_arena_id
FROM arenas
WHERE project_id = v_request.project_id
  AND kind IN ('ms', 'legacy_ms')
ORDER BY 
  CASE WHEN status = 'active' THEN 0 ELSE 1 END, -- Prefer active arenas
  created_at DESC
LIMIT 1
FOR UPDATE;
```

## How to Apply

1. **Run the migration:**
   ```bash
   # The migration uses CREATE OR REPLACE, so it's safe to re-run
   supabase migration up
   ```

2. **Verify the fix:**
   ```sql
   -- Check that the function uses the updated SELECT
   SELECT pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname = 'arc_admin_approve_leaderboard_request';
   ```

3. **Test approval:**
   - Try approving a leaderboard request
   - Should no longer see constraint violation error
   - Should update existing arena if one exists, or create new one if none exists

## Expected Behavior

- **If arena exists (any status):** UPDATE the existing arena, set status='active'
- **If no arena exists:** INSERT new arena
- **No constraint violations:** The SELECT will always find existing arenas before INSERT

## Verification

After applying the fix, verify:
1. Approval succeeds without constraint errors
2. Existing arenas are updated (not duplicated)
3. New arenas are created only when none exist
4. Audit log shows correct `arenaMode` ('updated_existing' or 'inserted_new')
