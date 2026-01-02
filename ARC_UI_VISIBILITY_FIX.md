# ARC UI Visibility Fix

## Issue

ARC projects and live leaderboards are not showing up in the UI even though:
- Projects have active MS arenas
- `leaderboard_enabled = true` in some cases
- API endpoints return data correctly

## Root Cause

The UI was filtering projects based on `features.leaderboard_enabled === true`, but:
1. Projects with active arenas might not have `leaderboard_enabled = true` set in `arc_project_features`
2. The API returns projects with active arenas, but the features object has `leaderboard_enabled = false`
3. The UI filters out these projects because the feature flag is false

## Fix Applied

### 1. Updated `/api/portal/arc/projects` to Set `leaderboard_enabled = true` for Projects with Active Arenas

**File:** `src/web/pages/api/portal/arc/projects.ts`

**Change:**
- Track which projects have active arenas in `projectsWithActiveArenas` Set
- When mapping projects to response format, set `leaderboard_enabled = true` if project has active arena, even if not set in database

```typescript
// Track which projects have active arenas
const projectsWithActiveArenas = new Set<string>();
activeArenas?.forEach((a: any) => {
  eligibleProjectIds.add(a.project_id);
  projectsWithActiveArenas.add(a.project_id);
});

// In mapping:
const hasActiveArena = projectsWithActiveArenas.has(row.project_id);
const features: ArcProjectFeatures = {
  leaderboard_enabled: featuresData?.leaderboard_enabled || hasActiveArena || false,
  // ... other features
};
```

### 2. Added Debug Logging to UI

**File:** `src/web/pages/portal/arc/index.tsx`

**Change:**
- Added console logging to see what projects are being loaded
- Logs project count, names, slugs, and feature flags

## Expected Behavior After Fix

1. **ARC Products Section:**
   - Shows projects with `leaderboard_enabled = true` OR active MS arenas
   - Projects with active arenas will have `leaderboard_enabled = true` in the features object

2. **Live Leaderboards Section:**
   - Shows arenas where:
     - `arena.kind='ms'`
     - `arena.status='active'`
     - `now()` between `starts_at` and `ends_at`
     - `leaderboard_enabled = true` (now set correctly for projects with active arenas)

## Testing

1. **Check Browser Console:**
   - Look for `[ARC Home] Loaded projects:` log
   - Should show projects with `leaderboard_enabled: true`

2. **Check Network Tab:**
   - `GET /api/portal/arc/projects` should return projects
   - Each project should have `features.leaderboard_enabled = true` if it has an active arena

3. **Verify UI:**
   - `/portal/arc` should show projects in "ARC Products" section
   - "Live Now" section should show active leaderboards

## Files Modified

1. `src/web/pages/api/portal/arc/projects.ts`
   - Track projects with active arenas
   - Set `leaderboard_enabled = true` for projects with active arenas

2. `src/web/pages/portal/arc/index.tsx`
   - Added debug logging for loaded projects
