# ARC Route Access Fix

## Summary

Fixed two issues:
1. **UI Route Protection**: `/portal/arc` routes were incorrectly gated by "seer" tier instead of ARC access
2. **Live Leaderboards**: `current-ms-arena` endpoint was only filtering by `status='active'`, missing arenas with `status='paused'`

## Changes Made

### 1. Route Protection Updates

#### Created New Helper: `src/web/lib/server/require-arc-access.ts`
- `hasAnyApprovedArcAccess(userId)`: Checks if user is superadmin OR any portal user (if any project has approved ARC access)
- `hasApprovedArcAccessForProject(userId, projectId)`: Checks if user is superadmin OR project has approved ARC access
- `requireArcAccessRoute(context, route, projectId?)`: Server-side route protection helper

**Access Rules:**
- `/portal/arc`: Allow superadmin OR any portal user (if any project has approved ARC access)
- `/portal/arc/[projectSlug]`: Allow superadmin OR approved access for that project
- `/portal/arc/admin/[projectSlug]`: Already correct - uses `checkProjectPermissions` (superadmin OR project admin/owner roles)

#### Updated Pages:
- `src/web/pages/portal/arc/index.tsx`: Replaced `requireArcTier` with `requireArcAccessRoute`
- `src/web/pages/portal/arc/[projectSlug].tsx`: Added `getServerSideProps` to check project-specific ARC access

### 2. Live Leaderboards Fix

#### Updated: `src/web/pages/api/portal/arc/projects/[projectId]/current-ms-arena.ts`

**Changes:**
1. **Status Filtering**: Changed from `status='active'` to `status IN ('active', 'paused')`
   - Arenas can be paused but still "current" if they're within the live timeframe
   
2. **Diagnostic Logging**: Added comprehensive logging:
   - Status counts for all arenas
   - Latest 3 arenas with full details (id, kind, status, starts_at, ends_at)
   - Selected arena details
   - All counts (live_count, active_count, paused_count, live_active_count)

3. **Debug Response**: Enhanced debug object in API response:
   ```typescript
   debug: {
     live_active_count: number,
     live_count: number,
     active_count: number,
     paused_count: number,
     status_counts: Record<string, number>,
     latest_arenas: Array<{id, kind, status, starts_at, ends_at}>
   }
   ```

**Query Logic:**
- Fetches arenas with `status IN ('active', 'paused')` and `starts_at <= now()`
- Filters in JavaScript for live timeframe: `ends_at IS NULL OR ends_at > now()`
- Filters by kind: `kind IN ('ms', 'legacy_ms')`
- Sorts by priority: `kind='ms'` first, then `kind='legacy_ms'`, then `updated_at DESC`
- Returns the first match (LIMIT 1)

## Testing

### Route Protection
1. **Test `/portal/arc`**:
   - Should allow any logged-in portal user (if any project has approved ARC access)
   - Should redirect non-portal users to `/portal?error=access_denied`
   - Superadmins should always have access

2. **Test `/portal/arc/[projectSlug]`**:
   - Should allow access if project has approved ARC access
   - Should redirect if project doesn't have approved access
   - Superadmins should always have access

3. **Test `/portal/arc/admin/[projectSlug]`**:
   - Should allow superadmin OR project admin/owner/moderator roles
   - Should show access error for other users

### Live Leaderboards
1. **Test `GET /api/portal/arc/projects/<projectId>/current-ms-arena`**:
   - Should return arena if one exists with `status IN ('active', 'paused')` and live timeframe
   - Should return `null` if no current arena exists
   - Check debug response for diagnostic info:
     - `status_counts`: Should show counts by status
     - `latest_arenas`: Should show latest 3 arenas
     - `live_count`: Should match arenas in live timeframe
     - `active_count`: Should match arenas with `status='active'`
     - `paused_count`: Should match arenas with `status='paused'`

2. **Verify Live List**:
   - `/portal/arc` should show "Live Now" section when arenas exist
   - Clicking on a live arena should not result in 403 errors
   - Arena detail pages should load correctly

## Files Changed

1. `src/web/lib/server/require-arc-access.ts` (NEW)
2. `src/web/pages/portal/arc/index.tsx`
3. `src/web/pages/portal/arc/[projectSlug].tsx`
4. `src/web/pages/api/portal/arc/projects/[projectId]/current-ms-arena.ts`

## Migration Notes

- No database migrations required
- Route protection changes are backward compatible (dev mode still allows access)
- API response includes additional debug fields (non-breaking)
