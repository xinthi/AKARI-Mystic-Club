# ARC Live Leaderboards Audit Report

**Date:** 2025-01-23  
**Issue:** Approved campaigns/leaderboards not showing in Live or Upcoming sections

## Root Cause Analysis

The `/api/portal/arc/live-leaderboards` endpoint requires **ALL** of the following conditions to show a leaderboard:

1. ✅ **Arena exists** with `status = 'active'` (line 66)
2. ✅ **Project has Option 2 unlocked** via `requireArcAccess(supabase, project.id, 2)` (lines 124-128)
3. ✅ **Date filtering** (lines 148-165):
   - If `startAt` and `endAt` exist: current time must be within range (live) or start is in future (upcoming)
   - If dates are null: treated as always active (live)

## Issue Identified

**Approved requests do NOT automatically create arenas.**

When a request is approved via `/api/portal/admin/arc/leaderboard-requests/[id]`:
- ✅ Sets `option2_normal_unlocked = true` in `arc_project_features`
- ✅ Sets `leaderboard_enabled = true` in `arc_project_features`
- ✅ Sets `leaderboard_start_at` and `leaderboard_end_at` (if provided in approval)
- ❌ **Does NOT create an arena**

Arenas are separate entities that must be:
- Created manually through admin UI (`/portal/arc/admin/[projectSlug]`)
- Created programmatically via `/api/portal/arc/arenas-admin`
- Set to `status = 'active'` to appear in live leaderboards

## Current API Logic (Correct)

The `/api/portal/arc/live-leaderboards` endpoint logic is **correct** but depends on:
1. Arena existing with `status = 'active'`
2. Project having Option 2 unlocked (checked via `requireArcAccess`)

If both conditions are met, it will show up in Live or Upcoming based on dates.

## Recommendations

### Option 1: Manual Arena Creation (Current Flow)
Projects need to have arenas created separately after approval. This is the current expected flow.

### Option 2: Auto-Create Default Arena on Approval (Future Enhancement)
Could modify approval endpoint to automatically create a default arena when `arc_access_level = 'leaderboard'` is approved.

### Option 3: Show Projects Without Arenas (Alternative Approach)
Modify the API to show projects that have Option 2 unlocked even if no arena exists yet (with a note that arena needs to be created).

## Verification Steps

To verify if approved projects are missing:
1. Check `arc_project_features` for projects with `option2_normal_unlocked = true`
2. Check if corresponding `arenas` exist with `status = 'active'` for those projects
3. If arenas don't exist → that's why they're not showing
4. If arenas exist but status != 'active' → need to activate them
5. If arenas exist and active but Option 2 check fails → check `requireArcAccess` logic

## Conclusion

The API logic is working as designed. Approved requests unlock the option but don't create arenas. Projects need arenas to be created and activated separately through the admin interface.

