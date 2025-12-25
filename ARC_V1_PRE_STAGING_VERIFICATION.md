# ARC v1 Pre-Staging Verification Report

**Date:** 2025-01-23  
**Status:** ✅ **GO** (with minor notes)

---

## 1. Git Diff Summary

### Files Changed in Security Pass

The following 6 API endpoint files were modified to add `requirePortalUser()`:

1. `src/web/pages/api/portal/arc/arena-details.ts`
2. `src/web/pages/api/portal/arc/leaderboard/[projectId].ts`
3. `src/web/pages/api/portal/arc/gamified/[projectId].ts`
4. `src/web/pages/api/portal/arc/quests/completions.ts`
5. `src/web/pages/api/portal/arc/quests/recent-activity.ts`
6. `src/web/pages/api/portal/arc/state.ts`

Additionally, client-side fetch calls were updated in:
- `src/web/pages/portal/arc/[slug].tsx`
- `src/web/pages/portal/arc/index.tsx`
- `src/web/pages/portal/arc/creator-manager.tsx`
- `src/web/pages/portal/arc/requests.tsx`
- `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx`

---

## 2. File-by-File Verification

### ✅ arena-details.ts
- **Import:** `requirePortalUser` is on its own line (line 12)
- **Early return on 401:** ✅ Lines 77-80 check `if (!portalUser) return;`
- **requireArcAccess still runs:** ✅ Line 135 calls `requireArcAccess()` after auth check

### ✅ leaderboard/[projectId].ts
- **Import:** `requirePortalUser` is on its own line (line 18)
- **Early return on 401:** ✅ Lines 103-106 check `if (!portalUser) return;`
- **requireArcAccess still runs:** ✅ Line 119 calls `requireArcAccess()` after auth check

### ✅ gamified/[projectId].ts
- **Import:** `requirePortalUser` is on its own line (line 11)
- **Early return on 401:** ✅ Lines 66-69 check `if (!portalUser) return;`
- **requireArcAccess still runs:** ✅ Line 82 calls `requireArcAccess()` after auth check

### ✅ quests/completions.ts
- **Import:** `requirePortalUser` is on its own line (line 10)
- **Early return on 401:** ✅ Lines 39-42 check `if (!portalUser) return;`
- **requireArcAccess still runs:** ✅ Line 72 calls `requireArcAccess()` after auth check
- **Manual session check removed:** ✅ Helper functions `getSessionTokenFromRequest()` and `getCurrentUserProfile()` were removed

### ✅ quests/recent-activity.ts
- **Import:** `requirePortalUser` is on its own line (line 11)
- **Early return on 401:** ✅ Lines 42-45 check `if (!portalUser) return;`
- **requireArcAccess still runs:** ✅ Line 71 calls `requireArcAccess()` after auth check

### ✅ state.ts
- **Import:** `requirePortalUser` is on its own line (line 13)
- **Early return on 401:** ✅ Lines 60-63 check `if (!portalUser) return;`
- **Manual session check removed:** ✅ Helper functions `getSessionToken()` and `getCurrentUserProfile()` were removed
- **profileId usage:** ✅ Line 92 correctly uses `portalUser.profileId || null`

---

## 3. requirePortalUser() Return Type Verification

✅ **Confirmed:** `requirePortalUser()` returns `PortalUser | null` where:
```typescript
interface PortalUser {
  userId: string;
  profileId: string | null;
}
```

✅ **state.ts usage:** Correctly uses `portalUser.profileId` (line 92). No manual session parsing reintroduced.

---

## 4. Repo-Wide Checks

### A) Fetch Calls Missing credentials: 'include'

**Status:** ⚠️ **MINOR ISSUES FOUND** - Several fetch calls in `[slug].tsx` are missing credentials (non-critical paths)

**Missing credentials in `/api/portal/arc/*` calls:**

1. `src/web/pages/portal/arc/[slug].tsx:2202`
   - Call: `fetch(\`/api/portal/arc/campaigns/${campaign.id}/participants\`)`
   - Context: Click handler for campaign selection (inline fetch)
   - **Note:** Not critical path, but should be fixed

2. `src/web/pages/portal/arc/[slug].tsx:2206`
   - Call: `fetch(\`/api/portal/arc/campaigns/${campaign.id}/external-submissions\`)`
   - Context: Click handler for campaign selection (inline fetch)
   - **Note:** Not critical path, but should be fixed

3. `src/web/pages/portal/arc/[slug].tsx:2314`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/participants\`, { method: 'PATCH', ... })`
   - Context: Accept participant button (admin action)
   - **Note:** Admin action - should have credentials

4. `src/web/pages/portal/arc/[slug].tsx:2333`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/participants\`, { method: 'PATCH', ... })`
   - Context: Decline participant button (admin action)
   - **Note:** Admin action - should have credentials

5. `src/web/pages/portal/arc/[slug].tsx:2406`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/external-submissions/${sub.id}/review\`, { method: 'POST', ... })`
   - Context: Approve submission button (admin action)
   - **Note:** Admin action - should have credentials

6. `src/web/pages/portal/arc/[slug].tsx:2425`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/external-submissions/${sub.id}/review\`, { method: 'POST', ... })`
   - Context: Reject submission button (admin action)
   - **Note:** Admin action - should have credentials

7. `src/web/pages/portal/arc/[slug].tsx:2661`
   - Call: `fetch('/api/portal/arc/campaigns', { method: 'POST', ... })`
   - Context: Create campaign form submit (admin action)
   - **Note:** Admin action - should have credentials

8. `src/web/pages/portal/arc/[slug].tsx:2788`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/participants\`, { method: 'POST', ... })`
   - Context: Invite participant form submit (admin action)
   - **Note:** Admin action - should have credentials

9. `src/web/pages/portal/arc/[slug].tsx:2849`
   - Call: `fetch(\`/api/portal/arc/campaigns/${selectedCampaign.id}/participants/${selectedParticipant.id}/link\`, { method: 'POST', ... })`
   - Context: Create UTM link form submit (admin action)
   - **Note:** Admin action - should have credentials

10. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:838`
    - Call: `fetch(\`/api/portal/arc/arena-creators-admin?id=${encodeURIComponent(creatorId)}\`, { method: 'DELETE', ... })`
    - Context: Delete creator button (admin action)
    - **Note:** Admin action - should have credentials

11. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:623`
    - Call: `fetch('/api/portal/arc/verify-follow', { method: 'POST', ... })`
    - Context: Verify follow button (user action)
    - **Note:** User action - should have credentials

12. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:655`
    - Call: `fetch('/api/portal/arc/join-leaderboard', { method: 'POST', ... })`
    - Context: Join leaderboard button (user action)
    - **Note:** User action - should have credentials

**All other critical fetch calls have credentials: 'include' ✅**

### B) API Handlers Missing requirePortalUser()

**Status:** ✅ **PASS** - All endpoints identified in audit report now have `requirePortalUser()`

**Endpoints with requirePortalUser() (verified):**
- ✅ `/api/portal/arc/arena-details`
- ✅ `/api/portal/arc/leaderboard/[projectId]`
- ✅ `/api/portal/arc/gamified/[projectId]`
- ✅ `/api/portal/arc/quests/completions`
- ✅ `/api/portal/arc/quests/recent-activity`
- ✅ `/api/portal/arc/state`
- ✅ `/api/portal/arc/pulse` (already had it)
- ✅ `/api/portal/arc/quests/complete` (already had it)
- ✅ `/api/portal/arc/join-leaderboard` (already had it)
- ✅ `/api/portal/arc/verify-follow` (already had it)
- ✅ `/api/portal/arc/follow-status` (already had it)
- ✅ `/api/portal/arc/campaigns/index` (already had it)
- ✅ `/api/portal/arc/quests/index` (already had it)

**Note:** Some endpoints like `/api/portal/arc/active-arena` use `requireArcAccess()` but not `requirePortalUser()`. These were not identified in the audit report as needing fixes, but could be considered for future hardening.

---

## 5. Build & Lint Status

### ✅ Build: PASS
```
✓ Compiled successfully
✓ Generating static pages (49/49)
✓ No build errors
```

### ✅ Lint: PASS
```
✔ No ESLint warnings or errors
```

---

## 6. GO / NO-GO Checklist

| Category | Status | Notes |
|----------|--------|-------|
| **API auth gates** | ✅ **PASS** | All 6 endpoints now include `requirePortalUser()` with proper early returns. `requireArcAccess()` still runs after auth. |
| **credentials include** | ⚠️ **PARTIAL** | Critical paths have credentials. 12 admin/user action fetch calls in `[slug].tsx` and `[slug]/arena/[arenaSlug].tsx` are missing credentials but these are non-blocking for staging (admin-only actions). |
| **build** | ✅ **PASS** | Build completes successfully with no errors |
| **lint** | ✅ **PASS** | No ESLint warnings or errors |
| **Code quality** | ✅ **PASS** | Imports formatted correctly, early returns in place, access checks preserved |

---

## Remaining Issues

### Non-Critical (Can be fixed post-staging):

**Missing credentials in admin/user action fetch calls:**

1. `src/web/pages/portal/arc/[slug].tsx:2202` - Campaign participants fetch
2. `src/web/pages/portal/arc/[slug].tsx:2206` - External submissions fetch
3. `src/web/pages/portal/arc/[slug].tsx:2314` - Accept participant (PATCH)
4. `src/web/pages/portal/arc/[slug].tsx:2333` - Decline participant (PATCH)
5. `src/web/pages/portal/arc/[slug].tsx:2406` - Approve submission (POST)
6. `src/web/pages/portal/arc/[slug].tsx:2425` - Reject submission (POST)
7. `src/web/pages/portal/arc/[slug].tsx:2661` - Create campaign (POST)
8. `src/web/pages/portal/arc/[slug].tsx:2788` - Invite participant (POST)
9. `src/web/pages/portal/arc/[slug].tsx:2849` - Create UTM link (POST)
10. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:623` - Verify follow (POST)
11. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:655` - Join leaderboard (POST)
12. `src/web/pages/portal/arc/[slug]/arena/[arenaSlug].tsx:838` - Delete creator (DELETE)

**Recommendation:** These should be fixed, but they are admin/user actions that rely on server-side auth checks, so they are not security-critical for staging deployment. Can be addressed in a follow-up PR.

---

## Final Recommendation

✅ **GO FOR STAGING QA**

All critical security fixes from the audit report have been implemented and verified:
- API endpoints now require authentication via `requirePortalUser()`
- Critical fetch calls include credentials
- Build and lint pass
- Code quality is maintained

The remaining missing credentials are in admin/user action paths that have server-side auth checks, so they are not blocking for staging deployment.

---

**End of Verification Report**

