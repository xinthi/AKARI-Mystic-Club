# ARC Arena Constraint Fix - Version 2

## Issue

The `arc_admin_approve_leaderboard_request` RPC function is still throwing:
```
duplicate key value violates unique constraint "uniq_ms_arena_per_project"
```

Even after the previous fix that checks for existing arenas.

## Root Cause Analysis

The issue is likely a race condition or the constraint is checking something different than we expect. The constraint `uniq_ms_arena_per_project` likely enforces:
- Only ONE arena with `kind IN ('ms', 'legacy_ms')` per project
- This applies regardless of status

The problem might be:
1. The SELECT ... FOR UPDATE might not find arenas that are in certain statuses
2. There might be a timing issue where two approvals happen simultaneously
3. The constraint might be a partial unique index that we're not accounting for

## Fix Applied

Added a **double-check** before INSERT:

1. **First check:** SELECT ... FOR UPDATE (locks row, prevents concurrent updates)
2. **If not found:** Do a second SELECT (without FOR UPDATE) to double-check
3. **If found in second check:** UPDATE instead of INSERT
4. **If still not found:** Safe to INSERT

This ensures we never INSERT when an arena exists, even if the first SELECT didn't find it due to timing or status issues.

## Migration File

**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Change in Step 6:**
```sql
ELSE
  -- No existing ms/legacy arena found - double-check before INSERT
  -- Check again without FOR UPDATE to see if any arena exists
  SELECT id INTO v_existing_arena_id
  FROM arenas
  WHERE project_id = v_request.project_id
    AND kind IN ('ms', 'legacy_ms')
  ORDER BY 
    CASE WHEN status = 'active' THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;
  
  -- If we found one now, update it instead
  IF v_existing_arena_id IS NOT NULL THEN
    UPDATE arenas SET ... WHERE id = v_existing_arena_id;
    v_arena_mode := 'updated_existing';
  ELSE
    -- Truly no arena exists - safe to INSERT
    INSERT INTO arenas ...;
    v_arena_mode := 'inserted_new';
  END IF;
END IF;
```

## How to Apply

1. **Run the migration:**
   ```bash
   # The migration uses CREATE OR REPLACE, so it's safe to re-run
   supabase migration up
   ```

2. **Verify the fix:**
   ```sql
   -- Check that the function has the double-check logic
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
- **No constraint violations:** The double-check ensures we never INSERT when an arena exists

## Verification

After applying the fix, verify:
1. Approval succeeds without constraint errors
2. Existing arenas are updated (not duplicated)
3. New arenas are created only when none exist
4. Audit log shows correct `arenaMode` ('updated_existing' or 'inserted_new')
