# ARC Smoke Test Fixes

## Issues Fixed

### 1. ✅ `/api/portal/arc/projects` Returns Empty Array

**Problem:** Projects with approved ARC access were not appearing in `/api/portal/arc/projects` because:
- The endpoint filtered by `.eq('is_arc_company', true)` 
- Projects approved via the RPC didn't have `is_arc_company` set to `true`

**Fix:**
1. **Updated RPC Function** (`supabase/migrations/20250131_arc_admin_approve_rpc.sql`):
   - Automatically sets `is_arc_company = true` when approving a leaderboard request
   - Removed the validation check that blocked approval if `is_arc_company = false`

2. **Updated API Endpoint** (`src/web/pages/api/portal/arc/projects.ts`):
   - Changed filter from `.eq('is_arc_company', true)` to `.or('is_arc_company.eq.true,is_arc_company.is.null')`
   - This allows projects with `is_arc_company = NULL` to appear (backward compatibility)

### 2. ✅ Reports API Shows `"ms": false` for Approved Projects

**Problem:** Projects with approved MS requests weren't showing `"ms": true` in reports because:
- `leaderboard_enabled` might not be set in `arc_project_features`
- The RPC should set this, but existing data might be missing it

**Fix:**
- Created migration `20250203_fix_arc_company_flag.sql` that:
  1. Sets `is_arc_company = true` for all projects with approved ARC access
  2. Ensures `leaderboard_enabled = true` for projects with approved MS requests
  3. Updates existing `arc_project_features` rows to set `leaderboard_enabled = true` if missing

### 3. ✅ Arena Scheduled But Not Yet Live

**Status:** This is expected behavior. The arena starts at `2026-01-03T14:29:00+00:00` but the test ran at `2026-01-03T13:32:09.584Z` (before start).

**Note:** The `/api/portal/arc/projects` endpoint now includes projects with:
- Approved leaderboard requests (even if arena not yet live)
- `leaderboard_enabled = true` in `arc_project_features`
- Active arenas within date range

So projects will appear even if their arena hasn't started yet.

## Migration to Run

Run the new migration to fix existing data:

```bash
# Using Supabase CLI
supabase migration up

# Or run directly in Supabase SQL Editor
# File: supabase/migrations/20250203_fix_arc_company_flag.sql
```

## Verification

After running the migration, verify:

1. **Check Uniswap project:**
   ```sql
   SELECT id, name, is_arc_company
   FROM projects
   WHERE slug = 'uniswap';
   -- Should show is_arc_company = true
   ```

2. **Check ARC features:**
   ```sql
   SELECT project_id, leaderboard_enabled, leaderboard_start_at, leaderboard_end_at
   FROM arc_project_features
   WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036';
   -- Should show leaderboard_enabled = true
   ```

3. **Test API:**
   - `/api/portal/arc/projects` should return Uniswap
   - `/api/portal/admin/arc/reports/platform` should show `"ms": true` for Uniswap

## Files Changed

1. `supabase/migrations/20250131_arc_admin_approve_rpc.sql`
   - Added automatic `is_arc_company = true` update on approval
   - Removed blocking validation check

2. `src/web/pages/api/portal/arc/projects.ts`
   - Made `is_arc_company` filter more lenient

3. `supabase/migrations/20250203_fix_arc_company_flag.sql` (NEW)
   - Migration to fix existing data

## Next Steps

1. Run the migration in Supabase
2. Re-run the smoke test to verify fixes
3. Check that `/api/portal/arc/projects` now returns Uniswap
4. Verify reports API shows `"ms": true` for Uniswap
