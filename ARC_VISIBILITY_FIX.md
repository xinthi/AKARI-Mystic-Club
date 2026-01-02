# ARC Visibility Logic Fix

## Issue Summary

ARC projects and live MS leaderboards were not appearing in the UI even though:
- `arc_project_features.leaderboard_enabled = true`
- Active MS arena exists (status='active', now between starts_at and ends_at)
- `/api/portal/arc/projects` was returning empty array
- ARC UI showed "No active ARC projects" and "No active leaderboards"

## Root Causes

1. **Over-filtering in `/api/portal/arc/projects`:**
   - Only returned projects where ALL features were checked (leaderboard_enabled OR gamefi_enabled OR crm_enabled)
   - Did not include projects with active arenas or approved requests
   - Required `arc_project_features` row to exist

2. **Live leaderboard visibility rules too strict:**
   - Required `arc_project_access.application_status = 'approved'`
   - Required at least one feature enabled (leaderboard_enabled OR gamefi_enabled OR crm_enabled)
   - Should only require `leaderboard_enabled = true` for MS arenas
   - Request status should NOT block live visibility

3. **productType normalization:**
   - UI labels like "Mindshare Leaderboard" must map to canonical "ms"
   - Request form already handles this correctly

## Fixes Applied

### 1. Fixed `/api/portal/arc/projects` Query Logic

**Before:**
- Only returned projects with approved access AND at least one feature enabled
- Required `arc_project_features` row to exist

**After:**
- Returns projects if ANY of the following is true:
  - `leaderboard_enabled = true` (in `arc_project_features`)
  - OR active MS arena exists (status IN ('active','live'), kind IN ('ms','legacy_ms'), now between starts_at and ends_at)
  - OR approved leaderboard request exists (`arc_leaderboard_requests.status='approved'`)
- Base requirements still apply:
  - `is_arc_company = true`
  - `arc_project_access.application_status = 'approved'` (for approved requests check)

**File:** `src/web/pages/api/portal/arc/projects.ts`

### 2. Fixed Live Leaderboard Visibility Rules

**Before:**
- Required `arc_project_access.application_status = 'approved'`
- Required at least one feature enabled (leaderboard_enabled OR gamefi_enabled OR crm_enabled)

**After:**
- Live leaderboard renders if:
  - `arena.kind='ms'` (already filtered in `fetchArenas`)
  - `arena.status='active'` (already filtered in `fetchArenas`)
  - `now()` between `starts_at` and `ends_at` (already filtered in `fetchArenas`)
  - `leaderboard_enabled = true` (check here)
- Request status does NOT block live visibility (no approval check needed)

**File:** `src/web/lib/arc/live-upcoming.ts`

### 3. productType Normalization

**Status:** ✅ Already correct

- UI labels map to canonical values:
  - "Mindshare Leaderboard" → `'ms'`
  - "Quest Leaderboard" → `'gamefi'`
  - "Creator Hub" → `'crm'`
- Request form sends `productType` in request body
- API validates `productType` must be one of: `'ms'`, `'gamefi'`, `'crm'`

**Files:**
- `src/web/pages/portal/arc/requests.tsx` (maps UI labels to API values)
- `src/web/pages/api/portal/arc/leaderboard-requests.ts` (validates productType)

### 4. Request Submission

**Status:** ✅ Already correct

- Frontend always sends `projectId` as UUID (validated in form)
- Frontend always sends `productType` (mapped from `selectedAccessLevel`)
- API validates UUID format and productType enum

**Files:**
- `src/web/pages/portal/arc/requests.tsx` (sends projectId UUID and productType)
- `src/web/pages/api/portal/arc/leaderboard-requests.ts` (validates both)

### 5. current-ms-arena Endpoint

**Status:** ✅ Already correct

- Endpoint validates UUID format: `/api/portal/arc/projects/[projectId]/current-ms-arena`
- Frontend hooks use `projectId` (UUID) not slug
- `useCurrentMsArena` hook accepts `projectId: string | null`

**Files:**
- `src/web/pages/api/portal/arc/projects/[projectId]/current-ms-arena.ts` (validates UUID)
- `src/web/lib/arc/hooks.ts` (uses projectId)
- `src/web/lib/arc/api.ts` (calls endpoint with projectId)

## Testing Checklist

- [ ] `/api/portal/arc/projects` returns projects with:
  - `leaderboard_enabled = true` OR
  - Active MS arena OR
  - Approved leaderboard request
- [ ] `/portal/arc` shows projects in "ARC Products" section
- [ ] Live leaderboards appear in "Live Now" section when:
  - Arena status='active'
  - Arena kind='ms'
  - Now between starts_at and ends_at
  - leaderboard_enabled = true
- [ ] Request form sends `projectId` (UUID) and `productType='ms'`
- [ ] `current-ms-arena` endpoint accepts and validates UUID
- [ ] `alignerzlabs` project appears in `/portal/arc` and shows live leaderboard

## Files Modified

1. `src/web/pages/api/portal/arc/projects.ts`
   - Changed filtering logic to include projects with active arenas or approved requests
   - Removed final filter that required at least one feature enabled

2. `src/web/lib/arc/live-upcoming.ts`
   - Changed arena visibility check to only require `leaderboard_enabled = true`
   - Removed approval check requirement
   - Removed requirement for other features (gamefi_enabled, crm_enabled)

## Expected Behavior After Fix

1. **Projects List (`/api/portal/arc/projects`):**
   - Returns all projects that have:
     - Approved ARC access AND
     - (`leaderboard_enabled = true` OR active MS arena OR approved request)
   - No longer requires all features to be checked

2. **Live Leaderboards:**
   - Shows arenas where:
     - `arena.kind='ms'`
     - `arena.status='active'`
     - `now()` between `starts_at` and `ends_at`
     - `leaderboard_enabled = true`
   - Does NOT require approval status check

3. **Request Submission:**
   - Always sends `projectId` as UUID
   - Always sends `productType='ms'` for Mindshare Leaderboard
   - No more "invalid_product_type" errors
