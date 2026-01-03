# ARC Smoke Test Analysis

## Test Report Summary

**Test Project:** Uniswap Labs 🦄 (`uniswap`)
**Project ID:** `528f2255-3914-44ed-8af0-4d53220e5036`
**Test Time:** `2026-01-03T13:32:09.584Z`

## Issues Found

### 1. ❌ `/api/portal/arc/projects` Returns Empty Array

**Expected:** Should return projects including Uniswap
**Actual:** `{ "ok": true, "projects": [] }`

**Root Cause Analysis:**
The `/api/portal/arc/projects` endpoint requires:
1. `arc_project_access.application_status = 'approved'` ✅ (Confirmed - has approved request)
2. `is_arc_company = true` ❓ (Likely missing)
3. AND one of:
   - `leaderboard_enabled = true` in `arc_project_features` ❓ (Might not be set)
   - OR active MS arena within date range ❌ (Arena starts in future)
   - OR approved leaderboard request ✅ (Confirmed - has approved request)

**The Problem:**
- Line 211 in `/api/portal/arc/projects.ts` filters by `.eq('is_arc_company', true)`
- If `is_arc_company` is not set to `true`, the project won't be returned even if it has approval

### 2. ⚠️ Arena Exists But Not Yet Live

**Arena Details:**
- ID: `902f2fd7-23ea-4de5-91cb-9aca6a9a9775`
- Kind: `ms`
- Status: `active`
- Starts: `2026-01-03T14:29:00+00:00` (Future)
- Ends: `2026-01-10T14:29:00+00:00`
- Test Time: `2026-01-03T13:32:09.584Z` (Before start)

**Issue:** Arena is scheduled but not yet live (starts in ~1 hour)
- The `/api/portal/arc/projects` endpoint filters arenas by date range
- Since arena hasn't started yet, it's not included in "active arenas"

### 3. ⚠️ Reports API Shows `"ms": false` for Uniswap

**From Reports API:**
```json
{
  "projectId": "528f2255-3914-44ed-8af0-4d53220e5036",
  "slug": "uniswap",
  "name": "Uniswap Labs 🦄",
  "ms": false,  // ❌ Should be true
  "gamefi": false,
  "crm": false
}
```

**This suggests:** `leaderboard_enabled` might not be set to `true` in `arc_project_features`

### 4. ✅ Approved Request Exists

**Confirmed:**
- Request ID: `47c5b895-3bcb-4bfa-a069-5d23e7cb329f`
- Status: `approved`
- Product Type: `ms`
- Start: `2026-01-03T14:29:00+00:00`
- End: `2026-01-10T14:29:00+00:00`

## Fixes Needed

### Fix 1: Ensure `is_arc_company = true`

The project must have `is_arc_company = true` to appear in `/api/portal/arc/projects`.

**SQL Check:**
```sql
SELECT id, name, is_arc_company, arc_access_level, arc_active
FROM projects
WHERE id = '528f2255-3914-44ed-8af0-4d53220e5036';
```

**If `is_arc_company = false` or `NULL`:**
```sql
UPDATE projects
SET is_arc_company = true
WHERE id = '528f2255-3914-44ed-8af0-4d53220e5036';
```

### Fix 2: Verify `leaderboard_enabled` is Set

**SQL Check:**
```sql
SELECT project_id, leaderboard_enabled, leaderboard_start_at, leaderboard_end_at
FROM arc_project_features
WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036';
```

**If missing or `leaderboard_enabled = false`:**
The RPC function should have set this on approval. If not, manually set:
```sql
INSERT INTO arc_project_features (
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  option2_normal_unlocked
)
VALUES (
  '528f2255-3914-44ed-8af0-4d53220e5036',
  true,
  '2026-01-03T14:29:00+00:00',
  '2026-01-10T14:29:00+00:00',
  true
)
ON CONFLICT (project_id)
DO UPDATE SET
  leaderboard_enabled = true,
  leaderboard_start_at = EXCLUDED.leaderboard_start_at,
  leaderboard_end_at = EXCLUDED.leaderboard_end_at,
  option2_normal_unlocked = true,
  updated_at = NOW();
```

### Fix 3: Update `/api/portal/arc/projects` to Include Scheduled Arenas

**Current Logic:** Only includes arenas that are currently live (within date range)

**Issue:** Projects with scheduled (future) arenas won't appear until arena starts

**Options:**
1. **Include scheduled arenas** - Show projects with arenas that start in the future
2. **Include approved requests** - Already does this, but might be filtered out by `is_arc_company`

**Recommendation:** The approved request should be enough. The issue is likely `is_arc_company = false`.

## Verification Queries

Run these in Supabase SQL Editor to diagnose:

```sql
-- 1. Check project ARC settings
SELECT 
  id,
  name,
  slug,
  is_arc_company,
  arc_access_level,
  arc_active
FROM projects
WHERE id = '528f2255-3914-44ed-8af0-4d53220e5036';

-- 2. Check ARC access approval
SELECT 
  project_id,
  application_status,
  approved_at,
  approved_by_profile_id
FROM arc_project_access
WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036';

-- 3. Check ARC features
SELECT 
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  option2_normal_unlocked
FROM arc_project_features
WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036';

-- 4. Check approved requests
SELECT 
  id,
  project_id,
  product_type,
  status,
  start_at,
  end_at
FROM arc_leaderboard_requests
WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036'
  AND status = 'approved';

-- 5. Check arenas
SELECT 
  id,
  project_id,
  kind,
  status,
  starts_at,
  ends_at,
  name
FROM arenas
WHERE project_id = '528f2255-3914-44ed-8af0-4d53220e5036'
ORDER BY created_at DESC;
```

## Expected Results After Fix

1. ✅ `/api/portal/arc/projects` should return Uniswap
2. ✅ `/portal/arc/uniswap` should show leaderboard (even if arena not yet live)
3. ✅ Reports API should show `"ms": true` for Uniswap
4. ✅ Smoke test should find the project

## Quick Fix Script

If you want to fix Uniswap specifically:

```sql
-- Step 1: Ensure is_arc_company = true
UPDATE projects
SET is_arc_company = true
WHERE id = '528f2255-3914-44ed-8af0-4d53220e5036'
  AND (is_arc_company IS NULL OR is_arc_company = false);

-- Step 2: Ensure features are set (if RPC didn't set them)
INSERT INTO arc_project_features (
  project_id,
  leaderboard_enabled,
  leaderboard_start_at,
  leaderboard_end_at,
  option2_normal_unlocked
)
VALUES (
  '528f2255-3914-44ed-8af0-4d53220e5036',
  true,
  '2026-01-03T14:29:00+00:00',
  '2026-01-10T14:29:00+00:00',
  true
)
ON CONFLICT (project_id)
DO UPDATE SET
  leaderboard_enabled = COALESCE(arc_project_features.leaderboard_enabled, true),
  leaderboard_start_at = COALESCE(arc_project_features.leaderboard_start_at, EXCLUDED.leaderboard_start_at),
  leaderboard_end_at = COALESCE(arc_project_features.leaderboard_end_at, EXCLUDED.leaderboard_end_at),
  option2_normal_unlocked = COALESCE(arc_project_features.option2_normal_unlocked, true),
  updated_at = NOW();
```
