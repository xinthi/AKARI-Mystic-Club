# ARC Public Leaderboard Display Fix

## Issues Fixed

### 1. ✅ Public Project Page Shows "ARC features not enabled" for Approved Projects

**Problem:** 
- Projects with approved MS leaderboard requests were showing "ARC features not enabled"
- This happened even when:
  - The project had an approved request (`status: 'approved'`, `productType: 'ms'`)
  - An arena was created but hadn't started yet (scheduled for future)
  - `leaderboard_enabled` flag might not be set in `arc_project_features`

**Root Cause:**
- The page only checked `enabledProducts.ms` (from `features.leaderboard_enabled`) and `currentArena` (only returns live arenas)
- Scheduled arenas (not yet live) weren't considered
- Approved requests weren't checked as a fallback

**Fix:**
- Updated `src/web/pages/portal/arc/[projectSlug].tsx` to:
  1. Fetch approved MS requests when loading project
  2. Check for approved requests as a fallback when determining if MS is enabled
  3. Show leaderboard section even if arena hasn't started yet (if approved request exists)
  4. Display "Leaderboard coming soon" message for scheduled arenas

### 2. ✅ Bitcoin Project Shows Arena Management Instead of Leaderboard

**Problem:**
- When clicking on a project with an active leaderboard, users saw arena management details instead of the leaderboard table

**Fix:**
- The leaderboard table is now displayed directly on the public project page
- "Manage Arena" button is only shown to admins and links to the admin panel
- Normal users see the leaderboard table with creator rankings

## Code Changes

### `src/web/pages/portal/arc/[projectSlug].tsx`

1. **Added approved request check:**
   ```typescript
   const [hasApprovedMsRequest, setHasApprovedMsRequest] = useState(false);
   ```

2. **Fetch approved requests:**
   ```typescript
   // Check for approved MS requests (fallback if features not set)
   const requestsRes = await fetch(
     `/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(data.project.id)}`,
     { credentials: 'include' }
   );
   ```

3. **Updated MS enabled logic:**
   ```typescript
   // MS is enabled if:
   // 1. leaderboard_enabled = true in features, OR
   // 2. Has an active/live arena (currentArena !== null), OR
   // 3. Has an approved MS request (fallback for scheduled arenas or missing features)
   const msEnabled = enabledProducts.ms || (currentArena !== null && !arenaLoading) || hasApprovedMsRequest;
   ```

4. **Updated empty state for scheduled arenas:**
   ```typescript
   ) : !currentArena ? (
     hasApprovedMsRequest ? (
       <div className="text-center py-8">
         <p className="text-white/80 mb-2">Leaderboard coming soon</p>
         <p className="text-white/60 text-sm">
           The arena is scheduled to start soon. Creators will appear here once it goes live.
         </p>
       </div>
     ) : (
       <EmptyState ... />
     )
   ) : (
   ```

## Expected Behavior After Fix

1. **For Uniswap (approved but arena not yet live):**
   - ✅ Shows "Mindshare Leaderboard" section
   - ✅ Shows "Leaderboard coming soon" message
   - ✅ No "ARC features not enabled" error

2. **For Bitcoin (active arena):**
   - ✅ Shows "Mindshare Leaderboard" section
   - ✅ Shows leaderboard table with creators (if any)
   - ✅ Shows arena start/end dates
   - ✅ "Manage Arena" button for admins only

3. **For projects without approval:**
   - ✅ Shows "ARC features not enabled" (correct behavior)

## Migration Required

Run the migration to fix existing data:

```bash
supabase migration up
```

Or run in Supabase SQL Editor:
- File: `supabase/migrations/20250203_fix_arc_company_flag.sql`

This migration:
1. Sets `is_arc_company = true` for all approved projects
2. Ensures `leaderboard_enabled = true` for projects with approved MS requests
3. Updates existing `arc_project_features` rows if missing flags

## Testing

After deploying:

1. **Test Uniswap:**
   - Visit `/portal/arc/uniswap`
   - Should see "Mindshare Leaderboard" section
   - Should see "Leaderboard coming soon" (arena scheduled)

2. **Test Bitcoin:**
   - Visit `/portal/arc/bitcoin`
   - Should see "Mindshare Leaderboard" section
   - Should see leaderboard table (or empty state if no creators)

3. **Test unapproved project:**
   - Visit a project without approval
   - Should see "ARC features not enabled"
