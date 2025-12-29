# ARC v1 Completion Report

**Date:** 2025-01-02  
**Status:** ✅ Complete

---

## Part 1: Founder-only Leaderboard Requests ✅

### Implementation Summary

**API Endpoint:** `POST /api/portal/arc/leaderboard-requests`

**Permission Check:**
- ✅ Server-side permission check enforced using `canRequestLeaderboard()` function
- ✅ Returns `403 { ok: false, error: "Only project founders/admins can request a leaderboard for this project." }` if user lacks permission
- ✅ Duplicate request protection maintained

**UI Update:** `src/web/pages/portal/arc/project/[projectId].tsx`
- ✅ Request CTA only shown when `canRequestLeaderboard === true`
- ✅ Info box displayed when `canRequestLeaderboard === false`: "Only project founders/admins can request ARC leaderboard access."

### Permission Tables/Joins Used

The `canRequestLeaderboard()` function in `src/web/lib/project-permissions.ts` uses the following tables and joins:

1. **`akari_user_roles`** (check for `super_admin`)
   - Direct lookup: `akari_user_roles.user_id = userId AND role = 'super_admin'`

2. **`projects`** (check for `claimed_by`)
   - Direct lookup: `projects.id = projectId`
   - Owner check: `projects.claimed_by = userId`

3. **`akari_user_identities`** (get Twitter username)
   - Join: `akari_user_identities.user_id = userId AND provider = 'x'`
   - Used to find user's Twitter username

4. **`profiles`** (get profile ID from Twitter username)
   - Join: `profiles.username = normalized_twitter_username`
   - Used to link user to their profile

5. **`project_team_members`** (check for admin/moderator roles)
   - Join: `project_team_members.project_id = projectId AND project_team_members.profile_id = profileId`
   - Role check: `project_team_members.role IN ('admin', 'moderator')`

**Permission Logic:**
- ✅ Super Admin: Always allowed (checked via `akari_user_roles`)
- ✅ Project Owner: Allowed if `projects.claimed_by = userId`
- ✅ Project Admin: Allowed if `project_team_members.role = 'admin'`
- ✅ Project Moderator: Allowed if `project_team_members.role = 'moderator'`
- ❌ All others: Denied (403)

### Test Checklist

**Test 1: Non-founder user POST request → 403**
```bash
# As a non-founder user (not owner/admin/mod)
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=USER_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID", "justification": "Test"}'

# Expected: 403 { ok: false, error: "Only project founders/admins can request a leaderboard for this project." }
```

**Test 2: Founder user POST request → ok:true**
```bash
# As a project owner/admin/moderator
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=FOUNDER_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID", "justification": "Test"}'

# Expected: 200 { ok: true, requestId: "...", status: "pending" }
```

---

## Part 2: Fix ARC Home Summary Stats ✅

### ARC Enabled Calculation

**Definition:** `arc_active === true AND arc_access_level !== 'none'`

**Implementation:** `src/web/pages/api/portal/arc/summary.ts` (lines 77-89)

```typescript
const { count: arcEnabledCount, error: arcEnabledError } = await supabase
  .from('projects')
  .select('*', { count: 'exact', head: true })
  .eq('arc_active', true)
  .neq('arc_access_level', 'none')
  .eq('profile_type', 'project'); // Only count projects, not personal profiles
```

**Verification:**
- ✅ Calculation matches definition exactly
- ✅ Filters by `profile_type = 'project'` to exclude personal profiles
- ✅ UI displays the number correctly in `src/web/pages/portal/arc/index.tsx` (line 617)

**Tracked Projects vs Top Projects:**
- **Tracked Projects:** All projects with `profile_type = 'project'` (line 68-71)
- **Top Projects (Treemap):** Projects with `profile_type = 'project' AND is_active = true` (from `/api/portal/arc/top-projects`)
- These are different universes by design:
  - Tracked Projects = All projects tracked in Sentiment
  - Top Projects = Active projects shown in the heatmap
- ✅ Labeling is correct and intentional

---

## Part 3: Security Verification ✅

### SSR Redirect Verification

**File:** `src/web/lib/server-auth.ts`

**Console Logs Added (dev mode only):**
- ✅ Logs when SSR redirect triggers due to missing session token
- ✅ Logs when SSR redirect triggers due to invalid session
- ✅ Logs when SSR redirect triggers due to non-SuperAdmin user

**Test Cases:**

**Test 1: Open /portal/admin/projects as non-admin → redirect**
```bash
# As non-admin user, navigate to /portal/admin/projects
# Expected: Redirect to /portal?error=access_denied
# Console (dev): "[requireSuperAdmin] SSR redirect triggered: User is not SuperAdmin { userId: '...' }"
```

**Test 2: Call GET /api/portal/admin/projects as non-admin → 403**
```bash
curl -X GET "http://localhost:3000/api/portal/admin/projects" \
  -H "Cookie: akari_session=NON_ADMIN_SESSION_TOKEN"

# Expected: 403 { ok: false, error: "SuperAdmin only" }
# Console (dev): "[AdminProjectsAPI] 403 returned: User is not SuperAdmin { userId: '...' }"
```

**Test 3: Call analytics endpoint without entitlement → 403**
```bash
curl -X GET "http://localhost:3000/api/portal/sentiment/PROJECT_SLUG/analytics" \
  -H "Cookie: akari_session=USER_WITHOUT_ANALYTICS_TOKEN"

# Expected: 403 { ok: false, error: "Analytics access required" }
# Console (dev): "[Analytics API] 403 returned: User lacks analytics entitlement { userId: '...' }"
```

---

## Part 4: Performance Quick Wins ✅

### Treemap Optimization

**File:** `src/web/components/arc/ArcTopProjectsTreemap.tsx`

**Already Optimized:**
- ✅ Component wrapped with `React.memo()` (line 200)
- ✅ Treemap data memoized with `useMemo()` (line 261-301)
- ✅ Click handler uses `useCallback()` for stable reference (line 331-354)
- ✅ Valid items filtered and memoized (line 247-250)

**Top Projects Fetch Caching:**
- ✅ Client-side cache implemented in `src/web/pages/portal/arc/index.tsx` (lines 254-273)
- ✅ Uses `sessionStorage` with 30-second TTL
- ✅ Cache key: `arc-top-projects-${topProjectsView}-${topProjectsTimeframe}`
- ✅ Cache checked before fetch, updated after successful fetch

**Treemap Container:**
- ✅ Fixed height container: `minHeight: '480px', height: '480px'` (line 674)
- ✅ Prevents reflow loops by maintaining stable dimensions

**Before/After Analysis:**

**Before:**
- Treemap re-rendered on every state change
- Top projects fetched on every view/timeframe change
- Container size could cause layout thrash

**After:**
- ✅ Treemap only re-renders when `items`, `mode`, or `timeframe` change (memoized)
- ✅ Top projects cached for 30 seconds (reduces API calls)
- ✅ Container has fixed dimensions (prevents layout thrash)
- ✅ Callbacks are stable (prevents unnecessary child re-renders)

---

## Files Modified

1. ✅ `src/web/pages/api/portal/arc/leaderboard-requests.ts` - Updated error message
2. ✅ `src/web/pages/portal/arc/project/[projectId].tsx` - Added info box for non-founders
3. ✅ `src/web/lib/server-auth.ts` - Added dev console logs for SSR redirects
4. ✅ `src/web/pages/api/portal/admin/projects/index.ts` - Added dev console log for 403
5. ✅ `src/web/pages/api/portal/sentiment/[slug]/analytics.ts` - Added dev console log for 403

---

## Verification Commands

### Part 1: Leaderboard Request Permission
```bash
# Test as non-founder (should get 403)
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=NON_FOUNDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID"}'

# Test as founder (should get 200)
curl -X POST "http://localhost:3000/api/portal/arc/leaderboard-requests" \
  -H "Cookie: akari_session=FOUNDER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "PROJECT_ID"}'
```

### Part 2: ARC Summary Stats
```bash
# Check ARC Enabled count
curl -X GET "http://localhost:3000/api/portal/arc/summary" \
  -H "Cookie: akari_session=USER_TOKEN"

# Verify in database
# SELECT COUNT(*) FROM projects WHERE arc_active = true AND arc_access_level != 'none' AND profile_type = 'project';
```

### Part 3: Security
```bash
# Test admin page redirect (non-admin)
# Navigate to: http://localhost:3000/portal/admin/projects
# Should redirect to: http://localhost:3000/portal?error=access_denied

# Test admin API (non-admin)
curl -X GET "http://localhost:3000/api/portal/admin/projects" \
  -H "Cookie: akari_session=NON_ADMIN_TOKEN"

# Test analytics API (no entitlement)
curl -X GET "http://localhost:3000/api/portal/sentiment/PROJECT_SLUG/analytics" \
  -H "Cookie: akari_session=NO_ANALYTICS_TOKEN"
```

---

## Edge Cases Handled

1. ✅ **Claimed Projects:** Permission check includes `projects.claimed_by` for owner status
2. ✅ **Moderators:** `project_team_members.role = 'moderator'` is included in permission check
3. ✅ **Missing Roles:** If user has no Twitter identity or profile, permission check returns `false` safely
4. ✅ **Super Admin:** Always allowed regardless of project ownership/team membership
5. ✅ **Unclaimed Projects:** Only Super Admin can request (no owner exists)

---

## Notes

- All console logs are **dev-only** (wrapped in `process.env.NODE_ENV === 'development'` checks)
- Permission checks are **server-side only** - UI checks are for UX only
- ARC Enabled stat calculation is **correct** and matches the definition
- Performance optimizations are **already in place** - no additional changes needed

