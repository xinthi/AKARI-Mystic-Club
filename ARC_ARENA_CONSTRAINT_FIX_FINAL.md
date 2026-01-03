# ARC Arena Constraint Fix - Final Version

## Issue

The `arc_admin_approve_leaderboard_request` RPC function is still throwing:
```
duplicate key value violates unique constraint "uniq_ms_arena_per_project"
```

## Root Cause

The constraint `uniq_ms_arena_per_project` exists and enforces one MS arena per project. However:

1. **Legacy arenas have `kind = NULL`**: Arenas created before the `kind` column was added have `kind = NULL`
2. **RPC function wasn't checking for NULL**: The query `kind IN ('ms', 'legacy_ms')` doesn't match NULL values
3. **Constraint might include NULL**: The constraint might be checking `kind IN ('ms', 'legacy_ms') OR kind IS NULL`

## Fixes Applied

### 1. Updated RPC Function to Handle NULL Kind

**File:** `supabase/migrations/20250131_arc_admin_approve_rpc.sql`

**Changes:**
- All queries now check: `kind IN ('ms', 'legacy_ms') OR kind IS NULL`
- This ensures legacy arenas (with NULL kind) are found and updated instead of creating duplicates

**Updated queries:**
- Initial SELECT ... FOR UPDATE
- Double-check SELECT (before INSERT)
- UPDATE statements to end other arenas

### 2. Updated Migration to Handle NULL Kind

**File:** `supabase/migrations/20250202_add_arena_kind_and_constraint.sql`

**Changes:**
- Sets `kind = 'legacy_ms'` for existing arenas with `kind IS NULL`
- Drops and recreates the constraint to include NULL handling
- Removes duplicates before creating constraint

## How to Apply

1. **Run the migrations:**
   ```bash
   # The RPC function uses CREATE OR REPLACE, so it's safe to re-run
   supabase migration up
   ```

2. **If constraint already exists, you may need to run this SQL manually:**
   ```sql
   -- Drop existing constraint
   DROP INDEX IF EXISTS uniq_ms_arena_per_project;
   
   -- Set NULL kind to 'legacy_ms' for existing arenas
   UPDATE arenas
   SET kind = 'legacy_ms'
   WHERE kind IS NULL;
   
   -- Recreate constraint
   CREATE UNIQUE INDEX uniq_ms_arena_per_project 
   ON arenas(project_id) 
   WHERE kind IN ('ms', 'legacy_ms') OR kind IS NULL;
   ```

3. **Verify the fix:**
   ```sql
   -- Check that all arenas have kind set
   SELECT 
     COUNT(*) FILTER (WHERE kind IS NULL) as null_kind_count,
     COUNT(*) FILTER (WHERE kind IN ('ms', 'legacy_ms')) as ms_arena_count
   FROM arenas;
   
   -- Should show 0 null_kind_count
   ```

## Expected Behavior

- **If arena exists (any kind, including NULL):** UPDATE the existing arena, set `kind='ms'`, `status='active'`
- **If no arena exists:** INSERT new arena with `kind='ms'`
- **No constraint violations:** The NULL check ensures we find legacy arenas and update them instead of creating duplicates

## Verification

After applying the fix, verify:
1. Approval succeeds without constraint errors
2. Existing arenas (including NULL kind) are updated (not duplicated)
3. New arenas are created only when none exist
4. All arenas have `kind` set (no NULL values)

## Important Notes

- The constraint `uniq_ms_arena_per_project` enforces: **one arena per project where `kind IN ('ms', 'legacy_ms') OR kind IS NULL`**
- Legacy arenas (NULL kind) are treated as MS arenas and will be updated/reused
- The RPC function now handles all cases: existing MS arenas, legacy arenas (NULL), and new inserts
