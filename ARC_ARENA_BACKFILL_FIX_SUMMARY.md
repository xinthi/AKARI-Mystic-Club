# ARC Arena Backfill Fix - Summary

**Date:** 2025-01-XX  
**Status:** COMPLETE

## Problem

Approved leaderboard requests (e.g., Bitcoin) were not showing in Live/Upcoming sections because:
- Approval endpoint set flags but did NOT create arenas
- `live-leaderboards` API requires `arenas.status = 'active'` to return results
- No arena = no visibility, regardless of approval status

## Solution Implemented

### A) Hardened Approval Endpoint
**File:** `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts`

**Changes:**
1. Auto-create arena on approval with `arc_access_level === 'leaderboard'`
2. Stable slug generation: `${project.slug}-leaderboard` with numeric suffix (`-2`, `-3`, etc.) if needed
3. Always set arena `status = 'active'` (API uses dates to determine Live vs Upcoming)
4. Update existing arenas to 'active' if they exist but are inactive
5. Update arena dates if provided in approval (prevents stale dates)
6. Regression guard: verify arena was created after approval
7. Never fail approval if arena operations fail (log error, continue)

### B) Made Live Leaderboards Resilient
**File:** `src/web/pages/api/portal/arc/live-leaderboards.ts`

**Changes:**
1. Select arena `starts_at` and `ends_at` fields in query
2. Use arena dates as primary source, fallback to `arc_project_features` dates
3. Handle null dates gracefully (treat as always active/live)
4. Clear comments explaining date priority logic

### C) Backfill Endpoint (One-Time Fix)
**File:** `src/web/pages/api/portal/admin/arc/backfill-arenas.ts` (NEW)

**Features:**
1. Finds all approved leaderboard projects missing arenas or with inactive arenas
2. Creates default arenas for projects without them
3. Activates existing inactive arenas
4. Updates arena dates from `arc_project_features` if missing
5. Returns summary: `totalEligible`, `createdCount`, `updatedCount`, `skippedCount`, `errors[]`
6. Superadmin-only (enforces authentication + authorization)

### D) Admin UI Button
**File:** `src/web/pages/portal/admin/arc/leaderboard-requests.tsx`

**Changes:**
1. Added "Backfill Arenas" button in header (superadmin only)
2. Shows summary results after backfill completes
3. Displays errors if any occurred
4. Auto-reloads requests table after backfill

## Behavior Changes

**Before:**
- Approval → Set flags only → No arena → Not visible in Live/Upcoming

**After:**
- Approval → Set flags + Auto-create arena → Arena status='active' → Visible immediately
- Backfill → Repair existing approved projects → Create/activate arenas → All appear in Live/Upcoming

## Files Changed

1. `src/web/pages/api/portal/admin/arc/leaderboard-requests/[id].ts` - Auto-arena creation on approval
2. `src/web/pages/api/portal/arc/live-leaderboards.ts` - Defensive date handling
3. `src/web/pages/api/portal/admin/arc/backfill-arenas.ts` - NEW backfill endpoint
4. `src/web/pages/portal/admin/arc/leaderboard-requests.tsx` - Backfill button + results display

## Testing Checklist

1. **New Approval:**
   - Approve a pending leaderboard request
   - Verify arena is created automatically
   - Check `/api/portal/arc/live-leaderboards` includes it

2. **Backfill Existing:**
   - Click "Backfill Arenas" button in admin UI
   - Verify summary shows created/updated counts
   - Check Bitcoin (or other approved project) now has arena
   - Verify it appears in Live/Upcoming

3. **Regression Guard:**
   - Check server logs after approval for "REGRESSION GUARD" messages
   - Should not see "REGRESSION GUARD FAILED" errors

## Database Verification Queries

```sql
-- Check approved project with arena status
SELECT 
  p.slug,
  p.name,
  p.arc_active,
  p.arc_access_level,
  apa.application_status,
  apf.option2_normal_unlocked,
  apf.leaderboard_enabled,
  a.id as arena_id,
  a.slug as arena_slug,
  a.status as arena_status,
  a.starts_at,
  a.ends_at
FROM projects p
LEFT JOIN arc_project_access apa ON apa.project_id = p.id
LEFT JOIN arc_project_features apf ON apf.project_id = p.id
LEFT JOIN arenas a ON a.project_id = p.id
WHERE p.slug = 'bitcoin' OR p.name ILIKE '%bitcoin%'
ORDER BY a.created_at DESC;
```

## Next Steps

1. Run backfill endpoint once to fix existing approved projects
2. Future approvals will automatically create arenas
3. Monitor for any "REGRESSION GUARD FAILED" log messages

