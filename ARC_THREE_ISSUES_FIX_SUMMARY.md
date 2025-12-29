# ARC Three Issues Fix Summary

**Date:** 2025-01-22  
**Status:** ✅ All Issues Fixed

---

## Issue 1: follow-status Returns not_authenticated ✅

### Problem
`/api/portal/arc/follow-status` was returning `{ ok:false, error:"Not authenticated", reason:"not_authenticated" }` even when user was logged in.

### Root Cause
Client-side fetch calls were not including `credentials: 'include'`, so cookies weren't being sent to the API endpoints.

### Fix
Added `credentials: 'include'` to all fetch calls for ARC authentication endpoints:

**Files Changed:**
1. `src/web/pages/portal/arc/[slug].tsx`
   - Added `credentials: 'include'` to `follow-status`, `verify-follow`, and `join-leaderboard` fetch calls

2. `src/web/pages/portal/arc/project/[projectId].tsx`
   - Added `credentials: 'include'` to `follow-status`, `verify-follow`, and `join-leaderboard` fetch calls

3. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`
   - Added `credentials: 'include'` to `follow-status`, `verify-follow`, and `join-leaderboard` fetch calls

**Note:** The server-side cookie parsing was already improved in previous fix. The issue was that cookies weren't being sent from the client.

---

## Issue 2: CRM Tab Missing on Project Hub ✅

### Problem
CRM tab was not appearing on project hub page even when Option 1 was unlocked.

### Root Cause
1. Unified state was checking `crm_enabled` instead of `option1_crm_unlocked`
2. Unified state wasn't checking if project was approved
3. Tab navigation wasn't checking `canWrite` permission

### Fix

**Files Changed:**

1. `src/web/lib/arc/unified-state.ts`
   - Updated `ArcProjectFeaturesRow` interface to include `option1_crm_unlocked`, `option2_normal_unlocked`, `option3_gamified_unlocked`
   - Added check for `arc_project_access.application_status = 'approved'` before enabling modules
   - Updated CRM module to check `option1_crm_unlocked` (with fallback to `crm_enabled` for backward compatibility)
   - Updated Leaderboard module to check `option2_normal_unlocked`
   - Updated GameFi module to check `option3_gamified_unlocked`

2. `src/web/pages/portal/arc/[slug].tsx`
   - Updated tab navigation to only show CRM tab when `unifiedState?.modules?.crm?.enabled && canWrite`

**Logic:**
- CRM tab appears when:
  - Project is approved (`arc_project_access.application_status = 'approved'`)
  - Option 1 is unlocked (`arc_project_features.option1_crm_unlocked = true`)
  - User has canWrite permission (super_admin OR owner OR admin OR moderator)

---

## Issue 3: Live Leaderboards Section on ARC Home ✅

### Problem
ARC home page needed a "Live Leaderboards" section showing active arenas.

### Implementation

**Files Created:**
1. `src/web/pages/api/portal/arc/live-leaderboards.ts`
   - New API endpoint that returns active arenas with project info
   - Filters to only show arenas where project has Option 2 unlocked
   - Returns arena name, project name, X handle, creator count
   - Limited to 15 results (max 20)

**Files Changed:**
1. `src/web/pages/portal/arc/index.tsx`
   - Added `LiveLeaderboard` interface
   - Added state for live leaderboards (loading, error, data)
   - Added `useEffect` to fetch live leaderboards on mount
   - Added "Live Leaderboards" section after header, before "Top Projects" section
   - Displays cards with arena name, project name, X handle, creator count
   - Links to project hub and arena page

**Features:**
- Shows active arenas (status = 'active')
- Only shows arenas where project has Option 2 unlocked
- Displays creator count for each arena
- Links to project hub (`/portal/arc/[slug]`) and arena page (`/portal/arc/[slug]/arena/[arenaSlug]`)
- Responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
- Loading and error states

---

## Files Changed Summary

### Modified Files:
1. `src/web/pages/portal/arc/[slug].tsx` - Added credentials to fetch calls, fixed CRM tab visibility
2. `src/web/pages/portal/arc/project/[projectId].tsx` - Added credentials to fetch calls
3. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx` - Added credentials to fetch calls
4. `src/web/lib/arc/unified-state.ts` - Fixed to check `option1_crm_unlocked` and approval status
5. `src/web/pages/portal/arc/index.tsx` - Added Live Leaderboards section

### New Files:
1. `src/web/pages/api/portal/arc/live-leaderboards.ts` - New API endpoint for live leaderboards

---

## Test URLs

### Issue 1: follow-status Authentication
**URL:** `https://akarimystic.club/api/portal/arc/follow-status?projectId=a3256fab-bb9f-4f3a-ad60-bfc28e12dd46`

**Expected (logged in):**
```json
{
  "ok": true,
  "verified": false
}
```
Status: `200`

**Expected (not logged in):**
```json
{
  "ok": false,
  "error": "Not authenticated",
  "reason": "not_authenticated"
}
```
Status: `401`

### Issue 2: CRM Tab on Project Hub
**URL:** `https://akarimystic.club/portal/arc/mysticheroes`

**Expected:**
- CRM tab appears in tab navigation when:
  - Project is approved
  - `option1_crm_unlocked = true`
  - User has canWrite permission (super_admin/owner/admin/moderator)
- Tab shows "Creator Manager" label
- Clicking tab shows campaigns list and management UI

### Issue 3: Live Leaderboards on ARC Home
**URL:** `https://akarimystic.club/portal/arc`

**Expected:**
- "Live Leaderboards" section appears after header
- Shows cards for active arenas (up to 15)
- Each card shows:
  - Arena name
  - Project name
  - X handle (if available)
  - Creator count
  - "View Project" and "View Arena" buttons
- Only shows arenas where project has Option 2 unlocked
- Links work correctly

---

## Notes

- All changes maintain backward compatibility
- No database schema changes
- No changes to heatmap/treemap code
- Access gates properly enforced
- Response shapes match requirements

